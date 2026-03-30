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
        timestamp: typeof m.timestamp === 'string' ? m.timestamp : new Date().toISOString()
      }));
  } catch {
    return [];
  }
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

async function sendZapsterText({ recipient, text, instanceId }) {
  const urlBase = String(ZAPSTER_API_BASE_URL || '').replace(/\/+$/, '');
  const url = `${urlBase}/v1/wa/messages`;
  const inst = String(instanceId || '').trim();
  if (!inst) throw new Error('ZAPSTER_INSTANCE_ID ausente');
  const body = { recipient, text, instance_id: inst };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${ZAPSTER_TOKEN}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const raw = await resp.text();
  if (!resp.ok) {
    console.error('Zapster send failed', { status: resp.status, body: raw.slice(0, 500) });
    throw new Error(raw || `HTTP ${resp.status}`);
  }
  return raw;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
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
  const text = String(req.body?.text || '').trim();
  if (!phone || !text) {
    return res.status(400).json({ sucesso: false, erro: 'Campos obrigatórios ausentes' });
  }

  try {
    const instanceId = await getZapsterInstanceIdForAcademy(academyDoc, academyId);
    await sendZapsterText({ recipient: phone, text, instanceId });

    const doc = await getOrCreateConversationDoc(phone, academyId, academyDoc);
    const messages = safeParseMessages(doc.messages);
    const nowIso = new Date().toISOString();
    messages.push({ role: 'assistant', content: text, timestamp: nowIso });
    const last10 = messages.slice(-10);
    await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, {
      messages: JSON.stringify(last10),
      updated_at: nowIso
    });
    try {
      const leadDoc = await findLeadByPhone(phone, academyId);
      if (leadDoc) await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, { lead_id: leadDoc.$id });
    } catch {}

    return res.status(200).json({ sucesso: true, enviado: true });
  } catch (e) {
    return res.status(500).json({ sucesso: false, erro: e.message || 'Erro interno' });
  }
}
