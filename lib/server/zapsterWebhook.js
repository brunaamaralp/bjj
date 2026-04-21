import { timingSafeEqual } from 'crypto';
import { waitUntil } from '@vercel/functions';
import { Client, Databases, Query } from 'node-appwrite';
import { humanHandoffIsActive } from '../humanHandoffUntil.js';
import {
  safeParseMessages,
  getOrCreateConversationDoc,
  updateConversationWithMerge,
  updateConversationLastDispatchMeta
} from './conversationsStore.js';

/** Aguarda o fetch ao agent/process at\u00e9 este limite para o runtime n\u00e3o cortar antes da conex\u00e3o (Vercel serverless). */
const DISPATCH_WAIT_MS = 2500;

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

const appwriteClient = PROJECT_ID && API_KEY ? new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY) : null;
const databases = appwriteClient ? new Databases(appwriteClient) : null;

if (!String(process.env.INTERNAL_API_SECRET || '').trim()) {
  console.error('[zapsterWebhook] AVISO STARTUP: INTERNAL_API_SECRET ausente');
}
if (!String(process.env.ZAPSTER_TOKEN || process.env.ZAPSTER_API_TOKEN || '').trim()) {
  console.error('[zapsterWebhook] AVISO STARTUP: ZAPSTER_TOKEN / ZAPSTER_API_TOKEN ausente');
}

function safeCompare(a, b) {
  try {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function ensureJson(req, res) {
  const ct = String(req.headers['content-type'] || '');
  if (!ct.includes('application/json')) {
    res.status(400).json({ sucesso: false, erro: 'Content-Type inv\u00e1lido' });
    return false;
  }
  if (!req.body || typeof req.body !== 'object') {
    res.status(400).json({ sucesso: false, erro: 'Body ausente' });
    return false;
  }
  return true;
}

function checkWebhookToken(req, res) {
  const expectedToken = String(process.env.ZAPSTER_WEBHOOK_TOKEN || '').trim();

  const q = String(req.query?.token || '').trim();
  const h = String(req.headers['x-webhook-token'] || '').trim();
  const a = String(req.headers.authorization || '').trim().replace(/^Bearer\s+/i, '');
  const provided = q || h || a;

  if (!expectedToken) {
    console.error('[zapster][webhook] ZAPSTER_WEBHOOK_TOKEN n\u00e3o configurado \u2014 rejeitando');
    res.status(401).json({ error: 'webhook_token_not_configured' });
    return false;
  }

  if (!safeCompare(provided, expectedToken)) {
    console.error('[zapster][webhook] token do webhook inv\u00e1lido \u2014 request rejeitado');
    res.status(401).json({ error: 'invalid_token' });
    return false;
  }
  return true;
}

function extractEventName(body) {
  const v = body?.event || body?.type || body?.name || body?.topic || '';
  return String(v || '').trim();
}

function pickMessageObject(body) {
  if (body?.message && typeof body.message === 'object') return body.message;
  if (body?.data && typeof body.data === 'object') {
    if (body.data.message && typeof body.data.message === 'object') return body.data.message;
    return body.data;
  }
  if (body?.payload && typeof body.payload === 'object') {
    if (body.payload.message && typeof body.payload.message === 'object') return body.payload.message;
    return body.payload;
  }
  return null;
}

function normalizePhone(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  return raw.replace(/[^\d]/g, '');
}

function isGroupId(v) {
  const s = String(v || '').toLowerCase();
  return s.startsWith('group:') || s.includes('@g.us');
}

function extractIncomingText(msg) {
  const type = String(msg?.type || msg?.message?.type || msg?.content?.type || '').toLowerCase();
  const text =
    msg?.content?.text ??
    msg?.text ??
    msg?.message?.text ??
    msg?.message?.content?.text ??
    msg?.data?.text ??
    '';
  const t = String(text || '').trim();
  if (!t) return { type, text: '' };
  return { type, text: t };
}

/** Webhook `message.received` com `data.type === 'image'`: ver exemplos em Zapster "Eventos dispon\u00edveis". */
function extractIncomingImageMedia(msg) {
  const topType = String(msg?.type || '').toLowerCase();
  if (topType !== 'image') return null;
  const content = msg?.content && typeof msg.content === 'object' ? msg.content : {};
  const url = String(content?.media?.url || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const mimeType = String(content?.media?.mimetype || content?.media?.mime_type || 'image/jpeg').trim() || 'image/jpeg';
  return { url, mimeType };
}

function extractMessageId(body, msg) {
  const v = msg?.id || msg?.message?.id || body?.id || body?.message?.id || body?.data?.id || body?.payload?.id || '';
  const id = String(v || '').trim();
  return id || '';
}

function extractInstanceId(body, msg) {
  const v =
    body?.instance_id ||
    body?.instanceId ||
    body?.data?.instance_id ||
    body?.data?.instanceId ||
    body?.payload?.instance_id ||
    body?.payload?.instanceId ||
    msg?.instance_id ||
    msg?.instanceId ||
    msg?.message?.instance_id ||
    msg?.message?.instanceId ||
    '';
  return String(v || '').trim();
}

async function resolveAcademyIdFromInstanceId(instanceId) {
  const inst = String(instanceId || '').trim();

  if (!inst) {
    console.error('[webhook] instanceId sem academia mapeada:', instanceId);
    return '';
  }

  if (!databases || !DB_ID || !ACADEMIES_COL) {
    console.error('[zapster][webhook] Appwrite n\u00e3o configurado \u2014 instanceId sem resolu\u00e7\u00e3o', {
      instanceId: inst
    });
    return '';
  }

  try {
    const list = await databases.listDocuments(DB_ID, ACADEMIES_COL, [
      Query.equal('zapster_instance_id', [inst]),
      Query.limit(1)
    ]);
    const doc = list?.documents?.[0];
    if (doc?.$id) return String(doc.$id);
  } catch (e) {
    console.error('[zapster][webhook] erro ao buscar academia por zapster_instance_id', {
      instanceId: inst,
      erro: e?.message || String(e)
    });
  }

  try {
    const list2 = await databases.listDocuments(DB_ID, ACADEMIES_COL, [
      Query.equal('zapsterInstanceId', [inst]),
      Query.limit(1)
    ]);
    const doc2 = list2?.documents?.[0];
    if (doc2?.$id) return String(doc2.$id);
  } catch (e) {
    console.error('[zapster][webhook] erro ao buscar academia por zapsterInstanceId', {
      instanceId: inst,
      erro: e?.message || String(e)
    });
  }

  console.error('[webhook] instanceId sem academia mapeada:', inst);
  return '';
}

async function getZapsterInstanceIdForAcademy(academyId) {
  const id = String(academyId || '').trim();
  if (!id || !databases || !DB_ID || !ACADEMIES_COL) return '';
  try {
    const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, id);
    if (!doc || String(doc.status || '').trim().toLowerCase() === 'inactive') {
      return null;
    }
    const v = String(doc?.zapster_instance_id || doc?.zapsterInstanceId || '').trim();
    return v || '';
  } catch {
    return '';
  }
}

async function saveInboundMessage({ academyId, academyDoc, phone, text, messageId, messageType = 'text', mediaUrl = null }) {
  const doc = await getOrCreateConversationDoc(phone, academyId, academyDoc);
  if (!doc) return { ok: false, erro: 'Conversa indispon\u00edvel' };

  const history = safeParseMessages(doc.messages);
  const mid = String(messageId || '').trim();
  if (mid) {
    const exists = history.some((m) => m?.role === 'user' && String(m?.message_id || '').trim() === mid);
    if (exists) return { ok: true, duplicate: true, docId: doc.$id };
  }

  const nowIso = new Date().toISOString();
  const mt = String(messageType || 'text').trim().toLowerCase();
  const userMsg = {
    role: 'user',
    content: String(text || '').trim(),
    timestamp: nowIso,
    ...(mid ? { message_id: mid } : {}),
    ...(mt === 'image' && mediaUrl ? { type: 'image', mediaUrl: String(mediaUrl).trim() } : {})
  };
  const up = await updateConversationWithMerge(doc.$id, [userMsg]);
  if (!up.ok) return { ok: false, erro: up.erro || 'Erro ao salvar inbound', docId: doc.$id };
  return { ok: true, duplicate: false, docId: doc.$id };
}

async function isHumanHandoffActive(phone, academyId) {
  const a = String(academyId || '').trim();
  if (!databases || !DB_ID || !CONVERSATIONS_COL || !a) return false;
  const list = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, [
    Query.equal('academy_id', [a]),
    Query.equal('phone_number', [phone]),
    Query.limit(1)
  ]);
  const doc = list.documents && list.documents[0] ? list.documents[0] : null;
  const until = doc && typeof doc.human_handoff_until === 'string' ? doc.human_handoff_until : '';
  return humanHandoffIsActive(until);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ sucesso: false, erro: 'M\u00e9todo n\u00e3o permitido' });
  }
  if (!checkWebhookToken(req, res)) return;
  if (!ensureJson(req, res)) return;

  try {
    const body = req.body || {};
    const event = extractEventName(body);
    const msg = pickMessageObject(body);

    if (!msg) return res.status(200).json({ sucesso: true, ignorado: true });
    if (event !== 'message.received' && event !== 'message:received' && event !== 'message_received' && event !== 'instance.status') {
      return res.status(200).json({ sucesso: true, ignorado: true });
    }

    if (event === 'instance.status') {
      const instanceId = extractInstanceId(body, msg);
      const academyId = await resolveAcademyIdFromInstanceId(instanceId);
      if (!academyId) {
        return res.status(200).json({ received: true, processed: false, reason: 'instance_not_mapped_for_status' });
      }
      const novoStatus = String(body?.status || body?.data?.status || body?.payload?.status || '').trim();
      if (novoStatus === 'offline' || novoStatus === 'disconnected') {
        try {
          // Attempt to record the offline state to alert the owner
          await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
            zapster_status: novoStatus,
            zapster_status_updated_at: new Date().toISOString()
          });
        } catch (e) {
          console.error('[zapster][webhook] erro ao salvar status (collection pode requerer atributo)', e.message);
        }
      }
      return res.status(200).json({ ok: true, sucesso: true, type: 'instance_status_handled' });
    }

    const senderId = msg?.sender?.id || msg?.from || body?.sender?.id || body?.from || '';
    const recipientId = msg?.recipient?.id || msg?.to || body?.recipient?.id || body?.to || '';
    if (isGroupId(senderId) || isGroupId(recipientId)) {
      return res.status(200).json({ sucesso: true, ignorado: true });
    }

    const phone = normalizePhone(senderId);
    if (!phone) return res.status(200).json({ sucesso: true, ignorado: true });

    const name = String(msg?.sender?.name || body?.sender?.name || '').trim();
    const messageId = extractMessageId(body, msg);
    const instanceId = extractInstanceId(body, msg);
    const requestId = String(messageId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    const academyId = await resolveAcademyIdFromInstanceId(instanceId);
    if (!academyId) {
      return res.status(200).json({
        received: true,
        processed: false,
        reason: 'instance_not_mapped',
        instanceId: instanceId || null,
        requestId
      });
    }
    const academyDoc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId).catch(() => null);
    if (!academyDoc || !academyDoc.$id || String(academyDoc.status || '').trim().toLowerCase() === 'inactive') {
      return res.status(200).json({ sucesso: true, ignorado: true, motivo: 'academia_inativa_ou_nao_encontrada' });
    }

    const imageMedia = extractIncomingImageMedia(msg);
    if (imageMedia) {
      const { text: cap } = extractIncomingText(msg);
      const caption = String(cap || '').trim();
      const displayContent = caption || '[imagem]';
      const saved = await saveInboundMessage({
        academyId,
        academyDoc,
        phone,
        text: displayContent,
        messageId,
        messageType: 'image',
        mediaUrl: imageMedia.url
      });
      if (!saved.ok) {
        console.error('[zapster][webhook] falha ao salvar imagem', { phone, academyId, erro: saved.erro });
      }
      return res.status(200).json({
        ok: true,
        sucesso: true,
        tipo: 'image_saved',
        duplicate: Boolean(saved.duplicate)
      });
    }

    let { type, text } = extractIncomingText(msg);

    if (!text) {
      const MEDIA_PLACEHOLDERS = {
        audio: '🎵 [Áudio recebido]',
        document: '📄 [Documento recebido]',
        sticker: '🖼️ [Sticker recebido]',
        video: '🎥 [Vídeo recebido]'
      };
      const messageType = String(msg?.type || msg?.message?.type || type || '').toLowerCase();
      const placeholder = MEDIA_PLACEHOLDERS[messageType];
      if (placeholder) {
        text = placeholder;
      }
    }

    if (!text) {
      console.log('[zapster][webhook] mensagem sem texto ignorada', { type: msg?.type, phone });
      return res.status(200).json({ sucesso: true, ignorado: true });
    }

    let modoHumano = false;
    try {
      modoHumano = await isHumanHandoffActive(phone, academyId);
    } catch {
      modoHumano = false;
    }

    if (modoHumano) {
      const saved = await saveInboundMessage({
        academyId,
        academyDoc,
        phone,
        text,
        messageId
      });
      if (!saved.ok) {
        console.error('[zapster][webhook] falha ao salvar inbound (modo humano)', { phone, academyId, erro: saved.erro });
      }
      return res.status(200).json({ sucesso: true, ignorado: true, modo_humano: true });
    }

    const savedInbound = await saveInboundMessage({
      academyId,
      academyDoc,
      phone,
      text,
      messageId
    });
    if (!savedInbound.ok) {
      console.error('[zapster][webhook] falha ao persistir inbound', { phone, academyId, erro: savedInbound.erro, requestId });
    }

    const iaAtiva = academyDoc?.ia_ativa === true;
    if (!iaAtiva) {
      console.log('[zapster][webhook] IA inativa (mensagem j\u00e1 persistida no painel)', { academyId, requestId });
      return res.status(200).json({ ok: true, sucesso: true, motivo: 'ia_inativa' });
    }

    const academyInst = String(academyDoc?.zapster_instance_id || academyDoc?.zapsterInstanceId || '').trim();
    const outInstanceId =
      String(instanceId || '').trim() ||
      academyInst ||
      String((await getZapsterInstanceIdForAcademy(academyId)) ?? '').trim();

    const nextPub = String(process.env.NEXT_PUBLIC_BASE_URL || '')
      .trim()
      .replace(/\/+$/, '');
    const vercelHost = process.env.VERCEL_URL
      ? `https://${String(process.env.VERCEL_URL).replace(/^https?:\/\//, '')}`
      : null;
    const baseUrl =
      nextPub || vercelHost || `https://${String(req.headers.host || '').trim()}`;

    const internalSecret = String(process.env.INTERNAL_API_SECRET || '').trim();

    if (!internalSecret) {
      console.error('[zapster][webhook] CR\u00cdTICO: INTERNAL_API_SECRET n\u00e3o configurado \u2014 IA n\u00e3o ser\u00e1 disparada', {
        requestId,
        phone,
        academyId
      });
      await updateConversationLastDispatchMeta(phone, academyId, {
        code: 'INTERNAL_API_SECRET_MISSING',
        at: new Date().toISOString()
      });
      return res.status(200).json({
        ok: true,
        sucesso: true,
        motivo: 'dispatch_skipped_no_secret',
        aviso: 'INTERNAL_API_SECRET n\u00e3o configurado',
        enfileirado: false
      });
    }

    console.log('[zapster][webhook] dispatching', { requestId, phone, messageId, baseUrl });

    const dispatchTask = (async () => {
      const bodyPayload = {
        phone,
        name,
        academyId,
        message: text,
        messageId,
        requestId,
        outInstanceId,
        inboundDocId: null
      };

      const maxRetries = 2;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const r = await fetch(`${baseUrl}/api/agent/process`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-internal-secret': internalSecret
            },
            body: JSON.stringify(bodyPayload),
            signal: AbortSignal.timeout(9000)
          });

          if (r.ok) {
            console.log('[zapster][webhook] dispatch response', { requestId, status: r.status, attempt, baseUrl });
            return;
          }
          console.warn(`[zapster][webhook] dispatch tentativa ${attempt} falhou:`, r.status);
        } catch (e) {
          console.error(`[zapster][webhook] dispatch erro tentativa ${attempt}:`, e.message);
        }

        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, attempt * 1000));
        }
      }
      console.error('[zapster][webhook] todas as tentativas de dispatch falharam', { requestId, phone, academyId });
    })();

    waitUntil(dispatchTask);

    res.setHeader('x-vercel-background', '1');
    return res.status(200).json({ ok: true, sucesso: true, enfileirado: true });
  } catch (e) {
    return res.status(500).json({ sucesso: false, erro: e.message || 'Erro interno' });
  }
}
