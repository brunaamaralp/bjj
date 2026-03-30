import { Client, Databases, ID, Permission, Query, Role } from 'node-appwrite';

const ZAPSTER_API_BASE_URL = process.env.ZAPSTER_API_BASE_URL || 'https://api.zapsterapi.com';
const ZAPSTER_TOKEN = process.env.ZAPSTER_TOKEN || process.env.ZAPSTER_API_TOKEN || '';
const ZAPSTER_INSTANCE_ID = process.env.ZAPSTER_INSTANCE_ID || '';
const ZAPSTER_WEBHOOK_TOKEN = process.env.ZAPSTER_WEBHOOK_TOKEN || '';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
const DEFAULT_ACADEMY_ID = process.env.DEFAULT_ACADEMY_ID || process.env.VITE_DEFAULT_ACADEMY_ID || '';

const appwriteClient = PROJECT_ID && API_KEY ? new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY) : null;
const databases = appwriteClient ? new Databases(appwriteClient) : null;

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
  if (!ZAPSTER_WEBHOOK_TOKEN) return true;
  const q = String(req.query?.token || '').trim();
  const h = String(req.headers['x-webhook-token'] || '').trim();
  const a = String(req.headers.authorization || '').trim().replace(/^Bearer\s+/i, '');
  const provided = q || h || a;
  if (provided !== ZAPSTER_WEBHOOK_TOKEN) {
    res.status(401).json({ sucesso: false, erro: 'Não autorizado' });
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
  if (!inst || !databases || !DB_ID || !ACADEMIES_COL) return fallback;
  try {
    const list = await databases.listDocuments(DB_ID, ACADEMIES_COL, [
      Query.equal('zapster_instance_id', [inst]),
      Query.limit(1)
    ]);
    const doc = Array.isArray(list?.documents) && list.documents[0] ? list.documents[0] : null;
    if (doc && doc.$id) return String(doc.$id);
  } catch {
    void 0;
  }
  try {
    const list2 = await databases.listDocuments(DB_ID, ACADEMIES_COL, [
      Query.equal('zapsterInstanceId', [inst]),
      Query.limit(1)
    ]);
    const doc2 = Array.isArray(list2?.documents) && list2.documents[0] ? list2.documents[0] : null;
    if (doc2 && doc2.$id) return String(doc2.$id);
  } catch {
    void 0;
  }
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

function getBaseUrl(req) {
  const xfProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = xfProto || 'https';
  const host = String(req.headers.host || '').trim();
  return `${proto}://${host}`;
}

function safeParseMessages(raw) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mergeConversationMessages(existing, additions) {
  const out = Array.isArray(existing) ? existing.slice() : [];
  const hasUserById = new Set(out.filter((m) => m?.role === 'user' && m?.message_id).map((m) => String(m.message_id)));
  const hasAssistantByReply = new Set(
    out.filter((m) => m?.role === 'assistant' && m?.in_reply_to).map((m) => String(m.in_reply_to))
  );

  for (const a of additions || []) {
    if (!a || typeof a !== 'object') continue;
    if (a.role === 'user' && a.message_id) {
      const id = String(a.message_id);
      if (hasUserById.has(id)) continue;
      hasUserById.add(id);
    }
    if (a.role === 'assistant' && a.in_reply_to) {
      const rid = String(a.in_reply_to);
      if (hasAssistantByReply.has(rid)) continue;
      hasAssistantByReply.add(rid);
    }
    out.push(a);
  }
  return out.slice(-10);
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
  const a = String(academyId || '').trim();
  if (!databases || !DB_ID || !CONVERSATIONS_COL || !a) return null;
  const list = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, [
    Query.equal('phone_number', [phone]),
    Query.equal('academy_id', [a]),
    Query.limit(1)
  ]);
  const existing = list.documents && list.documents[0] ? list.documents[0] : null;
  if (existing) return existing;

  const nowIso = new Date().toISOString();
  return databases.createDocument(
    DB_ID,
    CONVERSATIONS_COL,
    ID.unique(),
    {
      phone_number: phone,
      messages: JSON.stringify([]),
      updated_at: nowIso,
      academy_id: a
    },
    permissionsForAcademyDoc(academyDoc)
  );
}

async function updateConversationWithMerge(docId, additions) {
  if (!databases || !DB_ID || !CONVERSATIONS_COL) return { ok: false, erro: 'Config Appwrite inválida' };
  let lastErr = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const current = await databases.getDocument(DB_ID, CONVERSATIONS_COL, docId);
      const history = safeParseMessages(current.messages);
      const merged = mergeConversationMessages(history, additions);
      const nowIso = new Date().toISOString();
      const userAdds = Array.isArray(additions) ? additions.filter((a) => a && a.role === 'user').length : 0;
      const prevUnread = Number.isFinite(Number(current?.unread_count)) ? Number(current.unread_count) : 0;
      const payload = {
        messages: JSON.stringify(merged),
        updated_at: nowIso
      };
      if (userAdds > 0) {
        payload.unread_count = prevUnread + userAdds;
        payload.last_user_msg_at = nowIso;
      }
      try {
        await databases.updateDocument(DB_ID, CONVERSATIONS_COL, docId, payload);
      } catch {
        const minimal = { messages: payload.messages, updated_at: payload.updated_at };
        await databases.updateDocument(DB_ID, CONVERSATIONS_COL, docId, minimal);
      }
      return { ok: true };
    } catch (e) {
      lastErr = e?.message || 'Erro ao atualizar conversa';
    }
  }
  return { ok: false, erro: lastErr || 'Erro ao atualizar conversa' };
}

async function saveInboundMessage({ academyId, academyDoc, phone, text, messageId }) {
  const doc = await getOrCreateConversationDoc(phone, academyId, academyDoc);
  if (!doc) return { ok: false, erro: 'Conversa indisponível' };

  const history = safeParseMessages(doc.messages);
  const mid = String(messageId || '').trim();
  if (mid) {
    const exists = history.some((m) => m?.role === 'user' && String(m?.message_id || '').trim() === mid);
    if (exists) return { ok: true, duplicate: true, docId: doc.$id };
  }

  const nowIso = new Date().toISOString();
  const userMsg = {
    role: 'user',
    content: String(text || '').trim(),
    timestamp: nowIso,
    ...(mid ? { message_id: mid } : {})
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
  if (!until) return false;
  const ms = new Date(until).getTime();
  return Number.isFinite(ms) && ms > Date.now();
}

async function sendZapsterText({ recipient, text, instanceId }) {
  const inst = String(instanceId || '').trim();
  if (!ZAPSTER_TOKEN || !inst) {
    return { ok: false, erro: 'ZAPSTER_TOKEN/instance_id ausentes' };
  }
  const urlBase = String(ZAPSTER_API_BASE_URL || '').replace(/\/+$/, '');
  const url = `${urlBase}/v1/wa/messages`;
  const body = { recipient, text, instance_id: inst };

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${ZAPSTER_TOKEN}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const raw = await resp.text();
    if (resp.ok) return { ok: true, raw };
    console.error('Zapster send failed', { status: resp.status, body: raw.slice(0, 500) });
    return { ok: false, erro: raw || `HTTP ${resp.status}` };
  } catch (e) {
    console.error('Zapster send error', { erro: e?.message || 'Erro ao enviar' });
    return { ok: false, erro: e?.message || 'Erro ao enviar' };
  }
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

    const { type, text } = extractIncomingText(msg);
    if (!text) return res.status(200).json({ sucesso: true, ignorado: true });
    if (type && type !== 'text') return res.status(200).json({ sucesso: true, ignorado: true });

    const name = String(msg?.sender?.name || body?.sender?.name || '').trim();
    const messageId = extractMessageId(body, msg);
    const instanceId = extractInstanceId(body, msg);
    const academyId = await resolveAcademyIdFromInstanceId(instanceId);
    if (!academyId) return res.status(200).json({ sucesso: true, ignorado: true });
    const academyDoc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId).catch(() => null);
    if (!academyDoc || !academyDoc.$id) return res.status(200).json({ sucesso: true, ignorado: true });

    const baseUrl = getBaseUrl(req);
    const payload = { phone, name, academy_id: academyId, message: text, ...(messageId ? { message_id: messageId } : {}) };

    let inbound = null;
    try {
      inbound = await saveInboundMessage({ academyId, academyDoc, phone, text, messageId });
      if (inbound?.ok && inbound?.duplicate) {
        return res.status(200).json({ sucesso: true, ignorado: true, duplicado: true });
      }
    } catch {}

    let modoHumano = false;
    try {
      modoHumano = await isHumanHandoffActive(phone, academyId);
    } catch {
      modoHumano = false;
    }

    if (modoHumano) {
      return res.status(200).json({ sucesso: true, ignorado: true, modo_humano: true });
    }

    const processAsync = async () => {
      try {
        let agentData = null;
        for (let attempt = 0; attempt < 4; attempt++) {
          const agentResp = await fetch(`${baseUrl}/api/agent/respond`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-academy-id': String(academyId || '') },
            body: JSON.stringify(payload)
          });
          const agentRaw = await agentResp.text();
          if (!agentResp.ok) return;
          agentData = JSON.parse(agentRaw);
          if (!agentData?.em_processamento) break;
          await new Promise((r) => setTimeout(r, 750));
        }
        if (agentData?.em_processamento) return;
        const resposta = String(agentData?.resposta || '').trim();
        if (!resposta) return;
        const academyInst = String(academyDoc?.zapster_instance_id || academyDoc?.zapsterInstanceId || '').trim();
        const outInstanceId = String(instanceId || '').trim() || academyInst || (await getZapsterInstanceIdForAcademy(academyId));
        await sendZapsterText({ recipient: phone, text: resposta, instanceId: outInstanceId });
      } catch {}
    };

    setTimeout(() => {
      void processAsync();
    }, 0);

    return res.status(200).json({ sucesso: true, enfileirado: true });
  } catch (e) {
    return res.status(500).json({ sucesso: false, erro: e.message || 'Erro interno' });
  }
}
