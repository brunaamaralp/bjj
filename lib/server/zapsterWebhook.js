import { timingSafeEqual } from 'crypto';
import { waitUntil } from '@vercel/functions';
import { Client, Databases, Query } from 'node-appwrite';
import { humanHandoffIsActive, humanHandoffUntilFromMs } from '../humanHandoffUntil.js';
import { getHumanHandoffHoursForServer, assertHumanHandoffEnvOnBoot } from '../constants.js';
import { logStructured } from './structuredLog.js';
import { recordInboundPersistFailure } from './inboundPersistMonitor.js';
import { recordDeadLetterInbound } from './deadLetterInbound.js';
import { createInternalNotification } from './internalNotification.js';
import { recordAcademyEvent } from './academyEvents.js';

assertHumanHandoffEnvOnBoot();
import {
  safeParseMessages,
  getOrCreateConversationDoc,
  updateConversationWithMerge,
  updateConversationLastDispatchMeta
} from './conversationsStore.js';
import { pickSenderProfileImageUrl } from './zapsterSenderMeta.js';

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
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  if (ct && !ct.includes('json')) {
    res.status(400).json({ sucesso: false, erro: 'Content-Type inválido' });
    return false;
  }
  if (!req.body || typeof req.body !== 'object') {
    res.status(400).json({ sucesso: false, erro: 'Body ausente' });
    return false;
  }
  return true;
}

function isProductionRuntime() {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.VERCEL === '1'
  );
}

function checkWebhookToken(req, res) {
  const expectedToken = String(process.env.ZAPSTER_WEBHOOK_TOKEN || '').trim();
  const fromHeader = String(req.headers['x-webhook-token'] || '').trim();
  const fromQuery = extractQueryParamFromRequest(req, 'token');
  const fromAuth = String(req.headers.authorization || '').trim().replace(/^Bearer\s+/i, '');

  // Zapster não permite headers customizados no webhook — o token vai na URL (?token=).
  const provided = fromHeader || fromQuery || fromAuth;

  if (!expectedToken) {
    logStructured('webhook_rejected', { error: 'webhook_token_not_configured' });
    res.status(401).json({ error: 'webhook_token_not_configured' });
    return false;
  }

  if (!safeCompare(provided, expectedToken)) {
    logStructured('webhook_rejected', { error: 'invalid_token' });
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

/** URL de mídia no payload Zapster (webhook) — alinhado a `pickMediaUrlFromZapster` em api/whatsapp.js. */
function pickMediaUrlFromZapsterMessage(msg) {
  if (!msg || typeof msg !== 'object') return '';
  const c = msg.content && typeof msg.content === 'object' ? msg.content : {};
  const u = String(c?.media?.url || msg?.media?.url || msg?.url || '').trim();
  if (u && /^https?:\/\//i.test(u)) return u;
  return '';
}

/** Áudio ou nota de voz (ptt) no webhook Zapster. */
function extractIncomingAudioMedia(msg) {
  const topType = String(msg?.type || '').toLowerCase();
  const content = msg?.content && typeof msg.content === 'object' ? msg.content : {};
  const contentType = String(content?.type || '').toLowerCase();
  const isAudio =
    topType === 'audio' ||
    topType === 'ptt' ||
    contentType === 'audio' ||
    contentType === 'ptt';
  if (!isAudio) return null;
  const url = pickMediaUrlFromZapsterMessage(msg);
  if (!url) return null;
  const mimeType = String(content?.media?.mimetype || content?.media?.mime_type || 'audio/ogg').trim() || 'audio/ogg';
  return { url, mimeType };
}

/** Quando o texto é placeholder de áudio (ou tipo Zapster é audio/ptt), anexa URL se existir no payload. */
function inferInboundAudioFromMessage(msg, text) {
  const zType = String(msg?.type || msg?.message?.type || '').toLowerCase();
  const mediaUrl = pickMediaUrlFromZapsterMessage(msg);
  if (!mediaUrl) return { messageType: 'text', mediaUrl: null };
  const t = String(text || '').trim();
  const audioPlaceholder = /🎵\s*\[Áudio recebido\]|\[Áudio recebido\]/i.test(t);
  if (zType === 'audio' || zType === 'ptt' || audioPlaceholder) {
    return { messageType: 'audio', mediaUrl };
  }
  return { messageType: 'text', mediaUrl: null };
}

function extractMessageId(body, msg) {
  const v = msg?.id || msg?.message?.id || body?.id || body?.message?.id || body?.data?.id || body?.payload?.id || '';
  const id = String(v || '').trim();
  return id || '';
}

function extractInstanceId(req, body, msg) {
  const fromHeader = String(
    req?.headers?.['x-instance-id'] ||
      req?.headers?.['X-Instance-ID'] ||
      req?.headers?.['x-instance-id'.toLowerCase()] ||
      ''
  ).trim();
  if (fromHeader) return fromHeader;

  const v =
    body?.instance_id ||
    body?.instanceId ||
    body?.data?.instance_id ||
    body?.data?.instanceId ||
    body?.data?.instance?.id ||
    body?.data?.instance?.instance_id ||
    body?.instance?.id ||
    body?.instance?.instance_id ||
    body?.payload?.instance_id ||
    body?.payload?.instanceId ||
    body?.payload?.instance?.id ||
    body?.payload?.instance?.instance_id ||
    msg?.instance_id ||
    msg?.instanceId ||
    msg?.message?.instance_id ||
    msg?.message?.instanceId ||
    '';
  return String(v || '').trim();
}

function isMessageReceivedEvent(eventName) {
  const e = String(eventName || '').trim().toLowerCase();
  return e === 'message.received' || e === 'message:received' || e === 'message_received';
}

function isMessageSentEvent(eventName) {
  const e = String(eventName || '').trim().toLowerCase();
  return e === 'message.sent' || e === 'message:sent' || e === 'message_sent';
}

function isInstanceStatusEvent(eventName) {
  const e = String(eventName || '').trim().toLowerCase();
  return (
    e === 'instance.status' ||
    e === 'instance.connected' ||
    e === 'instance.disconnected' ||
    e === 'instance.qrcode'
  );
}

function extractMessageSentOrigin(body, msg) {
  const b = body && typeof body === 'object' ? body : {};
  const d = b.data && typeof b.data === 'object' ? b.data : null;
  const raw =
    d?.origin ??
    b?.payload?.data?.origin ??
    b?.origin ??
    (msg && typeof msg === 'object' ? msg.origin : undefined) ??
    '';
  return String(raw || '').trim().toLowerCase();
}

function phoneFromZapField(v) {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return normalizePhone(String(v));
  if (typeof v === 'object' && v) {
    const id = v.id != null ? v.id : v.phone;
    if (id != null) return normalizePhone(String(id));
  }
  return '';
}

function pickOutboundContactPhone(msg, body) {
  const b = body && typeof body === 'object' ? body : {};
  const d = b.data && typeof b.data === 'object' ? b.data : null;
  const candidates = [
    msg?.recipient,
    msg?.recipient?.id,
    msg?.to,
    d?.recipient,
    d?.to,
    d?.recipient_id,
    d?.recipientId,
    b?.recipient,
    b?.to,
    b?.payload?.data?.recipient,
    b?.payload?.data?.to
  ];
  for (const c of candidates) {
    const p = phoneFromZapField(c);
    if (p) return p;
  }
  return '';
}

function pickMessageTimestampFromPayload(msg) {
  if (!msg || typeof msg !== 'object') return '';
  const candidates = [msg.timestamp, msg.created_at, msg.sent_at, msg.updated_at, msg.scheduled_at];
  for (const c of candidates) {
    const s = String(c || '').trim();
    if (!s) continue;
    const ms = new Date(s).getTime();
    if (Number.isFinite(ms)) return s;
  }
  return '';
}

async function saveOutboundMessageSent({ academyId, academyDoc, contactPhone, text, messageId, timestampIso, applyHandoff }) {
  const doc = await getOrCreateConversationDoc(contactPhone, academyId, academyDoc);
  if (!doc) return { ok: false, erro: 'Conversa indispon\u00edvel' };

  const history = safeParseMessages(doc.messages);
  const mid = String(messageId || '').trim();
  if (mid) {
    const exists = history.some((m) => m?.role === 'assistant' && String(m?.message_id || '').trim() === mid);
    if (exists) return { ok: true, duplicate: true, docId: doc.$id };
  }

  const ts =
    timestampIso && String(timestampIso).trim() ? String(timestampIso).trim() : new Date().toISOString();
  const assistantMsg = {
    role: 'assistant',
    content: String(text || '').trim(),
    timestamp: ts,
    sender: 'human',
    status: 'sent',
    ...(mid ? { message_id: mid } : {})
  };
  const up = await updateConversationWithMerge(doc.$id, [assistantMsg]);
  if (!up.ok) return { ok: false, erro: up.erro, docId: doc.$id };

  if (applyHandoff && databases && CONVERSATIONS_COL && doc.$id) {
    const h = getHumanHandoffHoursForServer();
    const until = humanHandoffUntilFromMs(Date.now() + h * 3600000) || '';
    if (until) {
      try {
        await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, { human_handoff_until: until });
      } catch (e) {
        console.error('[zapster][webhook] falha ao gravar handoff ap\u00f3s message.sent', e?.message || e);
      }
    }
  }

  return { ok: true, duplicate: false, docId: doc.$id };
}

function extractQueryParamFromRequest(req, key) {
  const q = req?.query || {};
  const direct = String(q[key] || '').trim();
  if (direct) return direct;
  if (key === 'academyId') {
    const alt = String(q.academy_id || '').trim();
    if (alt) return alt;
  }
  if (key === 'token') {
    const alt = String(q.webhook_token || '').trim();
    if (alt) return alt;
  }
  try {
    const rawUrl = String(req?.url || req?.originalUrl || '');
    const idx = rawUrl.indexOf('?');
    if (idx < 0) return '';
    const params = new URLSearchParams(rawUrl.slice(idx + 1));
    const primary = String(params.get(key) || '').trim();
    if (primary) return primary;
    if (key === 'academyId') return String(params.get('academy_id') || '').trim();
    if (key === 'token') return String(params.get('webhook_token') || '').trim();
  } catch {
    void 0;
  }
  return '';
}

function extractAcademyIdFromWebhookQuery(req) {
  return extractQueryParamFromRequest(req, 'academyId');
}

async function bindInstanceToAcademyIfNeeded(academyId, instanceId) {
  const aid = String(academyId || '').trim();
  const inst = String(instanceId || '').trim();
  if (!aid || !inst || !databases || !DB_ID || !ACADEMIES_COL) return;
  try {
    const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, aid);
    const current = String(doc?.zapster_instance_id || doc?.zapsterInstanceId || '').trim();
    if (current === inst) return;
    await databases.updateDocument(DB_ID, ACADEMIES_COL, aid, {
      zapster_instance_id: inst,
      zapsterInstanceId: inst,
      zapster_status_updated_at: new Date().toISOString()
    });
    logStructured('webhook_instance_bound', {
      academy_id: aid,
      instance_id: inst,
      previous_instance_id: current || null
    });
  } catch (e) {
    console.error('[zapster][webhook] falha ao vincular instance_id à academia', {
      academyId: aid,
      instanceId: inst,
      erro: e?.message || String(e)
    });
  }
}

async function resolveAcademyIdForWebhook(req, instanceId) {
  const inst = String(instanceId || '').trim();
  const fromQuery = extractAcademyIdFromWebhookQuery(req);

  if (inst) {
    const byInstance = await resolveAcademyIdFromInstanceId(inst);
    if (byInstance) return byInstance;
  }

  // URL do webhook inclui ?academyId= (registrado por academia) — confiar e re-vincular instance_id.
  if (fromQuery) {
    if (inst) await bindInstanceToAcademyIfNeeded(fromQuery, inst);
    logStructured('webhook_academy_query_resolved', {
      academy_id: fromQuery,
      instance_id: inst || null
    });
    return fromQuery;
  }

  if (inst) {
    logStructured('webhook_academy_unmapped', {
      error: 'instance_not_mapped',
      academy_id: null,
      phone: null,
      message_id: null,
      instance_id: inst
    });
  }
  return '';
}

async function handleMessageSentWebhook(req, res, body, msg) {
  const messageId = extractMessageId(body, msg);
  const instanceId = extractInstanceId(req, body, msg);
  const requestId = String(messageId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  const academyId = await resolveAcademyIdForWebhook(req, instanceId);
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

  const origin = extractMessageSentOrigin(body, msg);
  const applyHandoff = origin === 'whatsapp';

  const recipientForGroup =
    msg?.recipient?.id ||
    msg?.to ||
    (body?.data && typeof body.data === 'object' ? body.data.recipient || body.data.to : '') ||
    '';
  if (isGroupId(recipientForGroup)) {
    return res.status(200).json({ sucesso: true, ignorado: true, motivo: 'message_sent_group' });
  }

  const contactPhone = pickOutboundContactPhone(msg, body);
  if (!contactPhone) {
    console.log('[zapster][webhook] message.sent sem destinat\u00e1rio', { requestId, origin });
    return res.status(200).json({ sucesso: true, ignorado: true, motivo: 'message_sent_no_recipient' });
  }

  let { text } = extractIncomingText(msg);
  if (!text) {
    const MEDIA_PLACEHOLDERS = {
      audio: '🎵 [Áudio recebido]',
      document: '📄 [Documento recebido]',
      sticker: '🖼️ [Sticker recebido]',
      video: '🎥 [Vídeo recebido]'
    };
    const messageType = String(msg?.type || msg?.message?.type || '').toLowerCase();
    const placeholder = MEDIA_PLACEHOLDERS[messageType];
    if (placeholder) text = placeholder;
  }
  if (!text) {
    console.log('[zapster][webhook] message.sent sem texto', { type: msg?.type, requestId, origin });
    return res.status(200).json({ sucesso: true, ignorado: true, motivo: 'message_sent_no_text' });
  }

  const ts = pickMessageTimestampFromPayload(msg);

  const saved = await saveOutboundMessageSent({
    academyId,
    academyDoc,
    contactPhone,
    text,
    messageId,
    timestampIso: ts,
    applyHandoff
  });

  if (!saved.ok) {
    console.error('[zapster][webhook] falha ao salvar message.sent', { contactPhone, academyId, erro: saved.erro, requestId });
    return res.status(200).json({ ok: false, sucesso: false, erro: saved.erro, requestId });
  }

  return res.status(200).json({
    ok: true,
    sucesso: true,
    tipo: 'message_sent',
    origin: origin || null,
    duplicate: Boolean(saved.duplicate),
    handoff_aplicado: Boolean(applyHandoff && !saved.duplicate)
  });
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

async function saveInboundMessage({
  academyId,
  academyDoc,
  phone,
  text,
  messageId,
  messageType = 'text',
  mediaUrl = null,
  contactName = '',
  contactNameSource = '',
  profileImageUrl = ''
}) {
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
    ...(mt === 'image' && mediaUrl ? { type: 'image', mediaUrl: String(mediaUrl).trim() } : {}),
    ...(mt === 'audio' && mediaUrl ? { type: 'audio', mediaUrl: String(mediaUrl).trim() } : {})
  };
  const up = await updateConversationWithMerge(doc.$id, [userMsg]);
  if (!up.ok) return { ok: false, erro: up.erro || 'Erro ao salvar inbound', docId: doc.$id };
  const nextName = String(contactName || '').trim();
  const source = String(contactNameSource || '').trim();
  const nextPic = String(profileImageUrl || '').trim();
  const picOk = Boolean(nextPic && /^https?:\/\//i.test(nextPic));
  if (nextName || picOk) {
    try {
      const basePayload = {
        ...(nextName
          ? {
              whatsapp_profile_name: nextName,
              whatsapp_profile_name_updated_at: nowIso
            }
          : {}),
        ...(picOk
          ? {
              whatsapp_profile_image_url: nextPic,
              whatsapp_profile_image_updated_at: nowIso
            }
          : {})
      };
      const existingSource = String(doc?.contact_name_source || '').trim().toLowerCase();
      const existingContactName = String(doc?.contact_name || '').trim();
      const shouldFillContactName = nextName && (!existingContactName || existingSource !== 'manual');
      const payload =
        nextName && shouldFillContactName
          ? {
              ...basePayload,
              contact_name: nextName,
              contact_name_source: source || 'whatsapp',
              contact_name_updated_at: nowIso
            }
          : basePayload;
      try {
        await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, payload);
      } catch {
        try {
          const minimal = {};
          if (nextName) {
            minimal.whatsapp_profile_name = nextName;
            minimal.whatsapp_profile_name_updated_at = nowIso;
          }
          if (picOk) {
            minimal.whatsapp_profile_image_url = nextPic;
            minimal.whatsapp_profile_image_updated_at = nowIso;
          }
          if (Object.keys(minimal).length) {
            await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, minimal);
          }
        } catch {
          if (shouldFillContactName) {
            await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, {
              contact_name: nextName
            });
          }
        }
      }
    } catch (e) {
      console.warn('[zapster][webhook] não foi possível persistir nome/foto de contato', {
        phone,
        academyId,
        erro: e?.message || String(e)
      });
    }
  }
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

async function logZapsterWebhookFailed({ academyId, payload, error, retryCount = 0 }) {
  const aid = String(academyId || '').trim();
  const payloadJson = JSON.stringify(payload ?? {}).slice(0, 12000);
  const errorMessage = String(error?.message || error || 'unknown_error').slice(0, 2000);
  const retry = Math.max(0, Number(retryCount) || 0);

  if (!aid) {
    console.error(
      JSON.stringify({
        event: 'webhook_failed',
        provider: 'zapster',
        retry_count: retry,
        error_message: errorMessage,
        payload_json: payloadJson.slice(0, 500),
      })
    );
    return;
  }

  try {
    await recordAcademyEvent({
      event_type: 'webhook_failed',
      academy_id: aid,
      actor_user_id: 'system',
      actor_name: 'Zapster Webhook',
      payload_json: payloadJson,
      error_message: errorMessage,
      retry_count: retry,
      webhook_provider: 'zapster',
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[zapsterWebhook] falha ao gravar webhook_failed', e?.message || e);
  }
}

async function resolveAcademyIdForWebhookFailure(req, body, msg) {
  const fromQuery = extractAcademyIdFromWebhookQuery(req);
  if (fromQuery) return fromQuery;
  const instanceId = extractInstanceId(req, body, msg);
  if (!instanceId) return '';
  try {
    return await resolveAcademyIdFromInstanceId(instanceId);
  } catch {
    return '';
  }
}

export default async function handler(req, res) {
  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  console.log('[debug] webhook instanceId recebido:', payload.instanceId ?? payload.instance_id);

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ sucesso: false, erro: 'M\u00e9todo n\u00e3o permitido' });
  }
  if (!checkWebhookToken(req, res)) return;
  console.log('[debug] webhook ZAPSTER_WEBHOOK_TOKEN verificado com sucesso');
  if (!ensureJson(req, res)) return;

  try {
    const body = req.body || {};
    const event = extractEventName(body);
    const msg = pickMessageObject(body);
    const debugInstanceId = extractInstanceId(req, body, msg);
    console.log('[zapster][webhook][debug] entrada', {
      event: String(event || '').trim(),
      instanceId: debugInstanceId || null,
      academyIdQuery: extractAcademyIdFromWebhookQuery(req) || null,
      bodyKeys: body && typeof body === 'object' ? Object.keys(body).slice(0, 12) : [],
      dataKeys:
        body?.data && typeof body.data === 'object'
          ? Object.keys(body.data).slice(0, 12)
          : []
    });

    if (!isMessageReceivedEvent(event) && !isMessageSentEvent(event) && !isInstanceStatusEvent(event)) {
      return res.status(200).json({ sucesso: true, ignorado: true, motivo: 'evento_nao_suportado' });
    }

    if (isInstanceStatusEvent(event)) {
      const instanceId = extractInstanceId(req, body, msg);
      const academyId = await resolveAcademyIdForWebhook(req, instanceId);
      if (!academyId) {
        return res.status(200).json({ received: true, processed: false, reason: 'instance_not_mapped_for_status' });
      }
      const ev = String(event || '').trim().toLowerCase();
      let novoStatus = String(body?.status || body?.data?.status || body?.payload?.status || '').trim();
      if (!novoStatus) {
        if (ev === 'instance.disconnected') novoStatus = 'disconnected';
        else if (ev === 'instance.connected') novoStatus = 'connected';
        else if (ev === 'instance.qrcode') novoStatus = 'qrcode';
      }
      const nowIso = new Date().toISOString();
      const isDisconnected = novoStatus === 'offline' || novoStatus === 'disconnected';
      const isConnected = novoStatus === 'connected' || ev === 'instance.connected';

      if (isConnected && instanceId) {
        await bindInstanceToAcademyIfNeeded(academyId, instanceId);
      }

      if (isDisconnected || isConnected) {
        const statusToSave = isConnected ? 'connected' : novoStatus;
        try {
          await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
            zapster_status: statusToSave,
            zapster_status_updated_at: nowIso
          });
        } catch (e) {
          console.error('[zapster][webhook] erro ao salvar status (collection pode requerer atributo)', e.message);
        }

        if (isDisconnected) {
          void createInternalNotification({
            academy_id: academyId,
            type: 'whatsapp_disconnected',
            title: 'WhatsApp desconectado',
            body: 'A conexão com o WhatsApp caiu. Acesse Agente de Atendimento para reconectar.',
            action_url: '/agente-ia',
            severity: 'high'
          });
        } else if (isConnected) {
          void createInternalNotification({
            academy_id: academyId,
            type: 'whatsapp_reconnected',
            title: 'WhatsApp reconectado',
            body: 'A conexão foi restabelecida.',
            action_url: '/agente-ia',
            severity: 'info'
          });
        }
      }
      return res.status(200).json({ ok: true, sucesso: true, type: 'instance_status_handled' });
    }

    if (isMessageSentEvent(event)) {
      if (!msg) return res.status(200).json({ sucesso: true, ignorado: true, motivo: 'sem_payload_mensagem' });
      return handleMessageSentWebhook(req, res, body, msg);
    }

    if (!isMessageReceivedEvent(event)) {
      return res.status(200).json({ sucesso: true, ignorado: true });
    }

    if (!msg) {
      return res.status(200).json({ sucesso: true, ignorado: true, motivo: 'sem_payload_mensagem' });
    }

    const senderId = msg?.sender?.id || msg?.from || body?.sender?.id || body?.from || '';
    const recipientId = msg?.recipient?.id || msg?.to || body?.recipient?.id || body?.to || '';
    if (isGroupId(senderId) || isGroupId(recipientId)) {
      return res.status(200).json({ sucesso: true, ignorado: true });
    }

    const phone = normalizePhone(senderId);
    if (!phone) return res.status(200).json({ sucesso: true, ignorado: true });

    const name = String(msg?.sender?.name || body?.sender?.name || '').trim();
    const profilePic = pickSenderProfileImageUrl(msg) || pickSenderProfileImageUrl(body);
    const messageId = extractMessageId(body, msg);
    const instanceId = extractInstanceId(req, body, msg);
    const requestId = String(messageId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    const academyId = await resolveAcademyIdForWebhook(req, instanceId);
    if (!academyId) {
      return res.status(200).json({
        received: true,
        processed: false,
        sucesso: true,
        erro: 'instância não mapeada',
        reason: 'instance_not_mapped',
        instanceId: instanceId || null,
        requestId,
      });
    }
    const academyDoc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId).catch(() => null);
    console.log('[debug] instanceId webhook (resolvido) vs Appwrite academia:', {
      instanceIdNoWebhook: instanceId || null,
      appwrite_zapster_instance_id: academyDoc?.zapster_instance_id ?? null,
      appwrite_zapsterInstanceId: academyDoc?.zapsterInstanceId ?? null,
      bate:
        Boolean(instanceId) &&
        (String(academyDoc?.zapster_instance_id || '').trim() === String(instanceId).trim() ||
          String(academyDoc?.zapsterInstanceId || '').trim() === String(instanceId).trim())
    });
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
        mediaUrl: imageMedia.url,
        contactName: name,
        contactNameSource: 'whatsapp',
        profileImageUrl: profilePic
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

    const audioMedia = extractIncomingAudioMedia(msg);
    if (audioMedia) {
      const { text: cap } = extractIncomingText(msg);
      const caption = String(cap || '').trim();
      const displayContent = caption || '🎵 [Áudio recebido]';
      const saved = await saveInboundMessage({
        academyId,
        academyDoc,
        phone,
        text: displayContent,
        messageId,
        messageType: 'audio',
        mediaUrl: audioMedia.url,
        contactName: name,
        contactNameSource: 'whatsapp',
        profileImageUrl: profilePic
      });
      if (!saved.ok) {
        console.error('[zapster][webhook] falha ao salvar áudio', { phone, academyId, erro: saved.erro });
      }
      return res.status(200).json({
        ok: true,
        sucesso: true,
        tipo: 'audio_saved',
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
    console.log('[debug] handoff ativo:', modoHumano, 'phone:', phone, 'academyId:', academyId);

    if (modoHumano) {
      const audioInf = inferInboundAudioFromMessage(msg, text);
      const saved = await saveInboundMessage({
        academyId,
        academyDoc,
        phone,
        text,
        messageId,
        messageType: audioInf.messageType,
        mediaUrl: audioInf.mediaUrl,
        contactName: name,
        contactNameSource: 'whatsapp',
        profileImageUrl: profilePic
      });
      if (!saved.ok) {
        console.error('[zapster][webhook] falha ao salvar inbound (modo humano)', { phone, academyId, erro: saved.erro });
      }
      return res.status(200).json({ sucesso: true, ignorado: true, modo_humano: true });
    }

    const audioInf2 = inferInboundAudioFromMessage(msg, text);
    const savedInbound = await saveInboundMessage({
      academyId,
      academyDoc,
      phone,
      text,
      messageId,
      messageType: audioInf2.messageType,
      mediaUrl: audioInf2.mediaUrl,
      contactName: name,
      contactNameSource: 'whatsapp',
      profileImageUrl: profilePic
    });
    if (!savedInbound.ok) {
      await recordInboundPersistFailure({
        academyId,
        phone,
        messageId,
        error: savedInbound.erro,
      });
      await recordDeadLetterInbound({
        academyId,
        phone,
        messageId,
        payload: { text, messageId, instanceId, event },
        error: savedInbound.erro,
      });
      void createInternalNotification({
        academy_id: academyId,
        type: 'inbound_persist_failed',
        title: 'Mensagem não salva',
        body: 'Uma mensagem recebida não foi salva. Pode haver inconsistência no Inbox.',
        action_url: '/inbox',
        severity: 'high',
        phone
      });
      return res.status(200).json({
        ok: true,
        sucesso: true,
        skipped: true,
        reason: 'persist_failed',
        requestId
      });
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
      await logZapsterWebhookFailed({
        academyId,
        payload: body,
        error: new Error('dispatch_exhausted'),
        retryCount: maxRetries,
      });
    })();

    waitUntil(dispatchTask);

    res.setHeader('x-vercel-background', '1');
    return res.status(200).json({ ok: true, sucesso: true, enfileirado: true });
  } catch (e) {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const msg = pickMessageObject(body);
    const academyId = await resolveAcademyIdForWebhookFailure(req, body, msg);
    await logZapsterWebhookFailed({
      academyId,
      payload: body,
      error: e,
      retryCount: 0,
    });
    return res.status(500).json({ sucesso: false, erro: e.message || 'Erro interno' });
  }
}
