import { Account, Client, Databases, ID, Permission, Query, Role, Teams } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
const DEFAULT_ACADEMY_ID = process.env.DEFAULT_ACADEMY_ID || process.env.VITE_DEFAULT_ACADEMY_ID || '';

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);
const teams = new Teams(client);

function ensureConfigOk(res) {
  if (!PROJECT_ID || !API_KEY || !DB_ID || !CONVERSATIONS_COL) {
    res.status(500).json({ sucesso: false, erro: 'Configuração Appwrite ausente' });
    return false;
  }
  if (!ACADEMIES_COL) {
    res.status(500).json({ sucesso: false, erro: 'ACADEMIES_COL não configurado' });
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

function getPhone(req) {
  const raw = String(req.query?.phone || '').trim();
  if (!raw) return '';
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw;
  }
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

async function getLeadNameById(leadId) {
  const id = String(leadId || '').trim();
  if (!id || !LEADS_COL) return '';
  try {
    const doc = await databases.getDocument(DB_ID, LEADS_COL, id);
    return String(doc?.name || '').trim();
  } catch {
    return '';
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

function extractJsonObject(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const firstBrace = t.indexOf('{');
  const lastBrace = t.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  const candidate = t.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function parseSummaryField(raw) {
  const s = String(raw || '').trim();
  if (!s) return { updated_at: null, text: '' };
  const obj = extractJsonObject(s);
  const updated_at = typeof obj?.updated_at === 'string' ? obj.updated_at : null;
  const text = typeof obj?.text === 'string' ? obj.text : s;
  return { updated_at, text: String(text || '').trim() };
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
      academy_id: academyId
    },
    permissionsForAcademyDoc(academyDoc)
  );
}

export default async function handler(req, res) {
  if (!ensureConfigOk(res)) return;
  const me = await ensureAuth(req, res);
  if (!me) return;
  const academyDoc = await ensureAcademyAccess(req, res, me);
  if (!academyDoc) return;
  const academyId = String(academyDoc.$id || '').trim();

  const phone = getPhone(req);
  if (!phone) return res.status(400).json({ sucesso: false, erro: 'Telefone ausente' });

  if (req.method === 'GET') {
    try {
      const list = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, [
        Query.equal('phone_number', [phone]),
        Query.equal('academy_id', [academyId]),
        Query.limit(1)
      ]);
      const existing = list.documents && list.documents[0] ? list.documents[0] : null;
      const messages = existing ? safeParseMessages(existing.messages) : [];
      const summary = existing ? parseSummaryField(existing.summary) : { updated_at: null, text: '' };
      const handoff = existing && typeof existing.human_handoff_until === 'string' ? existing.human_handoff_until : '';
      const handoffMs = handoff ? new Date(handoff).getTime() : 0;
      const needHuman = Number.isFinite(handoffMs) && handoffMs > Date.now();
      const leadId = existing && typeof existing.lead_id === 'string' ? existing.lead_id : null;
      const leadName = leadId ? await getLeadNameById(leadId) : '';
      const unreadCount = Number.isFinite(Number(existing?.unread_count)) ? Number(existing.unread_count) : 0;
      const lastReadAt = typeof existing?.last_read_at === 'string' ? existing.last_read_at : null;
      const lastUserMsgAt = typeof existing?.last_user_msg_at === 'string' ? existing.last_user_msg_at : null;
      return res.status(200).json({
        messages,
        summary,
        lead_id: leadId,
        lead_name: leadName || '',
        human_handoff_until: handoff || null,
        need_human: needHuman,
        unread_count: unreadCount || 0,
        last_read_at: lastReadAt || null,
        last_user_msg_at: lastUserMsgAt || null
      });
    } catch (e) {
      return res.status(500).json({ messages: [], summary: { updated_at: null, text: '' } });
    }
  }

  if (req.method === 'POST') {
    if (!ensureJson(req, res)) return;
    const action = String(req.body?.action || '').trim();
    if (action === 'link_lead') {
      const leadId = String(req.body?.lead_id || '').trim();
      if (!leadId) return res.status(400).json({ sucesso: false, erro: 'lead_id ausente' });
      let leadName = '';
      try {
        const leadDoc = await databases.getDocument(DB_ID, LEADS_COL, leadId);
        leadName = String(leadDoc?.name || '').trim();
      } catch {
        return res.status(400).json({ sucesso: false, erro: 'Lead não encontrado' });
      }
      try {
        const doc = await getOrCreateConversationDoc(phone, academyId, academyDoc);
        await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, { lead_id: leadId });
        return res.status(200).json({ sucesso: true, lead_id: leadId, lead_name: leadName || '' });
      } catch (e) {
        return res.status(500).json({ sucesso: false, erro: e.message || 'Erro interno' });
      }
    }
    const role = String(req.body?.role || '').trim();
    const content = typeof req.body?.content === 'string' ? req.body.content : String(req.body?.content || '');
    if (!role || (role !== 'user' && role !== 'assistant')) {
      return res.status(400).json({ sucesso: false, erro: 'Role inválida' });
    }
    if (!content.trim()) {
      return res.status(400).json({ sucesso: false, erro: 'Content ausente' });
    }

    try {
      const doc = await getOrCreateConversationDoc(phone, academyId, academyDoc);
      const messages = safeParseMessages(doc.messages);
      const nowIso = new Date().toISOString();
      messages.push({ role, content: content.trim(), timestamp: nowIso });
      const last10 = messages.slice(-10);
      const updatePayload = {
        messages: JSON.stringify(last10),
        updated_at: nowIso
      };
      if (role === 'user') {
        const prev = Number.isFinite(Number(doc?.unread_count)) ? Number(doc.unread_count) : 0;
        updatePayload.unread_count = prev + 1;
        updatePayload.last_user_msg_at = nowIso;
      }
      await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, updatePayload);
      return res.status(200).json({ sucesso: true });
    } catch (e) {
      return res.status(500).json({ sucesso: false, erro: e.message || 'Erro interno' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
}
