import { Account, Client } from 'node-appwrite';

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';

/**
 * Valida JWT no header Authorization. Lança se inválido ou ausente.
 * @param {import('http').IncomingMessage} req
 */
export async function ensureAuth(req) {
  const auth = String(req.headers?.authorization || '');
  if (!auth.toLowerCase().startsWith('bearer ')) throw new Error('unauthorized');
  const jwt = auth.slice(7).trim();
  if (!jwt) throw new Error('unauthorized');
  if (!PROJECT_ID) throw new Error('unauthorized');
  const userClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setJWT(jwt);
  const account = new Account(userClient);
  await account.get();
}
