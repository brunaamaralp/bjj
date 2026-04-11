import { timingSafeEqual } from 'crypto';
import { waitUntil } from '@vercel/functions';
import { Client, Databases, Query } from 'node-appwrite';
import { humanHandoffIsActive } from '../../lib/humanHandoffUntil.js';
import { safeParseMessages, getOrCreateConversationDoc, updateConversationWithMerge } from '../../lib/server/conversationsStore.js';

const ZAPSTER_INSTANCE_ID = process.env.ZAPSTER_INSTANCE_ID || '';
/** Aguarda o fetch ao agent/process até este limite para o runtime não cortar antes da conexão (Vercel serverless). */
const DISPATCH_WAIT_MS = 2500;

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
const DEFAULT_ACADEMY_ID = process.env.DEFAULT_ACADEMY_ID || process.env.VITE_DEFAULT_ACADEMY_ID || '';

const appwriteClient = PROJECT_ID && API_KEY ? new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY) : null;
const databases = appwriteClient ? new Databases(appwriteClient) : null;

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
    res.status(400).json({ sucesso: false, erro: 'Content-Type inválido' });
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

  console.log('[webhook-debug] token recebido:', q || '(vazio)');
  console.log('[webhook-debug] header x-webhook-token:', h || '(vazio)');
  console.log('[webhook-debug] header authorization:', a || '(vazio)');
  console.log('[webhook-debug] token providenciado final:', provided || '(vazio)');
  console.log('[webhook-debug] token esperado:', expectedToken ? `${expectedToken.slice(0, 10)}...` : '(vazio)');
  console.log('[webhook-debug] match:', safeCompare(provided, expectedToken));

  if (!expectedToken) {
    console.error('[zapster][webhook] ZAPSTER_WEBHOOK_TOKEN não configurado — rejeitando');
    res.status(401).json({ error: 'webhook_token_not_configured' });
    return false;
  }

  if (!safeCompare(provided, expectedToken)) {
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

/** Webhook `message.received` com `data.type === 'image'`: ver exemplos em Zapster "Eventos disponíveis". */
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
  const fallback = String(DEFAULT_ACADEMY_ID || '').trim();

  if (!inst) {
    console.warn('[zapster][webhook] instanceId vazio no payload — usando fallback', {
      fallback: fallback || '(vazio)'
    });
    return fallback;
  }

  if (!databases || !DB_ID || !ACADEMIES_COL) {
    console.warn('[zapster][webhook] Appwrite não configurado — usando fallback', {
      instanceId: inst,
      fallback: fallback || '(vazio)'
    });
    return fallback;
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

  console.warn('[zapster][webhook] instância não associada a nenhuma academia', {
    instanceId: inst,
    fallback: fallback || '(vazio — mensagem será ignorada)'
  });

  return fallback;
}

async function getZapsterInstanceIdForAcademy(academyId) {
  const fallback = String(ZAPSTER_INSTANCE_ID || '').trim();
  const id = String(academyId || '').trim();
  if (!id || !databases || !DB_ID || !ACADEMIES_COL) return fallback;
  try {
    const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, id);
    const v = String(doc?.zapster_instance_id || doc?.zapsterInstanceId || '').trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

async function saveInboundMessage({ academyId, academyDoc, phone, text, messageId, messageType = 'text', mediaUrl = null }) {
  const doc = await getOrCreateConversationDoc(phone, academyId, academyDoc);
  if (!doc) return { ok: false, erro: 'Conversa indisponível' };

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
    return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
  }
  if (!checkWebhookToken(req, res)) return;
  if (!ensureJson(req, res)) return;

  try {
    const body = req.body || {};
    const event = extractEventName(body);
    const msg = pickMessageObject(body);

    if (!msg) return res.status(200).json({ sucesso: true, ignorado: true });
    if (event && event !== 'message.received' && event !== 'message:received' && event !== 'message_received') {
      return res.status(200).json({ sucesso: true, ignorado: true });
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
      console.warn('[zapster][webhook] academyId não resolvido — descartando mensagem', {
        instanceId,
        requestId
      });
      return res.status(200).json({ ok: true, motivo: 'academia_nao_encontrada' });
    }
    const academyDoc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId).catch(() => null);
    if (!academyDoc || !academyDoc.$id) return res.status(200).json({ sucesso: true, ignorado: true });

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

    const { type, text } = extractIncomingText(msg);
    if (!text) return res.status(200).json({ sucesso: true, ignorado: true });
    if (type && type !== 'text') return res.status(200).json({ sucesso: true, ignorado: true });

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
      console.log('[zapster][webhook] IA inativa (mensagem já persistida no painel)', { academyId, requestId });
      return res.status(200).json({ ok: true, sucesso: true, motivo: 'ia_inativa' });
    }

    const academyInst = String(academyDoc?.zapster_instance_id || academyDoc?.zapsterInstanceId || '').trim();
    const outInstanceId = String(instanceId || '').trim() || academyInst || (await getZapsterInstanceIdForAcademy(academyId));

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
      console.error('[zapster][webhook] INTERNAL_API_SECRET ausente, agent/process não disparado', {
        requestId,
        phone,
        academyId
      });
    } else {
      console.log('[zapster][webhook] dispatching', { requestId, phone, messageId, baseUrl });

      const dispatchTask = (async () => {
        try {
          const r = await fetch(`${baseUrl}/api/agent/process`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-internal-secret': internalSecret
            },
            body: JSON.stringify({
              phone,
              name,
              academyId,
              message: text,
              messageId,
              requestId,
              outInstanceId,
              inboundDocId: null
            })
          });
          console.log('[zapster][webhook] dispatch response', { requestId, status: r.status, baseUrl });
        } catch (e) {
          console.error('[zapster][webhook] dispatch error', {
            error: e?.message,
            baseUrl,
            requestId
          });
        }
      })();

      waitUntil(dispatchTask);
    }

    res.setHeader('x-vercel-background', '1');
    return res.status(200).json({ ok: true, sucesso: true, enfileirado: true });
  } catch (e) {
    return res.status(500).json({ sucesso: false, erro: e.message || 'Erro interno' });
  }
}

