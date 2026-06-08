import { account } from './appwrite';

const JWT_CACHE_TTL_MS = 45_000;

/** @type {{ jwt: string, expiresAt: number } | null} */
let jwtCache = null;

export function clearInboxJwtCache() {
  jwtCache = null;
}

/**
 * @param {{ forceRefresh?: boolean }} [opts]
 */
export async function getInboxJwt(opts = {}) {
  const forceRefresh = Boolean(opts?.forceRefresh);
  const now = Date.now();
  if (!forceRefresh && jwtCache && jwtCache.expiresAt > now) {
    return jwtCache.jwt;
  }
  const jwt = await account.createJWT();
  const token = String(jwt?.jwt || '').trim();
  jwtCache = { jwt: token, expiresAt: now + JWT_CACHE_TTL_MS };
  return token;
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
