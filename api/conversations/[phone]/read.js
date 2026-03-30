import { Account, Client, Databases, ID, Permission, Query, Role, Teams } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';
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
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
  }
  if (!ensureConfigOk(res)) return;
  const me = await ensureAuth(req, res);
  if (!me) return;
  const academyDoc = await ensureAcademyAccess(req, res, me);
  if (!academyDoc) return;
  const academyId = String(academyDoc.$id || '').trim();

  const phone = getPhone(req);
  if (!phone) return res.status(400).json({ sucesso: false, erro: 'Telefone ausente' });

  try {
    const nowIso = new Date().toISOString();
    const doc = await getOrCreateConversationDoc(phone, academyId, academyDoc);
    await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, {
      unread_count: 0,
      last_read_at: nowIso
    });
    return res.status(200).json({ sucesso: true, unread_count: 0, last_read_at: nowIso });
  } catch (e) {
    return res.status(500).json({ sucesso: false, erro: e.message || 'Erro interno' });
  }
}
