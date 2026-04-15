import { Account, Client, Databases, ID, Permission, Query, Role, Teams } from 'node-appwrite';
import { AGENT_HISTORY_WINDOW } from '../lib/constants.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
const DEFAULT_ACADEMY_ID = process.env.DEFAULT_ACADEMY_ID || process.env.VITE_DEFAULT_ACADEMY_ID || '';

const ZAPSTER_API_BASE_URL = process.env.ZAPSTER_API_BASE_URL || 'https://api.zapsterapi.com';
const ZAPSTER_TOKEN = process.env.ZAPSTER_TOKEN || process.env.ZAPSTER_API_TOKEN || '';
const ZAPSTER_INSTANCE_ID = process.env.ZAPSTER_INSTANCE_ID || '';

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

async function ensureAuth(req, res) {
  const auth = String(req.headers.authorization || '');
  if (!auth.toLowerCase().startsWith('bearer ')) {
    res.status(401).json({ sucesso: false, erro: 'JWT ausente' });
    return null;
  }
  const jwt = auth.slice(7).trim();
  if (!jwt) {
    res.status(401).json({ sucesso: false, erro: 'JWT inválido' });
    return null;
  }
  try {
    const userClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setJWT(jwt);
    const account = new Account(userClient);
    const me = await account.get();
    return me;
  } catch {
    res.status(401).json({ sucesso: false, erro: 'JWT inválido' });
    return null;
  }
}

function normalizePhone(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  return raw.replace(/[^\d]/g, '');
}

function resolveAcademyId(req) {
  const h = String(req.headers['x-academy-id'] || '').trim();
  if (h) return h;
  return String(DEFAULT_ACADEMY_ID || '').trim();
}

async function ensureAcademyAccess(req, res, me) {
  const academyId = resolveAcademyId(req);
  if (!academyId) {
    res.status(400).json({ sucesso: false, erro: 'x-academy-id ausente' });
    return null;
  }
  try {
    const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
    const ownerId = String(doc?.ownerId || '').trim();
    const userId = String(me?.$id || '').trim();
    if (ownerId && userId && ownerId === userId) return doc;

    const teamId = String(doc?.teamId || '').trim();
    if (teamId && userId) {
      try {
        const memberships = await teams.listMemberships(teamId, [Query.equal('userId', [userId]), Query.limit(1)]);
        const list = Array.isArray(memberships?.memberships) ? memberships.memberships : [];
        if (list.length > 0) return doc;
      } catch {
        void 0;
      }
    }

    res.status(403).json({ sucesso: false, erro: 'Acesso negado à academia' });
    return null;
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: e?.message || 'Erro ao validar academia' });
    return null;
  }
}

function safeParseMessages(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m) => m && typeof m === 'object')
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: typeof m.content === 'string' ? m.content : String(m.content || ''),
        timestamp: typeof m.timestamp === 'string' ? m.timestamp : new Date().toISOString(),
        sender: typeof m.sender === 'string' ? m.sender : undefined,
        in_reply_to: typeof m.in_reply_to === 'string' ? m.in_reply_to : undefined,
        message_id: typeof m.message_id === 'string' ? m.message_id : undefined,
        status: typeof m.status === 'string' ? m.status : undefined,
        send_at: typeof m.send_at === 'string' ? m.send_at : undefined,
        canceled_at: typeof m.canceled_at === 'string' ? m.canceled_at : undefined,
        classificacao: m.classificacao && typeof m.classificacao === 'object' ? m.classificacao : undefined
      }));
  } catch {
    return [];
  }
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
    { phone_number: phone, messages: JSON.stringify([]), updated_at: nowIso, academy_id: academyId },
    permissionsForAcademyDoc(academyDoc)
  );
  return { doc: created, created: true };
}

async function getZapsterInstanceIdForAcademy(academyDoc, academyId) {
  const fallback = String(ZAPSTER_INSTANCE_ID || '').trim();
  const id = String(academyId || '').trim();
  if (!id || !ACADEMIES_COL) return fallback;
  const direct = String(academyDoc?.zapster_instance_id || academyDoc?.zapsterInstanceId || '').trim();
  if (direct) return direct;
  try {
    const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, id);
    const v = String(doc?.zapster_instance_id || doc?.zapsterInstanceId || '').trim();
    return v || fallback;
  } catch {
    return fallback;
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

/** @param {unknown} data */
function normalizeWaInstancesList(data) {
  let arr = [];
  if (Array.isArray(data)) arr = data;
  else if (data && typeof data === 'object') {
    const o = /** @type {Record<string, unknown>} */ (data);
    if (Array.isArray(o.instances)) arr = o.instances;
    else if (Array.isArray(o.data)) arr = o.data;
    else if (o.id) arr = [o];
  }
  return arr
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const r = /** @type {Record<string, unknown>} */ (row);
      const id = String(r.id || r.instance_id || '').trim();
      const meta = r.metadata && typeof r.metadata === 'object' ? /** @type {Record<string, unknown>} */ (r.metadata) : {};
      const academyFromMeta = String(meta.academy_id || meta.academyId || '').trim();
      return { id, metadataAcademyId: academyFromMeta };
    })
    .filter((x) => x.id);
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

/**
 * Se a Zapster ainda tiver uma instância com metadata.academy_id = academyId, devolve o id.
 * @param {string} academyId
 */
async function recoverZapsterInstanceIdFromList(academyId) {
  const aid = String(academyId || '').trim();
  if (!aid) return '';
  const listed = await zapsterListInstancesRaw();
  if (!listed.ok || !listed.data) return '';
  const items = normalizeWaInstancesList(listed.data);
  const match = items.find((it) => String(it.metadataAcademyId || '').trim() === aid);
  return match?.id ? String(match.id).trim() : '';
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

/**
 * Envia na Zapster; se o ID salvo na academia estiver morto, tenta achar instância
 * pela listagem (metadata.academy_id) e persiste antes de um segundo envio.
 */
async function sendZapsterTextWithOptionalRecover({ recipient, text, academyId, initialInstanceId, sendAt }) {
  let instanceId = String(initialInstanceId || '').trim();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await sendZapsterText({ recipient, text, instanceId, sendAt });
    } catch (e) {
      const raw = String(e?.zapsterRaw || '');
      if (attempt === 0 && isZapsterInstanceNotFound(raw)) {
        const recovered = await recoverZapsterInstanceIdFromList(academyId);
        if (recovered && recovered !== instanceId) {
          await persistAcademyZapsterInstanceId(academyId, recovered);
          instanceId = recovered;
          continue;
        }
      }
      throw e;
    }
  }
  throw new Error('Falha ao enviar');
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

async function sendZapsterText({ recipient, text, instanceId, sendAt }) {
  const urlBase = String(ZAPSTER_API_BASE_URL || '').replace(/\/+$/, '');
  const url = `${urlBase}/v1/wa/messages`;
  const inst = String(instanceId || '').trim();
  if (!inst) throw new Error('ZAPSTER_INSTANCE_ID ausente');
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
  const seenMessageIds = new Set(out.map((m) => String(m?.message_id || '').trim()).filter(Boolean));
  const seenKeys = new Set(out.map((m) => messageKey(m)).filter(Boolean));

  for (const a of additions || []) {
    if (!a || typeof a !== 'object') continue;
    const mid = String(a.message_id || '').trim();
    if (mid && seenMessageIds.has(mid)) continue;
    const k = messageKey(a);
    if (k && seenKeys.has(k)) continue;
    out.push(a);
    if (mid) seenMessageIds.add(mid);
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

function pickRecipient(v) {
  if (!v || typeof v !== 'object') return '';
  const candidates = [v.recipient, v.to, v.recipient_id, v.recipientId, v.recipient?.id];
  for (const c of candidates) {
    const s = normalizePhone(c);
    if (s) return s;
  }
  return '';
}

function pickSender(v) {
  if (!v || typeof v !== 'object') return '';
  const candidates = [v.sender, v.from, v.sender_id, v.senderId, v.sender?.id];
  for (const c of candidates) {
    const s = normalizePhone(c);
    if (s) return s;
  }
  return '';
}

function isInboundMessage(v) {
  if (!v || typeof v !== 'object') return false;
  const raw = String(v.direction || v.type || v.event || '').trim().toLowerCase();
  if (!raw) return false;
  return raw.includes('inbound') || raw.includes('incoming') || raw.includes('received');
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

  const resp = await fetch(url, { headers: { authorization: `Bearer ${ZAPSTER_TOKEN}` } });
  const raw = await resp.text();
  if (!resp.ok) throw new Error(raw || `HTTP ${resp.status}`);
  const data = JSON.parse(raw);
  if (data && typeof data === 'object' && Array.isArray(data.errors) && data.errors.length > 0) {
    const first = data.errors[0];
    const code = typeof first?.code === 'string' ? first.code : '';
    const msg = typeof first?.message === 'string' ? first.message : 'Erro Zapster';
    const err = new Error(msg);
    err.zapsterCode = code;
    throw err;
  }
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
  if (!ensureConfigOk(res)) return;

  const action = String(req.query?.action || '').trim().toLowerCase();
  if (!action) {
    res.setHeader('Allow', 'POST, DELETE');
    return res.status(400).json({ sucesso: false, erro: 'action ausente' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const academyDoc = await ensureAcademyAccess(req, res, me);
  if (!academyDoc) return;
  const academyId = String(academyDoc.$id || '').trim();

  if (action === 'send') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
    }
    if (!ensureJson(req, res)) return;
    const phone = normalizePhone(req.body?.phone || '');
    const text = String(req.body?.text || '').trim();
    const sendAtRaw = String(req.body?.send_at || '').trim();
    if (!phone || !text) return res.status(400).json({ sucesso: false, erro: 'Campos obrigatórios ausentes' });
    try {
      const instanceId = await getZapsterInstanceIdForAcademy(academyDoc, academyId);
      let sendAtIso = '';
      if (sendAtRaw) {
        const ms = new Date(sendAtRaw).getTime();
        if (!Number.isFinite(ms)) return res.status(400).json({ sucesso: false, erro: 'send_at inválido (use ISO 8601)' });
        const now = Date.now();
        const max = now + 7 * 24 * 60 * 60 * 1000;
        if (ms <= now + 30 * 1000) return res.status(400).json({ sucesso: false, erro: 'send_at deve ser no futuro' });
        if (ms > max) return res.status(400).json({ sucesso: false, erro: 'send_at excede o limite do plano (até 7 dias)' });
        sendAtIso = new Date(ms).toISOString();
      }
      const sent = await sendZapsterTextWithOptionalRecover({
        recipient: phone,
        text,
        academyId,
        initialInstanceId: instanceId,
        sendAt: sendAtIso
      });
      const { doc } = await getOrCreateConversationDoc(phone, academyId, academyDoc);
      const messages = safeParseMessages(doc.messages);
      const nowIso = new Date().toISOString();
      messages.push({
        role: 'assistant',
        content: text,
        timestamp: nowIso,
        sender: 'human',
        ...(sendAtIso ? { status: 'scheduled', send_at: sendAtIso } : { status: 'sent' }),
        ...(sent?.message_id ? { message_id: String(sent.message_id) } : {})
      });
      await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, {
        messages: JSON.stringify(messages.slice(-AGENT_HISTORY_WINDOW)),
        updated_at: nowIso
      });
      try {
        const leadDoc = await findLeadByPhone(phone, academyId);
        if (leadDoc) await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, { lead_id: leadDoc.$id });
      } catch {}
      return res.status(200).json({
        sucesso: true,
        enviado: true,
        status: sendAtIso ? 'scheduled' : 'sent',
        send_at: sendAtIso || null,
        message_id: sent?.message_id ? String(sent.message_id) : null
      });
    } catch (e) {
      return res.status(500).json({ sucesso: false, erro: e?.message || 'Erro interno' });
    }
  }

  if (action === 'reconcile') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
    }
    const academyInst = String(academyDoc?.zapster_instance_id || academyDoc?.zapsterInstanceId || '').trim();
    const instanceId = academyInst || String(ZAPSTER_INSTANCE_ID || '').trim();
    if (!instanceId) return res.status(400).json({ sucesso: false, erro: 'Instância Zapster não configurada' });

    const now = Date.now();
    const toIso = new Date(now).toISOString();
    const fromIso = new Date(now - 23 * 60 * 60 * 1000).toISOString();
    try {
      const items = [];
      let after = '';
      let pages = 0;
      const limit = 100;
      for (;;) {
        pages += 1;
        const page = await listZapsterMessages({ from: fromIso, to: toIso, after, limit, instanceId });
        const dataArr = Array.isArray(page?.data) ? page.data : [];
        items.push(...dataArr);
        const hasMore = Boolean(page?.meta?.has_more);
        const nextCursor = typeof page?.meta?.next_cursor === 'string' ? page.meta.next_cursor : '';
        if (!hasMore || !nextCursor) break;
        after = nextCursor;
        if (pages >= 10) break;
      }

      const grouped = new Map();
      for (const it of items) {
        if (!it || typeof it !== 'object') continue;
        const text = String(pickText(it) || '').trim();
        if (!text) continue;
        const inbound = isInboundMessage(it);
        const phone = inbound ? pickSender(it) : pickRecipient(it);
        if (!phone) continue;
        const timestamp = pickTimestamp(it) || new Date().toISOString();
        const messageId = pickMessageIdFromZapster(it);
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
              ...(canceledAt ? { canceled_at: canceledAt } : {})
            }
          : {
              role: 'assistant',
              content: text,
              timestamp,
              ...(messageId ? { message_id: messageId } : {}),
              ...(status ? { status } : {}),
              ...(sendAt ? { send_at: sendAt } : {}),
              ...(canceledAt ? { canceled_at: canceledAt } : {})
            };
        const arr = grouped.get(phone) || [];
        arr.push(msg);
        grouped.set(phone, arr);
      }

      let conversationsUpdated = 0;
      let conversationsCreated = 0;
      let messagesMerged = 0;
      const errors = [];

      for (const [phone, msgs] of grouped.entries()) {
        try {
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
          const docPayload = { messages: JSON.stringify(merged), updated_at: updatedAt };
          if (lastUserMsgAt) docPayload.last_user_msg_at = lastUserMsgAt;
          try {
            await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, docPayload);
          } catch {
            await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, {
              messages: JSON.stringify(merged),
              updated_at: updatedAt
            });
          }
          conversationsUpdated += 1;
          messagesMerged += Math.max(0, merged.length - history.length);
        } catch (e) {
          errors.push({ phone, erro: String(e?.message || 'Erro') });
        }
      }

      return res.status(200).json({
        sucesso: true,
        from: fromIso,
        to: toIso,
        pages,
        zapster_items: items.length,
        phones: grouped.size,
        conversations_updated: conversationsUpdated,
        conversations_created: conversationsCreated,
        messages_merged: messagesMerged,
        errors
      });
    } catch (e) {
      if (e?.zapsterCode === 'messages_retention_exceeded') {
        return res.status(402).json({
          sucesso: false,
          code: 'messages_retention_exceeded',
          erro: 'Seu plano Zapster permite sincronizar apenas as últimas 24h de mensagens. As mensagens mais recentes ainda foram importadas.'
        });
      }
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
      await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, {
        messages: JSON.stringify(updated.slice(-AGENT_HISTORY_WINDOW)),
        updated_at: nowIso
      });

      return res.status(200).json({ sucesso: true, id: messageId, status: 'canceled', canceled_at: nowIso });
    } catch (e) {
      return res.status(500).json({ sucesso: false, erro: e?.message || 'Erro ao cancelar' });
    }
  }

  res.setHeader('Allow', 'POST, DELETE');
  return res.status(400).json({ sucesso: false, erro: 'action inválida' });
}


