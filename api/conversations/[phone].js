import { Account, Client, Databases, ID, Permission, Query, Role } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';
const DEFAULT_ACADEMY_ID = process.env.DEFAULT_ACADEMY_ID || process.env.VITE_DEFAULT_ACADEMY_ID || '';

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

function ensureConfigOk(res) {
  if (!PROJECT_ID || !API_KEY || !DB_ID || !CONVERSATIONS_COL) {
    res.status(500).json({ sucesso: false, erro: 'Configuração Appwrite ausente' });
    return false;
  }
  if (!DEFAULT_ACADEMY_ID) {
    res.status(500).json({ sucesso: false, erro: 'DEFAULT_ACADEMY_ID não configurado' });
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
        timestamp: typeof m.timestamp === 'string' ? m.timestamp : new Date().toISOString()
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

async function getOrCreateConversationDoc(phone) {
  const list = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, [
    Query.equal('phone_number', [phone]),
    Query.equal('academy_id', [DEFAULT_ACADEMY_ID]),
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
      academy_id: DEFAULT_ACADEMY_ID
    },
    [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())]
  );
}

export default async function handler(req, res) {
  if (!ensureConfigOk(res)) return;
  const me = await ensureAuth(req, res);
  if (!me) return;

  const phone = getPhone(req);
  if (!phone) return res.status(400).json({ sucesso: false, erro: 'Telefone ausente' });

  if (req.method === 'GET') {
    try {
      const list = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, [
        Query.equal('phone_number', [phone]),
        Query.equal('academy_id', [DEFAULT_ACADEMY_ID]),
        Query.limit(1)
      ]);
      const existing = list.documents && list.documents[0] ? list.documents[0] : null;
      const messages = existing ? safeParseMessages(existing.messages) : [];
      const summary = existing ? parseSummaryField(existing.summary) : { updated_at: null, text: '' };
      const handoff = existing && typeof existing.human_handoff_until === 'string' ? existing.human_handoff_until : '';
      const handoffMs = handoff ? new Date(handoff).getTime() : 0;
      const needHuman = Number.isFinite(handoffMs) && handoffMs > Date.now();
      return res.status(200).json({
        messages,
        summary,
        lead_id: existing && typeof existing.lead_id === 'string' ? existing.lead_id : null,
        human_handoff_until: handoff || null,
        need_human: needHuman
      });
    } catch (e) {
      return res.status(500).json({ messages: [], summary: { updated_at: null, text: '' } });
    }
  }

  if (req.method === 'POST') {
    if (!ensureJson(req, res)) return;
    const role = String(req.body?.role || '').trim();
    const content = typeof req.body?.content === 'string' ? req.body.content : String(req.body?.content || '');
    if (!role || (role !== 'user' && role !== 'assistant')) {
      return res.status(400).json({ sucesso: false, erro: 'Role inválida' });
    }
    if (!content.trim()) {
      return res.status(400).json({ sucesso: false, erro: 'Content ausente' });
    }

    try {
      const doc = await getOrCreateConversationDoc(phone);
      const messages = safeParseMessages(doc.messages);
      const nowIso = new Date().toISOString();
      messages.push({ role, content: content.trim(), timestamp: nowIso });
      const last10 = messages.slice(-10);
      await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, {
        messages: JSON.stringify(last10),
        updated_at: nowIso
      });
      return res.status(200).json({ sucesso: true });
    } catch (e) {
      return res.status(500).json({ sucesso: false, erro: e.message || 'Erro interno' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
}
