import { account } from './appwrite';

export async function getInboxJwt() {
  const jwt = await account.createJWT();
  return String(jwt?.jwt || '').trim();
}

export function safeParseInboxJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function normalizeInboxApiError(raw, fallback) {
  const s = String(raw || '').trim();
  if (!s) return fallback;
  const parsed = safeParseInboxJson(s);
  if (parsed && typeof parsed === 'object') {
    if (typeof parsed.erro === 'string' && parsed.erro.trim()) return parsed.erro.trim();
    if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error.trim();
  }
  return s;
}
