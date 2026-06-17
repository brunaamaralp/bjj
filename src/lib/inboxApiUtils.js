import { clearSessionJwtCache, createSessionJwt } from './appwrite';
import { friendlyError } from './errorMessages.js';

export function clearInboxJwtCache() {
  clearSessionJwtCache();
}

/**
 * @param {{ forceRefresh?: boolean }} [opts]
 */
export async function getInboxJwt(opts = {}) {
  if (opts?.forceRefresh) clearSessionJwtCache();
  return createSessionJwt();
}

export function safeParseInboxJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Extrai mensagem amigável de respostas da API do inbox.
 * @param {string} raw
 * @param {string} [fallback]
 * @param {'load'|'send'|'save'|'action'} [context]
 */
export function normalizeInboxApiError(raw, fallback, context = 'action') {
  const s = String(raw || '').trim();
  const parsed = safeParseInboxJson(s);
  if (parsed && typeof parsed === 'object') {
    if (typeof parsed.erro === 'string' && parsed.erro.trim()) {
      return friendlyError({ message: parsed.erro.trim(), erro: parsed.erro }, context);
    }
    if (typeof parsed.error === 'string' && parsed.error.trim()) {
      return friendlyError({ message: parsed.error.trim(), error: parsed.error }, context);
    }
  }
  if (!s) return friendlyError(fallback || null, context);
  return friendlyError({ message: s }, context);
}
