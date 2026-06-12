/**
 * Hub WhatsApp + Zapster (Vercel Hobby: evita function extra em api/zapster.js).
 * Rotas Zapster: ?route=webhook | ?route=instances (rewrites em vercel.json).
 * Rotas WhatsApp: ?action=send | reconcile | cancel | …
 */
import { Account, Client, Databases, ID, Permission, Query, Role, Teams } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess } from '../lib/server/academyAccess.js';
import { AGENT_HISTORY_WINDOW } from '../lib/constants.js';
import { pickSenderProfileImageUrl } from '../lib/server/zapsterSenderMeta.js';
import { fetchZapsterRecipientProfilePicture } from '../lib/server/zapsterRecipientProfile.js';
import {
  formatWhatsAppGroupLabel,
  isWhatsAppGroupId,
  rawWhatsAppChatId,
} from '../lib/whatsappGroupId.js';
import {
  groupParticipantMessageFields,
  pickZapsterParticipantName,
} from '../lib/whatsappGroupContext.js';
import { findZapsterInstanceForAcademy, normalizeWaInstancesList } from '../lib/server/zapsterInstanceLookup.js';
import instancesHandler from '../lib/server/zapsterInstances.js';
import webhookHandler from '../lib/server/zapsterWebhook.js';
import { resolveUnreadCountAfterMerge } from '../lib/server/conversationsStore.js';
import { lastMessageMetaPayload } from '../lib/server/conversationListMeta.js';
import { conversationMessagesStoragePayload } from '../lib/server/conversationMessages.js';
import { enrichInboundMedia } from '../lib/server/inboxMediaService.js';
import { detectMediaTypeFromMime, sendZapsterMedia } from '../lib/server/zapsterSend.js';
import {
  checkProactiveWhatsappAllowed,
  PROACTIVE_SKIP_REASON,
  proactiveWhatsappUserMessage,
} from '../lib/server/proactiveWhatsappGate.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';


const ZAPSTER_API_BASE_URL = process.env.ZAPSTER_API_BASE_URL || 'https://api.zapsterapi.com';
const ZAPSTER_TOKEN = process.env.ZAPSTER_TOKEN || process.env.ZAPSTER_API_TOKEN || '';

function firstQueryString(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return String(v[0] ?? '').trim();
  return String(v).trim();
}

function hasZapsterApiToken() {
  return Boolean(String(process.env.ZAPSTER_API_TOKEN || process.env.ZAPSTER_TOKEN || '').trim());
}

function zapsterTokenMissingResponse(res) {
  return res.status(503).json({
    sucesso: false,
    erro: 'Serviço de WhatsApp não configurado.',
    detalhe:
      'A variável ZAPSTER_API_TOKEN não está definida. Configure nas variáveis de ambiente do projeto (ou defina ZAPSTER_TOKEN como alternativa).',
    codigo: 'ZAPSTER_TOKEN_MISSING',
  });
}

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);
const teams = new Teams(adminClient);

function ensureConfigOk(res) {
  if (!PROJECT_ID || !API_KEY || !DB_ID || !CONVERSATIONS_COL) {
    res.status(500).json({ sucesso: false, erro: 'Configuração Appwrite ausente' });
    return false;
  }
  if (!ACADEMIES_COL) {
    res.status(500).json({ sucesso: false, erro: 'ACADEMIES_COL não configurado' });
    return false;
  }
  if (!ZAPSTER_TOKEN) {
    res.status(500).json({ sucesso: false, erro: 'ZAPSTER_TOKEN ausente' });
    return false;
  }
  return true;
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

/** Ative na Vercel: DEBUG_WHATSAPP_API=1 (ou WHATSAPP_DEBUG=1 / true / yes). */
function whatsappDebugEnabled() {
  const v = String(process.env.DEBUG_WHATSAPP_API || process.env.WHATSAPP_DEBUG || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function waDebug(obj) {
  if (!whatsappDebugEnabled()) return;
  try {
    console.log('[api/whatsapp][debug]', JSON.stringify({ ts: new Date().toISOString(), ...obj }));
  } catch {
    console.log('[api/whatsapp][debug]', new Date().toISOString(), obj);
  }
}

function normalizePhone(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  return raw.replace(/[^\d]/g, '');
}

function normalizePhoneForWaMe(v) {
  let d = normalizePhone(v);
  if (!d) return '';
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10 && d.length <= 11) return `55${d}`;
  return d;
}

function buildWaMeUrl(phone, text) {
  const digits = normalizePhoneForWaMe(phone);
  if (!digits) return '';
  return `https://wa.me/${digits}?text=${encodeURIComponent(String(text || ''))}`;
}


function normalizeStoredInboxMessage(m) {
  if (!m || typeof m !== 'object') return null;
  const row = {
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: typeof m.content === 'string' ? m.content : String(m.content || ''),
    timestamp: typeof m.timestamp === 'string' ? m.timestamp : new Date().toISOString(),
  };
  for (const key of [
    'sender',
    'in_reply_to',
    'message_id',
    'status',
    'send_at',
    'canceled_at',
    'type',
    'mediaUrl',
    'storageFileId',
    'mimeType',
    'fileName',
  ]) {
    const val = m[key];
    if (typeof val === 'string' && val.trim()) row[key] = val.trim();
  }
  const mediaUrlAlt = String(m.media_url || '').trim();
  if (!row.mediaUrl && mediaUrlAlt) row.mediaUrl = mediaUrlAlt;
  const storageAlt = String(m.storage_file_id || '').trim();
  if (!row.storageFileId && storageAlt) row.storageFileId = storageAlt;
  const mimeAlt = String(m.mime_type || '').trim();
  if (!row.mimeType && mimeAlt) row.mimeType = mimeAlt;
  if (m.media_stored === true) row.media_stored = true;
  else if (m.media_stored === false) row.media_stored = false;
  if (m.classificacao && typeof m.classificacao === 'object') row.classificacao = m.classificacao;
  const duration = Number(m.duration);
  if (Number.isFinite(duration) && duration > 0) row.duration = duration;
  return row;
}

function safeParseMessages(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeStoredInboxMessage).filter(Boolean);
  } catch {
    return [];
  }
}

function inboxMessageHasStoredMedia(m) {
  return Boolean(m && m.media_stored === true && String(m.mediaUrl || m.storageFileId || '').trim());
}

function isOutboundPhoneMediaPlaceholderContent(content) {
  return /\[Imagem enviada pelo celular\]|\[Áudio enviado pelo celular\]/i.test(String(content || ''));
}

function mergeInboundMediaFields(existing, incoming) {
  if (!existing || !incoming || typeof existing !== 'object' || typeof incoming !== 'object') return existing;
  if (inboxMessageHasStoredMedia(existing)) return existing;
  if (!inboxMessageHasStoredMedia(incoming) && !String(incoming.mediaUrl || '').trim()) return existing;
  const merged = {
    ...existing,
    ...(incoming.type ? { type: incoming.type } : {}),
    ...(incoming.mediaUrl ? { mediaUrl: incoming.mediaUrl } : {}),
    ...(incoming.storageFileId ? { storageFileId: incoming.storageFileId } : {}),
    ...(incoming.mimeType ? { mimeType: incoming.mimeType } : {}),
    ...(incoming.media_stored === true
      ? { media_stored: true }
      : incoming.media_stored === false
        ? { media_stored: false }
        : {}),
  };
  if (
    isOutboundPhoneMediaPlaceholderContent(existing.content) &&
    String(incoming.content || '').trim() &&
    !isOutboundPhoneMediaPlaceholderContent(incoming.content)
  ) {
    merged.content = incoming.content;
  } else if (isOutboundPhoneMediaPlaceholderContent(merged.content) && String(incoming.mediaUrl || '').trim()) {
    if (String(incoming.type || merged.type || '').toLowerCase() === 'image') merged.content = '[imagem]';
    else if (['audio', 'ptt'].includes(String(incoming.type || merged.type || '').toLowerCase())) {
      merged.content = '🎵 [Áudio enviado]';
    }
  }
  return merged;
}

function safeParseJson(raw) {
  const t = String(raw || '').trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function pickMessageId(v) {
  if (!v || typeof v !== 'object') return '';
  const candidates = [v.id, v.message_id, v.wamid, v.whatsapp_message_id];
  for (const c of candidates) {
    const s = String(c || '').trim();
    if (s) return s;
  }
  return '';
}

function permissionsForAcademyDoc(academyDoc) {
  const ownerId = String(academyDoc?.ownerId || '').trim();
  const teamId = String(academyDoc?.teamId || '').trim();
  const perms = [];
  if (ownerId) perms.push(Permission.read(Role.user(ownerId)), Permission.update(Role.user(ownerId)), Permission.delete(Role.user(ownerId)));
  if (teamId) perms.push(Permission.read(Role.team(teamId)), Permission.update(Role.team(teamId)), Permission.delete(Role.team(teamId)));
  if (perms.length > 0) return perms;
  return [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())];
}

async function getOrCreateConversationDoc(phone, academyId, academyDoc) {
  const list = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, [
    Query.equal('phone_number', [phone]),
    Query.equal('academy_id', [academyId]),
    Query.limit(1)
  ]);
  const existing = list.documents && list.documents[0] ? list.documents[0] : null;
  if (existing) return { doc: existing, created: false };

  const nowIso = new Date().toISOString();
  const created = await databases.createDocument(
    DB_ID,
    CONVERSATIONS_COL,
    ID.unique(),
    {
      phone_number: phone,
      messages: JSON.stringify([]),
      messages_recent: JSON.stringify([]),
      updated_at: nowIso,
      academy_id: academyId,
    },
    permissionsForAcademyDoc(academyDoc)
  );
  return { doc: created, created: true };
}

async function getZapsterInstanceIdForAcademy(academyDoc, academyId) {
  const id = String(academyId || '').trim();
  if (!id || !ACADEMIES_COL) return '';
  const direct = String(academyDoc?.zapster_instance_id || academyDoc?.zapsterInstanceId || '').trim();
  if (direct) return direct;
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

/** @param {string} raw */
function zapsterFirstErrorFromBody(raw) {
  const data = safeParseJson(raw);
  if (!data || typeof data !== 'object') return { code: '', message: '' };
  const arr = Array.isArray(data.errors) ? data.errors : [];
  const first = arr[0] && typeof arr[0] === 'object' ? arr[0] : null;
  return {
    code: String(first?.code || '').trim(),
    message: String(first?.message || '').trim()
  };
}

/** @param {string} raw */
function isZapsterInstanceNotFound(raw) {
  const { code, message } = zapsterFirstErrorFromBody(raw);
  const low = `${code} ${message} ${String(raw || '')}`.toLowerCase();
  return code === 'instance_not_found' || low.includes('instance not found');
}

async function zapsterListInstancesRaw() {
  const urlBase = String(ZAPSTER_API_BASE_URL || '').replace(/\/+$/, '');
  const url = `${urlBase}/v1/wa/instances`;
  const resp = await fetch(url, { headers: { authorization: `Bearer ${ZAPSTER_TOKEN}` } });
  const raw = await resp.text();
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }
  return { ok: resp.ok, status: resp.status, data, raw };
}

async function recoverZapsterInstanceIdFromList(academyId) {
  const aid = String(academyId || '').trim();
  if (!aid) return '';
  const listed = await zapsterListInstancesRaw();
  if (!listed.ok || !listed.data) return '';
  const items = normalizeWaInstancesList(listed.data);
  return findZapsterInstanceForAcademy(items, aid);
}

async function zapsterGetInstanceRaw(instanceId) {
  const id = String(instanceId || '').trim();
  if (!id) return { ok: false, status: 0, data: null };
  const urlBase = String(ZAPSTER_API_BASE_URL || '').replace(/\/+$/, '');
  const url = `${urlBase}/v1/wa/instances/${encodeURIComponent(id)}`;
  const resp = await fetch(url, { headers: { authorization: `Bearer ${ZAPSTER_TOKEN}` } });
  const raw = await resp.text();
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }
  return { ok: resp.ok, status: resp.status, data, raw };
}

/** Garante instance_id salvo = instância viva na Zapster (metadata.academy_id). */
async function resolveZapsterInstanceIdForReconcile(academyId, academyDoc) {
  const aid = String(academyId || '').trim();
  if (!aid) return '';
  let current = String((await getZapsterInstanceIdForAcademy(academyDoc, aid)) ?? '').trim();
  const fromList = await recoverZapsterInstanceIdFromList(aid);

  if (fromList && fromList !== current) {
    await persistAcademyZapsterInstanceId(aid, fromList);
    waDebug({
      step: 'reconcile_instance_rebound',
      previousPrefix: current ? current.slice(0, 8) : null,
      newPrefix: fromList.slice(0, 8)
    });
    return fromList;
  }

  if (current) {
    const probe = await zapsterGetInstanceRaw(current);
    if (probe.ok) return current;
    waDebug({
      step: 'reconcile_instance_stale',
      instanceIdPrefix: current.slice(0, 8),
      httpStatus: probe.status
    });
  }

  if (fromList) {
    await persistAcademyZapsterInstanceId(aid, fromList);
    return fromList;
  }

  return current || '';
}

async function persistAcademyZapsterInstanceId(academyId, instanceId) {
  const id = String(instanceId || '').trim();
  if (!id || !academyId) return false;
  try {
    try {
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        zapster_instance_id: id,
        zapsterInstanceId: id
      });
    } catch {
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, { zapsterInstanceId: id });
    }
    return true;
  } catch {
    return false;
  }
}

/** @param {string} raw @param {number} httpStatus */
function friendlyZapsterSendError(raw, httpStatus) {
  if (isZapsterInstanceNotFound(raw)) {
    return 'Instância WhatsApp não encontrada na Zapster (ID inválido ou instância removida). Em Agente IA, use «Verificar e corrigir» ou reconecte escaneando o QR.';
  }
  const { code, message } = zapsterFirstErrorFromBody(raw);
  if (message) return message;
  const s = String(raw || '').trim();
  if (s) return s.slice(0, 280);
  return httpStatus ? `Falha ao enviar (HTTP ${httpStatus})` : 'Falha ao enviar';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientZapsterSendError(err) {
  const status = Number(err?.zapsterHttpStatus || 0);
  if (status === 408 || status === 425 || status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  if (!status) {
    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('network')) return true;
  }
  return false;
}

/**
 * Envia na Zapster; se o ID salvo na academia estiver morto, tenta achar instância
 * pela listagem (metadata.academy_id) e persiste antes de um segundo envio.
 */
async function sendZapsterTextWithOptionalRecover({ recipient, text, academyId, initialInstanceId, sendAt }) {
  let instanceId = String(initialInstanceId || '').trim();
  const transientRetryMs = [350, 900];
  for (let attempt = 0; attempt < transientRetryMs.length + 1; attempt++) {
    try {
      return await sendZapsterText({ recipient, text, instanceId, sendAt });
    } catch (e) {
      const raw = String(e?.zapsterRaw || '');
      if (isZapsterInstanceNotFound(raw)) {
        const recovered = await recoverZapsterInstanceIdFromList(academyId);
        if (recovered && recovered !== instanceId) {
          await persistAcademyZapsterInstanceId(academyId, recovered);
          instanceId = recovered;
          continue;
        }
      }
      if (attempt < transientRetryMs.length && isTransientZapsterSendError(e)) {
        await sleep(transientRetryMs[attempt]);
        continue;
      }
      throw e;
    }
  }
  throw new Error('Falha ao enviar');
}

async function sendZapsterMediaWithOptionalRecover({
  recipient,
  mediaUrl,
  mimeType,
  caption,
  fileName,
  academyId,
  initialInstanceId
}) {
  let instanceId = String(initialInstanceId || '').trim();
  const transientRetryMs = [350, 900];
  for (let attempt = 0; attempt < transientRetryMs.length + 1; attempt++) {
    try {
      return await sendZapsterMedia({
        recipient,
        instanceId,
        mediaUrl,
        mimeType,
        caption,
        fileName
      });
    } catch (e) {
      const raw = String(e?.zapsterRaw || '');
      if (isZapsterInstanceNotFound(raw)) {
        const recovered = await recoverZapsterInstanceIdFromList(academyId);
        if (recovered && recovered !== instanceId) {
          await persistAcademyZapsterInstanceId(academyId, recovered);
          instanceId = recovered;
          continue;
        }
      }
      if (attempt < transientRetryMs.length && isTransientZapsterSendError(e)) {
        await sleep(transientRetryMs[attempt]);
        continue;
      }
      throw e;
    }
  }
  throw new Error('Falha ao enviar mídia');
}

async function findLeadByPhone(phone, academyId) {
  if (!LEADS_COL) return null;
  const candidates = [];
  const p = normalizePhone(phone);
  if (p) candidates.push(p);
  const raw = String(phone || '').trim();
  if (raw && raw !== p) candidates.push(raw);

  for (const c of candidates) {
    try {
      const list = await databases.listDocuments(DB_ID, LEADS_COL, [
        Query.equal('academyId', [academyId]),
        Query.equal('phone', [c]),
        Query.limit(1)
      ]);
      const doc = list.documents && list.documents[0] ? list.documents[0] : null;
      if (doc) return doc;
    } catch {}
  }
  return null;
}

async function appendOutboundToConversation(
  phone,
  academyId,
  academyDoc,
  text,
  { sendAtIso = '', messageId = '', status = 'sent', mediaUrl = '', mimeType = '', fileName = '' } = {}
) {
  const { doc } = await getOrCreateConversationDoc(phone, academyId, academyDoc);
  const messages = safeParseMessages(doc.messages);
  const nowIso = new Date().toISOString();
  const media = String(mediaUrl || '').trim();
  const mime = String(mimeType || '').trim();
  const mt = media ? detectMediaTypeFromMime(mime) : '';
  const row = {
    role: 'assistant',
    content: String(text || '').trim(),
    timestamp: nowIso,
    sender: 'human',
    ...(sendAtIso ? { status: 'scheduled', send_at: sendAtIso } : { status: status || 'sent' }),
    ...(messageId ? { message_id: String(messageId) } : {}),
    ...(media
      ? {
          type: mt,
          mediaUrl: media,
          mimeType: mime || null,
          media_stored: true,
          ...(mt === 'document' && fileName ? { fileName: String(fileName).trim() } : {})
        }
      : {})
  };
  messages.push(row);
  const sliced = messages.slice(-AGENT_HISTORY_WINDOW);
  await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, {
    ...conversationMessagesStoragePayload(sliced),
    updated_at: nowIso,
    ...lastMessageMetaPayload(sliced),
  });
  try {
    const leadDoc = await findLeadByPhone(phone, academyId);
    if (leadDoc) await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, { lead_id: leadDoc.$id });
  } catch {
    void 0;
  }
}

async function sendZapsterText({ recipient, text, instanceId, sendAt }) {
  const urlBase = String(ZAPSTER_API_BASE_URL || '').replace(/\/+$/, '');
  const url = `${urlBase}/v1/wa/messages`;
  const inst = String(instanceId || '').trim();
  if (!inst) throw new Error('Instância Zapster (instance_id) ausente');
  const body = { recipient, text, instance_id: inst, ...(sendAt ? { send_at: sendAt } : {}) };
  const resp = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${ZAPSTER_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const raw = await resp.text();
  if (!resp.ok) {
    const err = new Error(friendlyZapsterSendError(raw, resp.status));
    err.zapsterRaw = raw;
    err.zapsterHttpStatus = resp.status;
    throw err;
  }
  const data = safeParseJson(raw);
  const messageId = pickMessageId(data);
  return { raw, data, message_id: messageId || null };
}

function messageKey(m) {
  if (!m || typeof m !== 'object') return '';
  const role = m.role === 'assistant' ? 'assistant' : 'user';
  const ts = String(m.timestamp || '').trim();
  const c = String(m.content || '').trim();
  if (!ts || !c) return '';
  return `${role}:${ts}:${c}`;
}

function toTsMs(v) {
  const s = String(v || '').trim();
  if (!s) return 0;
  const ms = new Date(s).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function mergeMessages(existing, additions) {
  const out = Array.isArray(existing) ? existing.slice() : [];
  const indexByMessageId = new Map();
  for (let i = 0; i < out.length; i += 1) {
    const mid = String(out[i]?.message_id || '').trim();
    if (mid) indexByMessageId.set(mid, i);
  }
  const seenMessageIds = new Set(out.map((m) => String(m?.message_id || '').trim()).filter(Boolean));
  const seenKeys = new Set(out.map((m) => messageKey(m)).filter(Boolean));

  for (const a of additions || []) {
    if (!a || typeof a !== 'object') continue;
    const mid = String(a.message_id || '').trim();
    if (mid && seenMessageIds.has(mid)) {
      const idx = indexByMessageId.get(mid);
      if (Number.isInteger(idx) && idx >= 0) {
        out[idx] = mergeInboundMediaFields(out[idx], a);
      }
      continue;
    }
    const k = messageKey(a);
    if (k && seenKeys.has(k)) continue;
    out.push(a);
    if (mid) {
      seenMessageIds.add(mid);
      indexByMessageId.set(mid, out.length - 1);
    }
    if (k) seenKeys.add(k);
  }

  out.sort((a, b) => toTsMs(a?.timestamp) - toTsMs(b?.timestamp));
  return out.slice(-AGENT_HISTORY_WINDOW);
}

function pickText(v) {
  if (!v || typeof v !== 'object') return '';
  if (typeof v.text === 'string') return v.text;
  if (v.text && typeof v.text === 'object' && typeof v.text.body === 'string') return v.text.body;
  if (typeof v.message === 'string') return v.message;
  if (typeof v.content === 'string') return v.content;
  if (typeof v.body === 'string') return v.body;
  if (v.template && typeof v.template === 'object' && typeof v.template.name === 'string') return `Template: ${v.template.name}`;
  return '';
}

function pickTimestamp(v) {
  if (!v || typeof v !== 'object') return '';
  const candidates = [v.timestamp, v.created_at, v.sent_at, v.updated_at, v.scheduled_at];
  for (const c of candidates) {
    const s = String(c || '').trim();
    if (!s) continue;
    const ms = new Date(s).getTime();
    if (Number.isFinite(ms)) return s;
  }
  return '';
}

function pickMessageIdFromZapster(v) {
  if (!v || typeof v !== 'object') return '';
  const candidates = [v.message_id, v.wamid, v.whatsapp_message_id, v.id];
  for (const c of candidates) {
    const s = String(c || '').trim();
    if (s) return s;
  }
  return '';
}

function pickRecipientRaw(v) {
  if (!v || typeof v !== 'object') return '';
  const candidates = [v.recipient, v.to, v.recipient_id, v.recipientId];
  for (const c of candidates) {
    const s = rawWhatsAppChatId(c);
    if (s) return s;
  }
  return '';
}

function pickSenderRaw(v) {
  if (!v || typeof v !== 'object') return '';
  const candidates = [v.sender, v.from, v.sender_id, v.senderId];
  for (const c of candidates) {
    const s = rawWhatsAppChatId(c);
    if (s) return s;
  }
  return '';
}

function pickRecipient(v) {
  const raw = pickRecipientRaw(v);
  return raw ? normalizePhone(raw) : '';
}

function pickSender(v) {
  const raw = pickSenderRaw(v);
  return raw ? normalizePhone(raw) : '';
}

function pickConversationPhone(v, inbound) {
  if (!v || typeof v !== 'object') return '';
  const senderRaw = pickSenderRaw(v);
  const recipientRaw = pickRecipientRaw(v);
  if (isWhatsAppGroupId(senderRaw) || isWhatsAppGroupId(recipientRaw)) {
    const groupRaw = isWhatsAppGroupId(senderRaw) ? senderRaw : recipientRaw;
    return normalizePhone(groupRaw);
  }
  return inbound ? pickSender(v) : pickRecipient(v);
}

function pickGroupName(v) {
  if (!v || typeof v !== 'object') return '';
  const senderRaw = pickSenderRaw(v);
  const recipientRaw = pickRecipientRaw(v);
  const groupSide = isWhatsAppGroupId(recipientRaw) ? 'recipient' : isWhatsAppGroupId(senderRaw) ? 'sender' : '';
  const candidates = [
    groupSide === 'recipient' ? v?.recipient?.name : '',
    groupSide === 'sender' ? v?.sender?.name : '',
    v?.chat?.name,
    v?.chat?.subject,
    v?.group?.name,
    v?.group?.subject,
    v?.group_name,
    v?.groupName,
    v?.conversation?.name,
    v?.conversation?.subject,
  ];
  for (const c of candidates) {
    const s = String(c || '').trim();
    if (s) return s;
  }
  return '';
}

function pickSenderName(v) {
  if (!v || typeof v !== 'object') return '';
  const senderRaw = pickSenderRaw(v);
  const recipientRaw = pickRecipientRaw(v);
  if (isWhatsAppGroupId(senderRaw) || isWhatsAppGroupId(recipientRaw)) {
    const groupName = pickGroupName(v);
    if (groupName) return groupName;
    const phone = pickConversationPhone(v, true);
    return phone ? formatWhatsAppGroupLabel(phone) : '';
  }
  const candidates = [
    v?.sender?.name,
    v?.sender_name,
    v?.senderName,
    v?.contact_name,
    v?.contactName
  ];
  for (const c of candidates) {
    const s = String(c || '').trim();
    if (s) return s;
  }
  return '';
}

/** URL de mídia no payload da listagem Zapster (alinhado ao webhook). */
function pickMediaUrlFromZapster(v) {
  if (!v || typeof v !== 'object') return '';
  const c = v.content && typeof v.content === 'object' ? v.content : {};
  const u = String(c?.media?.url || v?.media?.url || v?.url || '').trim();
  if (u && /^https?:\/\//i.test(u)) return u;
  return '';
}

function pickZapsterMime(v, fallback) {
  if (!v || typeof v !== 'object') return String(fallback || '').trim();
  const c = v.content && typeof v.content === 'object' ? v.content : {};
  return (
    String(c?.media?.mimetype || c?.media?.mime_type || v?.mime_type || v?.mimeType || fallback || '').trim() ||
    String(fallback || '').trim()
  );
}

async function buildReconcileMediaExtras(it, zType, mediaUrl, messageId, academyId) {
  const url = String(mediaUrl || '').trim();
  if (!url) return {};
  const type = String(zType || '').trim().toLowerCase();
  if (type === 'audio' || type === 'ptt') {
    const stored = await enrichInboundMedia({
      mediaUrl: url,
      mimeType: pickZapsterMime(it, 'audio/ogg'),
      messageId,
      academyId,
    });
    return {
      type: 'audio',
      mediaUrl: stored.mediaUrl,
      storageFileId: stored.storageFileId,
      media_stored: stored.media_stored,
      mimeType: stored.mimeType,
    };
  }
  if (type === 'image') {
    const stored = await enrichInboundMedia({
      mediaUrl: url,
      mimeType: pickZapsterMime(it, 'image/jpeg'),
      messageId,
      academyId,
    });
    return {
      type: 'image',
      mediaUrl: stored.mediaUrl,
      storageFileId: stored.storageFileId,
      media_stored: stored.media_stored,
      mimeType: stored.mimeType,
    };
  }
  return {};
}

/**
 * true = mensagem do cliente, false = enviada pela instância, null = desconhecido.
 * Evita classificar `type: audio` como outbound só porque a string não contém "inbound".
 */
function zapsterInboundDirection(v) {
  if (!v || typeof v !== 'object') return null;
  const d = String(v.direction || v.flow || '').trim().toLowerCase();
  if (['inbound', 'incoming', 'received'].includes(d)) return true;
  if (['outbound', 'outgoing', 'sent'].includes(d)) return false;
  if (v.from_me === false || v.fromMe === false) return true;
  if (v.from_me === true || v.fromMe === true) return false;
  return null;
}

function isInboundMessage(v) {
  if (!v || typeof v !== 'object') return false;
  const raw = String(v.direction || v.type || v.event || '').trim().toLowerCase();
  if (!raw) return false;
  return raw.includes('inbound') || raw.includes('incoming') || raw.includes('received');
}

/** Janela de backfill na Zapster (GET /v1/wa/messages). Padrão 23h (planos base = 24h). */
function zapsterReconcileAllowExtended() {
  return ['1', 'true', 'yes'].includes(
    String(process.env.ZAPSTER_RECONCILE_ALLOW_EXTENDED || '').trim().toLowerCase()
  );
}

function resolveReconcileWindow(body) {
  const allowExtended = zapsterReconcileAllowExtended();
  const planCapHours = allowExtended
    ? Math.min(
        720,
        Math.max(1, Number.parseInt(String(process.env.ZAPSTER_RECONCILE_MAX_HOURS || '720'), 10) || 720)
      )
    : 23;
  const defaultHours = allowExtended
    ? Math.min(
        planCapHours,
        Math.max(1, Number.parseInt(String(process.env.ZAPSTER_RECONCILE_DEFAULT_HOURS || '23'), 10) || 23)
      )
    : 23;
  let hours = defaultHours;
  const b = body && typeof body === 'object' ? body : {};
  const daysRaw = Number(b.days);
  const hoursRaw = Number(b.hours);
  if (Number.isFinite(daysRaw) && daysRaw > 0) hours = daysRaw * 24;
  else if (Number.isFinite(hoursRaw) && hoursRaw > 0) hours = hoursRaw;
  hours = Math.min(planCapHours, Math.max(1, Math.round(hours)));
  return { hours, fromIso: new Date(Date.now() - hours * 60 * 60 * 1000).toISOString() };
}

function isZapsterRetentionExceededError(err) {
  const code = String(err?.zapsterCode || '').trim();
  if (code === 'messages_retention_exceeded') return true;
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('messages_retention_exceeded') || msg.includes('message history up to 24h');
}

function extractZapsterMessagePageItems(page) {
  if (!page || typeof page !== 'object') return [];
  if (Array.isArray(page.data)) return page.data;
  if (page.data && typeof page.data === 'object') {
    const nested = page.data;
    if (Array.isArray(nested.messages)) return nested.messages;
    if (Array.isArray(nested.items)) return nested.items;
  }
  if (Array.isArray(page.messages)) return page.messages;
  if (Array.isArray(page.items)) return page.items;
  return [];
}

async function fetchZapsterMessagePages({ fromIso, toIso, instanceId, maxPages = 30, limit = 100 }) {
  const items = [];
  let after = '';
  let pages = 0;
  for (;;) {
    pages += 1;
    const page = await listZapsterMessages({ from: fromIso, to: toIso, after, limit, instanceId });
    const dataArr = extractZapsterMessagePageItems(page);
    items.push(...dataArr);
    waDebug({
      step: 'reconcile_page',
      page: pages,
      batchSize: dataArr.length,
      itemsTotal: items.length,
      hasMore: Boolean(page?.meta?.has_more),
    });
    const hasMore = Boolean(page?.meta?.has_more);
    const nextCursor = typeof page?.meta?.next_cursor === 'string' ? page.meta.next_cursor : '';
    if (!hasMore || !nextCursor) break;
    after = nextCursor;
    if (pages >= maxPages) break;
  }
  return { items, pages };
}

/** Se o plano limita 24h, tenta janelas menores antes de falhar. */
async function fetchZapsterMessagesWithRetentionRetry({ toIso, instanceId, reconcileBody }) {
  const { hours: requestedHours } = resolveReconcileWindow(reconcileBody);
  const hourAttempts = [...new Set([requestedHours, 22, 18, 12, 6, 1].filter((h) => h >= 1 && h <= requestedHours))];
  let lastErr = null;

  for (const hours of hourAttempts) {
    const fromIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    try {
      const { items, pages } = await fetchZapsterMessagePages({ fromIso, toIso, instanceId });
      return { items, pages, fromIso, reconcileHours: hours, retried: hours !== requestedHours };
    } catch (e) {
      lastErr = e;
      if (!isZapsterRetentionExceededError(e)) throw e;
      waDebug({
        step: 'reconcile_retention_retry',
        attemptedHours: hours,
        erro: e?.message || String(e),
      });
    }
  }

  throw lastErr || new Error('messages_retention_exceeded');
}

function throwIfZapsterErrors(data, raw, resp) {
  if (data && typeof data === 'object' && Array.isArray(data.errors) && data.errors.length > 0) {
    const first = data.errors[0];
    const code = typeof first?.code === 'string' ? first.code : '';
    const msg = typeof first?.message === 'string' ? first.message : 'Erro Zapster';
    const err = new Error(msg);
    err.zapsterCode = code;
    throw err;
  }
  if (!resp.ok) throw new Error(raw || `HTTP ${resp.status}`);
}

async function listZapsterMessages({ from, to, after, limit, instanceId }) {
  const urlBase = String(ZAPSTER_API_BASE_URL || '').replace(/\/+$/, '');
  const qs = new URLSearchParams();
  qs.set('from', from);
  qs.set('to', to);
  qs.set('limit', String(limit || 100));
  qs.set('instance_id', String(instanceId || '').trim());
  if (after) qs.set('after', after);
  const url = `${urlBase}/v1/wa/messages?${qs.toString()}`;

  const headers = { authorization: `Bearer ${ZAPSTER_TOKEN}` };
  const inst = String(instanceId || '').trim();
  if (inst) headers['X-Instance-ID'] = inst;
  const resp = await fetch(url, { headers });
  const raw = await resp.text();
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }
  throwIfZapsterErrors(data, raw, resp);
  return data;
}

function baseUrl() {
  return String(ZAPSTER_API_BASE_URL || '').replace(/\/+$/, '');
}

async function zapsterCancelMessage(id) {
  const url = `${baseUrl()}/v1/wa/messages/${encodeURIComponent(String(id))}`;
  const resp = await fetch(url, { method: 'DELETE', headers: { authorization: `Bearer ${ZAPSTER_TOKEN}` } });
  const raw = await resp.text();
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }
  return { ok: resp.ok, status: resp.status, raw, data };
}

export default async function handler(req, res) {
  try {
    const url = String(req.url || '');
    const qRoute = firstQueryString(req.query.route);
    const isZapsterWebhook =
      qRoute === 'webhook' || url.includes('/webhook/zapster') || url.includes('route=webhook');
    if (isZapsterWebhook) {
      return webhookHandler(req, res);
    }
    const isZapsterInstances =
      qRoute === 'instances' ||
      url.includes('/api/zapster/instances') ||
      url.includes('/api/zapster');
    if (isZapsterInstances) {
      if (!hasZapsterApiToken()) {
        return zapsterTokenMissingResponse(res);
      }
      return instancesHandler(req, res);
    }

    if (!ensureConfigOk(res)) return;

    const action = String(req.query?.action || '').trim().toLowerCase();
    if (!action) {
      res.setHeader('Allow', 'POST, DELETE');
      return res.status(400).json({ sucesso: false, erro: 'action ausente' });
    }

    const me = await ensureAuth(req, res);
    if (!me) return;
    const access = await ensureAcademyAccess(req, res, me);
    if (!access) return;
    const { doc: academyDoc, academyId } = access;

    waDebug({
      step: 'request',
      method: req.method,
      action,
      academyId: String(academyId || '').trim(),
      url: String(req.url || '').slice(0, 200),
    });

    if (action === 'send') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
    }
    if (!ensureJson(req, res)) return;
    const phone = normalizePhone(req.body?.phone || '');
    const text = String(req.body?.text || '').trim();
    const mediaUrl = String(req.body?.mediaUrl || req.body?.media_url || '').trim();
    const mimeType = String(req.body?.mimeType || req.body?.mime_type || '').trim();
    const caption = String(req.body?.caption || '').trim();
    const fileName = String(req.body?.fileName || req.body?.file_name || '').trim();
    const sendAtRaw = String(req.body?.send_at || '').trim();
    const proactiveSend = req.body?.proactive === true || req.body?.proactive === 'true';
    const proactiveLeadId = String(req.body?.lead_id || req.body?.leadId || '').trim();
    if (!phone || (!text && !mediaUrl)) {
      return res.status(400).json({ sucesso: false, erro: 'Campos obrigatórios ausentes' });
    }
    if (proactiveSend) {
      const gate = await checkProactiveWhatsappAllowed({
        phone,
        academyId,
        leadId: proactiveLeadId,
      });
      if (!gate.allowed) {
        return res.status(409).json({
          sucesso: false,
          skipped: PROACTIVE_SKIP_REASON,
          code: PROACTIVE_SKIP_REASON,
          erro: gate.message || proactiveWhatsappUserMessage(gate.windowDays),
        });
      }
    }
    if (mediaUrl && sendAtRaw) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Agendamento não está disponível para envio de mídia nesta versão.'
      });
    }
    let sendAtIso = '';
    try {
      waDebug({
        step: 'send_start',
        phoneLen: phone.length,
        phoneSuffix4: phone.length >= 4 ? phone.slice(-4) : '',
        textLen: text.length,
        hasMediaUrl: Boolean(mediaUrl),
        hasSendAtRaw: Boolean(sendAtRaw),
      });
      const instanceId = await getZapsterInstanceIdForAcademy(academyDoc, academyId);
      waDebug({
        step: 'send_instance',
        hasInstanceId: Boolean(String(instanceId || '').trim()),
        instanceIdPrefix: String(instanceId || '').trim().slice(0, 8),
      });
      if (sendAtRaw) {
        const ms = new Date(sendAtRaw).getTime();
        if (!Number.isFinite(ms)) return res.status(400).json({ sucesso: false, erro: 'send_at inválido (use ISO 8601)' });
        const now = Date.now();
        const max = now + 7 * 24 * 60 * 60 * 1000;
        if (ms <= now + 30 * 1000) return res.status(400).json({ sucesso: false, erro: 'send_at deve ser no futuro' });
        if (ms > max) return res.status(400).json({ sucesso: false, erro: 'send_at excede o limite do plano (até 7 dias)' });
        sendAtIso = new Date(ms).toISOString();
      }

      if (!String(instanceId || '').trim()) {
        if (sendAtIso || mediaUrl) {
          return res.status(400).json({
            sucesso: false,
            erro: 'Para enviar mídia ou agendar mensagens é preciso conectar o WhatsApp (instância Zapster) em Agente IA.'
          });
        }
        const waMeUrl = buildWaMeUrl(phone, text);
        if (!waMeUrl) return res.status(400).json({ sucesso: false, erro: 'Telefone inválido para abrir o WhatsApp.' });
        waDebug({ step: 'send_channel', channel: 'wa_me', appendConversation: true });
        await appendOutboundToConversation(phone, academyId, academyDoc, text, { status: 'wa_me' });
        return res.status(200).json({
          sucesso: true,
          enviado: false,
          channel: 'wa_me',
          wa_me_url: waMeUrl,
          status: 'wa_me',
          send_at: null,
          message_id: null
        });
      }

      const outboundText = text || caption || '';
      const persistOpts = {
        sendAtIso,
        messageId: '',
        mediaUrl: mediaUrl || '',
        mimeType: mimeType || '',
        fileName: fileName || ''
      };

      if (mediaUrl) {
        waDebug({ step: 'send_channel', channel: 'zapster_api_media' });
        const sent = await sendZapsterMediaWithOptionalRecover({
          recipient: phone,
          mediaUrl,
          mimeType: mimeType || 'image/jpeg',
          caption: caption || text,
          fileName,
          academyId,
          initialInstanceId: instanceId
        });
        persistOpts.messageId = sent?.message_id ? String(sent.message_id) : '';
        const contentForStore =
          outboundText ||
          (detectMediaTypeFromMime(mimeType) === 'image'
            ? '[imagem]'
            : detectMediaTypeFromMime(mimeType) === 'audio'
              ? '🎵 [Áudio enviado]'
              : '📄 [Documento enviado]');
        await appendOutboundToConversation(phone, academyId, academyDoc, contentForStore, persistOpts);
        waDebug({
          step: 'send_ok',
          status: 'sent',
          hasMessageId: Boolean(sent?.message_id),
          media: true
        });
        return res.status(200).json({
          sucesso: true,
          enviado: true,
          status: 'sent',
          send_at: null,
          message_id: sent?.message_id ? String(sent.message_id) : null
        });
      }

      waDebug({ step: 'send_channel', channel: 'zapster_api', scheduled: Boolean(sendAtIso) });
      const sent = await sendZapsterTextWithOptionalRecover({
        recipient: phone,
        text,
        academyId,
        initialInstanceId: instanceId,
        sendAt: sendAtIso
      });
      await appendOutboundToConversation(phone, academyId, academyDoc, text, {
        sendAtIso,
        messageId: sent?.message_id ? String(sent.message_id) : ''
      });
      waDebug({
        step: 'send_ok',
        status: sendAtIso ? 'scheduled' : 'sent',
        hasMessageId: Boolean(sent?.message_id),
      });
      return res.status(200).json({
        sucesso: true,
        enviado: true,
        status: sendAtIso ? 'scheduled' : 'sent',
        send_at: sendAtIso || null,
        message_id: sent?.message_id ? String(sent.message_id) : null
      });
    } catch (e) {
      const raw = String(e?.zapsterRaw || '');
      if (!sendAtIso && isZapsterInstanceNotFound(raw)) {
        const waMeUrl = buildWaMeUrl(phone, text);
        if (waMeUrl) {
          try {
            await appendOutboundToConversation(phone, academyId, academyDoc, text, { status: 'wa_me' });
            return res.status(200).json({
              sucesso: true,
              enviado: false,
              channel: 'wa_me',
              wa_me_url: waMeUrl,
              status: 'wa_me',
              send_at: null,
              message_id: null
            });
          } catch (inner) {
            console.error('[api/whatsapp] send wa_me append falhou', { phone, erro: inner?.message || inner });
            waDebug({
              step: 'send_wa_me_append_error',
              erro: inner?.message || String(inner),
              stack: String(inner?.stack || '').slice(0, 1200),
            });
            return res.status(500).json({ sucesso: false, erro: inner?.message || 'Erro ao gravar conversa' });
          }
        }
      }
      console.error('[api/whatsapp] send falhou', {
        phone: normalizePhone(req.body?.phone || ''),
        erro: e?.message || String(e),
        zapsterRaw: typeof e?.zapsterRaw === 'string' ? e.zapsterRaw.slice(0, 400) : undefined
      });
      waDebug({
        step: 'send_error',
        erro: e?.message || String(e),
        zapsterRaw: typeof e?.zapsterRaw === 'string' ? e.zapsterRaw.slice(0, 600) : undefined,
        stack: String(e?.stack || '').slice(0, 1200),
      });
      return res.status(500).json({ sucesso: false, erro: e?.message || 'Erro interno' });
    }
  }

    if (action === 'reconcile') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
    }
    let instanceId = String((await resolveZapsterInstanceIdForReconcile(academyId, academyDoc)) ?? '').trim();
    if (!instanceId) return res.status(400).json({ sucesso: false, erro: 'Instância Zapster não configurada' });

    let reconcileBody = {};
    try {
      if (req.body && typeof req.body === 'object') reconcileBody = req.body;
      else if (typeof req.body === 'string' && req.body.trim()) reconcileBody = JSON.parse(req.body);
    } catch {
      reconcileBody = {};
    }

    const now = Date.now();
    const toIso = new Date(now).toISOString();
    waDebug({
      step: 'reconcile_start',
      toIso,
      requested: resolveReconcileWindow(reconcileBody),
      instanceIdPrefix: instanceId.slice(0, 8),
    });
    try {
      let { items, pages, fromIso, reconcileHours } = await fetchZapsterMessagesWithRetentionRetry({
        toIso,
        instanceId,
        reconcileBody,
      });

      // Se veio vazio, o instance_id salvo pode estar desatualizado.
      // Tenta recuperar pela metadata da instância e refazer a busca uma vez.
      if (items.length === 0) {
        const recovered = String((await recoverZapsterInstanceIdFromList(academyId)) || '').trim();
        if (recovered && recovered !== instanceId) {
          await persistAcademyZapsterInstanceId(academyId, recovered);
          waDebug({
            step: 'reconcile_instance_recovered',
            oldInstanceIdPrefix: instanceId.slice(0, 8),
            newInstanceIdPrefix: recovered.slice(0, 8)
          });
          instanceId = recovered;
          ({ items, pages, fromIso, reconcileHours } = await fetchZapsterMessagesWithRetentionRetry({
            toIso,
            instanceId,
            reconcileBody,
          }));
        }
      }

      const grouped = new Map();
      for (const it of items) {
        if (!it || typeof it !== 'object') continue;
        let inbound = isInboundMessage(it);
        const dirHint = zapsterInboundDirection(it);
        if (dirHint !== null) inbound = dirHint;

        let text = String(pickText(it) || '').trim();
        const zType = String(it?.type || it?.content?.type || '').trim().toLowerCase();
        const mediaUrl = pickMediaUrlFromZapster(it);
        const messageId = pickMessageIdFromZapster(it);
        let mediaExtras = {};
        if (mediaUrl && (zType === 'audio' || zType === 'ptt' || zType === 'image')) {
          mediaExtras = await buildReconcileMediaExtras(it, zType, mediaUrl, messageId, academyId);
          if (!text) {
            if (zType === 'audio' || zType === 'ptt') text = '🎵 [Áudio recebido]';
            else if (zType === 'image') text = '[imagem]';
          }
        }
        if (!text) continue;
        const phone = pickConversationPhone(it, inbound);
        if (!phone) continue;
        const timestamp = pickTimestamp(it) || new Date().toISOString();
        const status = typeof it?.status === 'string' ? String(it.status).trim() : '';
        const sendAt = typeof it?.send_at === 'string' ? String(it.send_at).trim() : '';
        const canceledAt = typeof it?.canceled_at === 'string' ? String(it.canceled_at).trim() : '';
        const msg = inbound
          ? {
              role: 'user',
              content: text,
              timestamp,
              ...(messageId ? { message_id: messageId } : {}),
              ...(status ? { status } : {}),
              ...(sendAt ? { send_at: sendAt } : {}),
              ...(canceledAt ? { canceled_at: canceledAt } : {}),
              ...mediaExtras,
              ...(isWhatsAppGroupId(phone)
                ? groupParticipantMessageFields({
                    participantName: pickZapsterParticipantName(it),
                  })
                : {}),
            }
          : {
              role: 'assistant',
              content: text,
              timestamp,
              ...(messageId ? { message_id: messageId } : {}),
              ...(status ? { status } : {}),
              ...(sendAt ? { send_at: sendAt } : {}),
              ...(canceledAt ? { canceled_at: canceledAt } : {}),
              ...mediaExtras
            };
        const senderName = pickSenderName(it);
        const bucket = grouped.get(phone) || { messages: [], whatsappName: '', whatsappProfileImageUrl: '' };
        bucket.messages.push(msg);
        if (!bucket.whatsappName && senderName) bucket.whatsappName = senderName;
        if (inbound) {
          const pic = pickSenderProfileImageUrl(it);
          if (pic && !bucket.whatsappProfileImageUrl) bucket.whatsappProfileImageUrl = pic;
        }
        grouped.set(phone, bucket);
      }

      waDebug({
        step: 'reconcile_grouped',
        zapsterItems: items.length,
        distinctPhones: grouped.size,
      });

      let conversationsUpdated = 0;
      let conversationsCreated = 0;
      let messagesMerged = 0;
      const errors = [];

      for (const [phone, bucket] of grouped.entries()) {
        try {
          const msgs = Array.isArray(bucket?.messages) ? bucket.messages : [];
          const { doc, created } = await getOrCreateConversationDoc(phone, academyId, academyDoc);
          if (created) conversationsCreated += 1;
          const current = await databases.getDocument(DB_ID, CONVERSATIONS_COL, doc.$id);
          const history = safeParseMessages(current?.messages);
          const merged = mergeMessages(history, msgs);
          const newest = merged.length > 0 ? merged[merged.length - 1] : null;
          const updatedAt = newest?.timestamp ? String(newest.timestamp) : new Date().toISOString();
          let lastUserMsgAt = '';
          for (let i = merged.length - 1; i >= 0; i--) {
            const m = merged[i];
            if (m && m.role === 'user' && typeof m.timestamp === 'string' && String(m.timestamp).trim()) {
              lastUserMsgAt = String(m.timestamp).trim();
              break;
            }
          }
          const docPayload = {
            ...conversationMessagesStoragePayload(merged),
            updated_at: updatedAt,
            ...lastMessageMetaPayload(merged),
          };
          if (lastUserMsgAt) docPayload.last_user_msg_at = lastUserMsgAt;
          const lastReadAt = String(current?.last_read_at || '').trim();
          const prevUnread = Number.isFinite(Number(current?.unread_count)) ? Number(current.unread_count) : 0;
          docPayload.unread_count = resolveUnreadCountAfterMerge({
            messages: merged,
            lastReadAt,
            prevUnread,
            historyMessages: history,
          });
          const waName = String(bucket?.whatsappName || '').trim();
          let waPic = String(bucket?.whatsappProfileImageUrl || '').trim();
          if (!waPic || !/^https?:\/\//i.test(waPic)) {
            const fetchedPic = await fetchZapsterRecipientProfilePicture(instanceId, phone);
            if (fetchedPic) waPic = fetchedPic;
          }
          const picOk = Boolean(waPic && /^https?:\/\//i.test(waPic));
          const currentContactName = String(current?.contact_name || '').trim();
          const currentSource = String(current?.contact_name_source || '').trim().toLowerCase();
          const shouldFillContactName = waName && (!currentContactName || currentSource !== 'manual');
          if (waName) {
            docPayload.whatsapp_profile_name = waName;
            docPayload.whatsapp_profile_name_updated_at = new Date().toISOString();
          }
          if (picOk) {
            docPayload.whatsapp_profile_image_url = waPic;
            docPayload.whatsapp_profile_image_updated_at = new Date().toISOString();
          }
          if (shouldFillContactName) {
            docPayload.contact_name = waName;
            docPayload.contact_name_source = 'whatsapp';
            docPayload.contact_name_updated_at = new Date().toISOString();
          }
          try {
            await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, docPayload);
          } catch {
            const fallbackPayload = {
              ...conversationMessagesStoragePayload(merged),
              updated_at: updatedAt,
            };
            if (shouldFillContactName) fallbackPayload.contact_name = waName;
            if (picOk) {
              fallbackPayload.whatsapp_profile_image_url = waPic;
              fallbackPayload.whatsapp_profile_image_updated_at = new Date().toISOString();
            }
            try {
              await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, fallbackPayload);
            } catch {
              await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, {
                ...conversationMessagesStoragePayload(merged),
                updated_at: updatedAt,
              });
            }
          }
          conversationsUpdated += 1;
          messagesMerged += Math.max(0, merged.length - history.length);
        } catch (e) {
          const errMsg = String(e?.message || 'Erro');
          errors.push({ phone, erro: errMsg });
          waDebug({
            step: 'reconcile_phone_error',
            phoneSuffix4: phone.length >= 4 ? phone.slice(-4) : '',
            erro: errMsg,
          });
        }
      }

      waDebug({
        step: 'reconcile_done',
        pages,
        conversations_updated: conversationsUpdated,
        conversations_created: conversationsCreated,
        messages_merged: messagesMerged,
        errorsCount: errors.length,
      });

      return res.status(200).json({
        sucesso: true,
        from: fromIso,
        to: toIso,
        reconcile_hours: reconcileHours,
        instance_id_prefix: String(instanceId || '').slice(0, 8) || null,
        pages,
        zapster_items: items.length,
        phones: grouped.size,
        conversations_updated: conversationsUpdated,
        conversations_created: conversationsCreated,
        messages_merged: messagesMerged,
        hint:
          items.length === 0
            ? 'A API Zapster não retornou mensagens no período. Isso é comum quando o histórico entrou só pelo webhook/celular — use reidratação de mídia na conversa aberta.'
            : null,
        errors
      });
    } catch (e) {
      if (isZapsterRetentionExceededError(e)) {
        return res.status(402).json({
          sucesso: false,
          code: 'messages_retention_exceeded',
          erro:
            'Seu plano Zapster só permite importar mensagens das últimas 24h. Mensagens mais antigas não podem ser recuperadas por aqui — novas mensagens entram pelo webhook em tempo real.'
        });
      }
      console.error('[api/whatsapp] reconcile falhou', {
        academyId,
        instanceId: String(instanceId || '').slice(0, 8) + '…',
        erro: e?.message || String(e),
        zapsterCode: e?.zapsterCode
      });
      waDebug({
        step: 'reconcile_error',
        erro: e?.message || String(e),
        zapsterCode: e?.zapsterCode,
        stack: String(e?.stack || '').slice(0, 1200),
      });
      return res.status(500).json({ sucesso: false, erro: e?.message || 'Erro ao atualizar' });
    }
  }

    if (action === 'cancel') {
    if (!(req.method === 'POST' || req.method === 'DELETE')) {
      res.setHeader('Allow', 'POST, DELETE');
      return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
    }
    if (!ensureJson(req, res)) return;
    const phone = normalizePhone(req.body?.phone || '');
    const messageId = String(req.body?.message_id || req.body?.id || '').trim();
    if (!phone || !messageId) return res.status(400).json({ sucesso: false, erro: 'phone e message_id são obrigatórios' });

    try {
      const list = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, [
        Query.equal('phone_number', [phone]),
        Query.equal('academy_id', [academyId]),
        Query.limit(1)
      ]);
      const doc = list.documents && list.documents[0] ? list.documents[0] : null;
      if (!doc || !doc.$id) return res.status(404).json({ sucesso: false, erro: 'Conversa não encontrada' });

      const history = (() => {
        if (!doc.messages) return [];
        try {
          const parsed = JSON.parse(doc.messages);
          return Array.isArray(parsed) ? parsed.filter((m) => m && typeof m === 'object') : [];
        } catch {
          return [];
        }
      })();
      const idx = history.findIndex((m) => String(m?.message_id || '').trim() === messageId);
      if (idx < 0) return res.status(404).json({ sucesso: false, erro: 'Mensagem não encontrada no histórico' });

      const curStatus = String(history[idx]?.status || '').trim().toLowerCase();
      if (!(curStatus === 'scheduled' || curStatus === 'pending')) {
        return res.status(422).json({ sucesso: false, erro: 'Só é possível cancelar mensagens agendadas' });
      }

      const z = await zapsterCancelMessage(messageId);
      if (!z.ok) {
        const msg =
          typeof z?.data?.message === 'string'
            ? z.data.message
            : typeof z?.data?.erro === 'string'
            ? z.data.erro
            : String(z.raw || '').slice(0, 300) || `HTTP ${z.status}`;
        return res.status(z.status === 422 ? 422 : 500).json({ sucesso: false, erro: msg || 'Falha ao cancelar' });
      }

      const nowIso = new Date().toISOString();
      const updated = history.slice();
      updated[idx] = {
        ...(updated[idx] && typeof updated[idx] === 'object' ? updated[idx] : {}),
        status: 'canceled',
        canceled_at: nowIso
      };
      const sliced = updated.slice(-AGENT_HISTORY_WINDOW);
      await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, {
        ...conversationMessagesStoragePayload(sliced),
        updated_at: nowIso,
        ...lastMessageMetaPayload(sliced),
      });

      return res.status(200).json({ sucesso: true, id: messageId, status: 'canceled', canceled_at: nowIso });
    } catch (e) {
      return res.status(500).json({ sucesso: false, erro: e?.message || 'Erro ao cancelar' });
    }
  }

    res.setHeader('Allow', 'POST, DELETE');
    return res.status(400).json({ sucesso: false, erro: 'action inválida' });
  } catch (e) {
    console.error('[api/whatsapp] unhandled error', {
      erro: e?.message || String(e),
      stack: String(e?.stack || '').slice(0, 2000)
    });
    return res.status(500).json({ sucesso: false, erro: e?.message || 'Erro interno' });
  }
}


