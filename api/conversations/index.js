import { Client, Databases, Query, Account, Teams } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
const DEFAULT_ACADEMY_ID = process.env.DEFAULT_ACADEMY_ID || process.env.VITE_DEFAULT_ACADEMY_ID || '';

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

function clampInt(v, { min, max, fallback }) {
  const n = Number.parseInt(String(v || ''), 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function normalizePhone(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  return raw.replace(/[^\d]/g, '');
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
        status: typeof m.status === 'string' ? m.status : undefined,
        send_at: typeof m.send_at === 'string' ? m.send_at : undefined,
        canceled_at: typeof m.canceled_at === 'string' ? m.canceled_at : undefined
      }));
  } catch {
    return [];
  }
}

function lastMessageMeta(raw) {
  if (!raw) return { role: '', timestamp: '', sender: '' };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return { role: '', timestamp: '', sender: '' };
    const last = parsed[parsed.length - 1];
    if (!last || typeof last !== 'object') return { role: '', timestamp: '', sender: '' };
    const role = last.role === 'assistant' ? 'assistant' : 'user';
    const timestamp = typeof last.timestamp === 'string' ? last.timestamp : '';
    if (role === 'user') return { role, timestamp, sender: 'user' };
    const senderRaw = String(last.sender || '').trim().toLowerCase();
    if (senderRaw === 'human' || senderRaw === 'humano') return { role, timestamp, sender: 'human' };
    if (senderRaw === 'ai' || senderRaw === 'agent' || senderRaw === 'agente') return { role, timestamp, sender: 'ai' };
    const hasAiHints = Boolean(last.in_reply_to) || (last.classificacao && typeof last.classificacao === 'object');
    return { role, timestamp, sender: hasAiHints ? 'ai' : 'human' };
  } catch {
    return { role: '', timestamp: '', sender: '' };
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

function previewText(messages) {
  const last = Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1] : null;
  const t = String(last?.content || '').trim();
  if (!t) return '';
  return t.length > 140 ? `${t.slice(0, 140)}…` : t;
}

async function getLeadNameByIdMap(leadIds) {
  const ids = Array.isArray(leadIds) ? leadIds.map((v) => String(v || '').trim()).filter(Boolean) : [];
  const unique = Array.from(new Set(ids));
  if (!LEADS_COL || unique.length === 0) return new Map();
  try {
    const list = await databases.listDocuments(DB_ID, LEADS_COL, [Query.equal('$id', unique), Query.limit(200)]);
    const docs = Array.isArray(list?.documents) ? list.documents : [];
    const map = new Map();
    for (const d of docs) {
      const id = String(d?.$id || '').trim();
      if (!id) continue;
      map.set(id, String(d?.name || '').trim());
    }
    return map;
  } catch {
    return new Map();
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
    if (ownerId && userId && ownerId === userId) return academyId;

    const teamId = String(doc?.teamId || '').trim();
    if (teamId && userId) {
      try {
        const memberships = await teams.listMemberships(teamId, [Query.equal('userId', [userId]), Query.limit(1)]);
        const list = Array.isArray(memberships?.memberships) ? memberships.memberships : [];
        if (list.length > 0) return academyId;
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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
  }
  if (!ensureConfigOk(res)) return;
  const me = await ensureAuth(req, res);
  if (!me) return;
  const academyId = await ensureAcademyAccess(req, res, me);
  if (!academyId) return;

  try {
    const limit = clampInt(req.query?.limit, { min: 1, max: 200, fallback: 50 });
    const cursor = String(req.query?.cursor || '').trim();
    const search = normalizePhone(req.query?.search || '');

    const queries = [
      Query.equal('academy_id', [academyId]),
      Query.orderDesc('updated_at'),
      Query.limit(limit)
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    if (search) queries.unshift(Query.equal('phone_number', [search]));

    const list = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, queries);
    const docs = Array.isArray(list?.documents) ? list.documents : [];

    const leadNameMap = await getLeadNameByIdMap(
      docs.map((d) => (d && typeof d.lead_id === 'string' ? d.lead_id : '')).filter(Boolean)
    );

    const items = docs.map((doc) => {
      const messages = safeParseMessages(doc.messages);
      const lastMeta = lastMessageMeta(doc.messages);
      const summary = parseSummaryField(doc.summary);
      const handoff = typeof doc.human_handoff_until === 'string' ? doc.human_handoff_until : '';
      const handoffMs = handoff ? new Date(handoff).getTime() : 0;
      const needHuman = Number.isFinite(handoffMs) && handoffMs > Date.now();
      const leadId = typeof doc.lead_id === 'string' ? doc.lead_id : null;
      const unreadCount = Number.isFinite(Number(doc?.unread_count)) ? Number(doc.unread_count) : 0;
      const lastReadAt = typeof doc?.last_read_at === 'string' ? doc.last_read_at : null;
      const lastUserMsgAt = typeof doc?.last_user_msg_at === 'string' ? doc.last_user_msg_at : null;
      const ticketStatus = typeof doc?.ticket_status === 'string' ? String(doc.ticket_status).trim() : 'open';
      const transferTo = typeof doc?.transfer_to === 'string' ? String(doc.transfer_to).trim() : '';
      const computedHasUnread =
        lastMeta.role === 'user' &&
        typeof lastMeta.timestamp === 'string' &&
        (!lastReadAt || new Date(lastMeta.timestamp).getTime() > new Date(lastReadAt).getTime());
      return {
        id: doc.$id,
        phone_number: String(doc.phone_number || '').trim(),
        updated_at: String(doc.updated_at || doc.$updatedAt || doc.$createdAt || '').trim(),
        lead_id: leadId,
        lead_name: leadId ? leadNameMap.get(leadId) || '' : '',
        human_handoff_until: handoff || null,
        need_human: needHuman,
        ticket_status: ticketStatus || 'open',
        transfer_to: transferTo || null,
        summary,
        last_preview: previewText(messages),
        last_message_role: lastMeta.role || null,
        last_message_sender: lastMeta.sender || null,
        last_message_timestamp: lastMeta.timestamp || null,
        unread_count: unreadCount || (computedHasUnread ? 1 : 0),
        last_read_at: lastReadAt || null,
        last_user_msg_at: lastUserMsgAt || null
      };
    });

    const nextCursor = docs.length === limit ? String(docs[docs.length - 1].$id || '') : '';
    return res.status(200).json({ sucesso: true, items, next_cursor: nextCursor || null, user: { id: me.$id } });
  } catch (e) {
    return res.status(500).json({ sucesso: false, erro: e.message || 'Erro interno' });
  }
}

