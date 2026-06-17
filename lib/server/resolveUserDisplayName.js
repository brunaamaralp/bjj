import { Client, Users } from 'node-appwrite';

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';

let usersApi = null;

function getUsersApi() {
  if (!usersApi && PROJECT_ID && API_KEY) {
    usersApi = new Users(new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY));
  }
  return usersApi;
}

/** Rótulo legível para userId Appwrite (cache opcional por request). */
export async function resolveUserDisplayName(userId, cache = null) {
  const uid = String(userId || '').trim();
  if (!uid) return '';
  if (uid === 'ai-agent') return 'Assistente IA';
  if (uid === 'system') return 'Sistema';

  const map = cache instanceof Map ? cache : null;
  if (map?.has(uid)) return map.get(uid);

  const api = getUsersApi();
  let label = uid;
  if (api) {
    try {
      const u = await api.get(uid);
      label = String(u.name || u.email || '').trim() || uid;
    } catch {
      label = uid.length > 12 ? `${uid.slice(0, 6)}…${uid.slice(-4)}` : uid;
    }
  }

  if (map) map.set(uid, label);
  return label;
}

export async function enrichRowsWithAuthorName(rows, { idKey = 'author_id', nameKey = 'author_name' } = {}) {
  const cache = new Map();
  const list = Array.isArray(rows) ? rows : [];
  return Promise.all(
    list.map(async (row) => {
      const id = String(row?.[idKey] || '').trim();
      const name = await resolveUserDisplayName(id, cache);
      return name ? { ...row, [nameKey]: name } : row;
    })
  );
}
