import { Account, Client, Databases, ID, Permission, Query, Role, Teams } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const SETTINGS_COL = process.env.APPWRITE_SETTINGS_COLLECTION_ID || process.env.VITE_APPWRITE_SETTINGS_COLLECTION_ID || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';
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

async function getSettingsDoc(academyId) {
  if (SETTINGS_COL) {
    const list = await databases.listDocuments(DB_ID, SETTINGS_COL, [Query.equal('academy_id', [academyId]), Query.limit(1)]);
    const doc = list.documents && list.documents[0] ? list.documents[0] : null;
    if (doc) return { doc, coll: SETTINGS_COL, kind: 'settings' };
  }
  const list2 = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, [
    Query.equal('academy_id', [academyId]),
    Query.equal('phone_number', ['__settings__']),
    Query.limit(1)
  ]);
  const doc2 = list2.documents && list2.documents[0] ? list2.documents[0] : null;
  if (doc2) return { doc: doc2, coll: CONVERSATIONS_COL, kind: 'conversations' };
  return { doc: null, coll: SETTINGS_COL || CONVERSATIONS_COL, kind: SETTINGS_COL ? 'settings' : 'conversations' };
}

export default async function handler(req, res) {
  if (!ensureConfigOk(res)) return;
  const me = await ensureAuth(req, res);
  if (!me) return;
  const academyDoc = await ensureAcademyAccess(req, res, me);
  if (!academyDoc) return;
  const academyId = String(academyDoc.$id || '').trim();

  try {
    if (req.method === 'GET') {
      const { doc } = await getSettingsDoc(academyId);
      const out = {
        prompt_intro: String(doc?.prompt_intro || '').trim(),
        prompt_body: String(doc?.prompt_body || '').trim(),
        prompt_suffix: String(doc?.prompt_suffix || '').trim()
      };
      return res.status(200).json({ sucesso: true, ...out });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const intro = String(body.prompt_intro || '').trim();
      const bodyTxt = String(body.prompt_body || '').trim();
      const suffix = String(body.prompt_suffix || '').trim();

      const perms = permissionsForAcademyDoc(academyDoc);
      const { doc, coll, kind } = await getSettingsDoc(academyId);
      const data = { prompt_intro: intro, prompt_body: bodyTxt, prompt_suffix: suffix };
      if (doc) {
        await databases.updateDocument(DB_ID, coll, doc.$id, data);
        return res.status(200).json({ sucesso: true });
      }
      if (kind === 'settings') {
        await databases.createDocument(DB_ID, coll, ID.unique(), { academy_id: academyId, ...data }, perms);
        return res.status(200).json({ sucesso: true });
      }
      await databases.createDocument(
        DB_ID,
        coll,
        ID.unique(),
        { academy_id: academyId, phone_number: '__settings__', ...data },
        perms
      );
      return res.status(200).json({ sucesso: true });
    }

    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
  } catch (e) {
    return res.status(500).json({ sucesso: false, erro: e.message || 'Erro interno' });
  }
}

