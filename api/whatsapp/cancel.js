import { Account, Client, Databases, Query, Teams } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
const DEFAULT_ACADEMY_ID = process.env.DEFAULT_ACADEMY_ID || process.env.VITE_DEFAULT_ACADEMY_ID || '';

const ZAPSTER_API_BASE_URL = process.env.ZAPSTER_API_BASE_URL || 'https://api.zapsterapi.com';
const ZAPSTER_TOKEN = process.env.ZAPSTER_TOKEN || process.env.ZAPSTER_API_TOKEN || '';

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
    return parsed.filter((m) => m && typeof m === 'object');
  } catch {
    return [];
  }
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
  if (!(req.method === 'POST' || req.method === 'DELETE')) {
    res.setHeader('Allow', 'POST, DELETE');
    return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
  }
  if (!ensureConfigOk(res)) return;
  if (!ensureJson(req, res)) return;
  const me = await ensureAuth(req, res);
  if (!me) return;
  const academyDoc = await ensureAcademyAccess(req, res, me);
  if (!academyDoc) return;
  const academyId = String(academyDoc.$id || '').trim();

  const phone = normalizePhone(req.body?.phone || '');
  const messageId = String(req.body?.message_id || req.body?.id || '').trim();
  if (!phone || !messageId) {
    return res.status(400).json({ sucesso: false, erro: 'phone e message_id são obrigatórios' });
  }

  try {
    const list = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, [
      Query.equal('phone_number', [phone]),
      Query.equal('academy_id', [academyId]),
      Query.limit(1)
    ]);
    const doc = list.documents && list.documents[0] ? list.documents[0] : null;
    if (!doc || !doc.$id) return res.status(404).json({ sucesso: false, erro: 'Conversa não encontrada' });

    const history = safeParseMessages(doc.messages);
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
      messages: JSON.stringify(updated.slice(-50)),
      updated_at: nowIso
    });

    return res.status(200).json({
      sucesso: true,
      id: messageId,
      status: 'canceled',
      canceled_at: nowIso
    });
  } catch (e) {
    return res.status(500).json({ sucesso: false, erro: e?.message || 'Erro ao cancelar' });
  }
}
