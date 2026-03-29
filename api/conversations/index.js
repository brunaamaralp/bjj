import { Client, Databases, Query, Account } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';
const DEFAULT_ACADEMY_ID = process.env.DEFAULT_ACADEMY_ID || process.env.VITE_DEFAULT_ACADEMY_ID || '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

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

function previewText(messages) {
  const last = Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1] : null;
  const t = String(last?.content || '').trim();
  if (!t) return '';
  return t.length > 140 ? `${t.slice(0, 140)}…` : t;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
  }
  if (!ensureConfigOk(res)) return;
  const me = await ensureAuth(req, res);
  if (!me) return;

  try {
    const limit = clampInt(req.query?.limit, { min: 1, max: 200, fallback: 50 });
    const cursor = String(req.query?.cursor || '').trim();
    const search = normalizePhone(req.query?.search || '');

    const queries = [
      Query.equal('academy_id', [DEFAULT_ACADEMY_ID]),
      Query.orderDesc('updated_at'),
      Query.limit(limit)
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    if (search) queries.unshift(Query.equal('phone_number', [search]));

    const list = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, queries);
    const docs = Array.isArray(list?.documents) ? list.documents : [];

    const items = docs.map((doc) => {
      const messages = safeParseMessages(doc.messages);
      const summary = parseSummaryField(doc.summary);
      const handoff = typeof doc.human_handoff_until === 'string' ? doc.human_handoff_until : '';
      const handoffMs = handoff ? new Date(handoff).getTime() : 0;
      const needHuman = Number.isFinite(handoffMs) && handoffMs > Date.now();
      return {
        id: doc.$id,
        phone_number: String(doc.phone_number || '').trim(),
        updated_at: String(doc.updated_at || doc.$updatedAt || doc.$createdAt || '').trim(),
        lead_id: typeof doc.lead_id === 'string' ? doc.lead_id : null,
        human_handoff_until: handoff || null,
        need_human: needHuman,
        summary,
        last_preview: previewText(messages)
      };
    });

    const nextCursor = docs.length === limit ? String(docs[docs.length - 1].$id || '') : '';
    return res.status(200).json({ sucesso: true, items, next_cursor: nextCursor || null, user: { id: me.$id } });
  } catch (e) {
    return res.status(500).json({ sucesso: false, erro: e.message || 'Erro interno' });
  }
}

