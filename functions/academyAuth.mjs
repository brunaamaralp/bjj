/**
 * Auth helpers for Appwrite Cloud Functions (JWT + academy access).
 * Mirrors lib/server/academyAccess.js without HTTP response helpers.
 */
import sdk from 'node-appwrite';

const ENDPOINT =
  process.env.APPWRITE_FUNCTION_ENDPOINT ||
  process.env.APPWRITE_ENDPOINT ||
  process.env.VITE_APPWRITE_ENDPOINT ||
  'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_FUNCTION_PROJECT_ID ||
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_FUNCTION_API_KEY || process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.DB_ID || process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const ACADEMIES_COL =
  process.env.ACADEMIES_COL ||
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID ||
  process.env.APPWRITE_ACADEMIES_COLLECTION_ID ||
  '';

function extractJwt(req) {
  const fromAppwrite = String(req.headers?.['x-appwrite-user-jwt'] || '').trim();
  if (fromAppwrite) return fromAppwrite;
  const auth = String(req.headers?.authorization || req.headers?.Authorization || '').trim();
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return '';
}

/** @returns {Promise<import('node-appwrite').Models.User | null>} */
export async function getUserFromRequest(req) {
  const jwt = extractJwt(req);
  if (!jwt || !PROJECT_ID) return null;
  try {
    const userClient = new sdk.Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setJWT(jwt);
    const account = new sdk.Account(userClient);
    return await account.get();
  } catch {
    return null;
  }
}

/** @returns {Promise<boolean>} */
export async function isAcademyOwnerOrAdminUser(academyDoc, userId, teamsApi) {
  const ownerId = String(academyDoc?.ownerId || '').trim();
  const uid = String(userId || '').trim();
  if (ownerId && uid && ownerId === uid) return true;

  const teamId = String(academyDoc?.teamId || '').trim();
  if (!teamId || !uid || !teamsApi) return false;
  try {
    const memberships = await teamsApi.listMemberships(teamId, [
      sdk.Query.equal('userId', [uid]),
      sdk.Query.limit(1),
    ]);
    const roles = Array.isArray(memberships?.memberships?.[0]?.roles)
      ? memberships.memberships[0].roles
      : [];
    return roles.includes('admin') || roles.includes('owner');
  } catch {
    return false;
  }
}

/**
 * Validates user may access academy (owner or team member).
 * @returns {Promise<{ academyDoc: object, teamsApi: import('node-appwrite').Teams } | null>}
 */
export async function assertUserAcademyAccess(user, academyId, adminDatabases) {
  const aid = String(academyId || '').trim();
  const uid = String(user?.$id || '').trim();
  if (!aid || !uid || !DB_ID || !ACADEMIES_COL) return null;

  let academyDoc;
  try {
    academyDoc = await adminDatabases.getDocument(DB_ID, ACADEMIES_COL, aid);
  } catch {
    return null;
  }

  if (String(academyDoc?.status || '').trim().toLowerCase() === 'inactive') return null;

  const ownerId = String(academyDoc?.ownerId || '').trim();
  if (ownerId && ownerId === uid) {
    const adminClient = new sdk.Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
    return { academyDoc, teamsApi: new sdk.Teams(adminClient) };
  }

  const teamId = String(academyDoc?.teamId || '').trim();
  if (!teamId || !API_KEY) return null;

  const adminClient = new sdk.Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const teamsApi = new sdk.Teams(adminClient);
  try {
    const memberships = await teamsApi.listMemberships(teamId, [
      sdk.Query.equal('userId', [uid]),
      sdk.Query.limit(1),
    ]);
    const list = Array.isArray(memberships?.memberships) ? memberships.memberships : [];
    if (list.length === 0) return null;
    return { academyDoc, teamsApi };
  } catch {
    return null;
  }
}
