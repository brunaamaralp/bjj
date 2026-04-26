import { Client, Databases, Query, Account, Teams } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
/** Cliente admin (API key) para handlers server-side que precisam ler/atualizar documentos. */
export const databases = new Databases(adminClient);
const teams = new Teams(adminClient);

export { DB_ID };

export function resolveAcademyHeader(req) {
  return String(req.headers['x-academy-id'] || '').trim();
}

/** @returns {Promise<import('node-appwrite').Models.User<import('node-appwrite').Models.Preferences> | null>} */
export async function ensureAuth(req, res) {
  console.log('[ensureAuth] Authorization header:', req.headers['authorization']?.slice(0, 30));
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
    return await account.get();
  } catch {
    res.status(401).json({ sucesso: false, erro: 'JWT inválido' });
    return null;
  }
}

/**
 * Dono da academia ou membro do time (recepcionista) com acesso à academia do header x-academy-id.
 * @returns {Promise<{ academyId: string, doc: import('node-appwrite').Models.Document } | null>}
 */
export async function ensureAcademyAccess(req, res, me) {
  const academyId = resolveAcademyHeader(req);
  if (!academyId) {
    res.status(400).json({ sucesso: false, erro: 'x-academy-id ausente' });
    return null;
  }
  if (!DB_ID || !ACADEMIES_COL) {
    res.status(500).json({ sucesso: false, erro: 'Configuração Appwrite ausente' });
    return null;
  }
  try {
    const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
    if (!doc || String(doc.status || '').trim().toLowerCase() === 'inactive') {
      res.status(403).json({ sucesso: false, erro: 'Academia inválida ou inativa' });
      return null;
    }
    const ownerId = String(doc?.ownerId || '').trim();
    const userId = String(me?.$id || '').trim();
    if (ownerId && userId && ownerId === userId) return { academyId, doc };

    const teamId = String(doc?.teamId || '').trim();
    if (teamId && userId) {
      try {
        const memberships = await teams.listMemberships(teamId, [Query.equal('userId', [userId]), Query.limit(1)]);
        const list = Array.isArray(memberships?.memberships) ? memberships.memberships : [];
        if (list.length > 0) return { academyId, doc };
      } catch {
        void 0;
      }
    }

    res.status(403).json({ sucesso: false, erro: 'Acesso negado à academia' });
    return null;
  } catch (e) {
    console.error('[ensureAcademyAccess] Erro inesperado:', e);
    const msg = e?.message || '';
    if (msg.includes('document_not_found') || msg.includes('not found')) {
      res.status(403).json({ sucesso: false, erro: `Academia ${academyId} não localizada` });
    } else {
      res.status(500).json({ sucesso: false, erro: `Erro ao validar academia: ${msg || 'Erro desconhecido'}` });
    }
    return null;
  }
}
