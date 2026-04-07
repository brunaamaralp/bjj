import { Client, Account } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

/**
 * @param {string} jwt
 */
export async function getAppwriteUserFromJwt(jwt) {
  const userClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setJWT(jwt);
  const account = new Account(userClient);
  return await account.get();
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} academyId
 * @param {string} ownerId
 */
export async function assertAcademyOwnedByOwner(databases, academyId, ownerId) {
  if (!DB_ID || !ACADEMIES_COL) {
    throw new Error('appwrite_config');
  }
  const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
  if (String(doc.ownerId || '') !== String(ownerId)) {
    const err = new Error('forbidden');
    err.code = 'FORBIDDEN';
    throw err;
  }
  return doc;
}
