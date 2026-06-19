import { safeParseMessages } from './conversationsStore.js';
import { sortMessagesChrono } from './conversationListMeta.js';

/** Últimas N mensagens persistidas em `messages_recent` para leitura rápida do inbox. */
export const MESSAGES_RECENT_CAP = 80;

/** Limite do atributo `messages_recent` no Appwrite (string 32768). */
export const MESSAGES_RECENT_MAX_BYTES = 32768;

/** Limite do atributo `messages` no Appwrite (string 65535). */
export const MESSAGES_STORE_MAX_BYTES = 65535;

/** Página de mensagens por índice (cursor numérico ou `full:N`). */
export function paginateMessagesWindow(sorted, limit, cursor) {
  const len = sorted.length;
  if (!cursor) {
    const startIdx = Math.max(0, len - limit);
    return { slice: sorted.slice(startIdx), next_cursor: startIdx > 0 ? String(startIdx) : '' };
  }
  const startIdx = parseInt(cursor, 10);
  if (!Number.isFinite(startIdx) || startIdx <= 0) {
    const s = Math.max(0, len - limit);
    return { slice: sorted.slice(s), next_cursor: s > 0 ? String(s) : '' };
  }
  const from = Math.max(0, startIdx - limit);
  return { slice: sorted.slice(from, startIdx), next_cursor: from > 0 ? String(from) : '' };
}

/**
 * Versão enxuta para caber no limite de 32KB (trunca texto longo e URLs de mídia).
 * @param {unknown} raw
 */
export function leanMessageForRecent(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const m = { ...raw };
  const content = String(m.content || '');
  if (content.length > 480) {
    m.content = `${content.slice(0, 480)}…`;
  }
  for (const key of ['mediaUrl', 'media_url']) {
    const url = String(m[key] || '').trim();
    if (url.length > 240) {
      delete m[key];
    }
  }
  return m;
}

/**
 * @param {unknown[]} mergedMessages
 * @param {number} [cap]
 */
export function buildMessagesRecentPayload(mergedMessages, cap = MESSAGES_RECENT_CAP) {
  const arr = Array.isArray(mergedMessages) ? mergedMessages : [];
  let sliceCap = Math.min(cap, arr.length);
  const maxBytes = MESSAGES_RECENT_MAX_BYTES - 64;

  while (sliceCap > 3) {
    const tail = arr.slice(-sliceCap).map(leanMessageForRecent);
    const json = JSON.stringify(tail);
    if (json.length <= maxBytes) return json;
    sliceCap = Math.max(3, Math.floor(sliceCap * 0.7));
  }

  const minimal = arr.slice(-sliceCap).map((m) => {
    const lean = leanMessageForRecent(m);
    return {
      role: lean?.role,
      message_id: lean?.message_id,
      timestamp: lean?.timestamp,
      content: String(lean?.content || '').slice(0, 200),
      type: lean?.type,
      sender: lean?.sender,
    };
  });
  let json = JSON.stringify(minimal);
  if (json.length > maxBytes && minimal.length > 1) {
    json = JSON.stringify(minimal.slice(-Math.max(1, Math.floor(minimal.length / 2))));
  }
  return json;
}

/**
 * Serializa histórico completo respeitando o teto do atributo `messages`.
 * Remove mensagens antigas (início do array) até caber; preserva as mais recentes.
 * @param {unknown[]} mergedMessages
 * @param {{ academyId?: string; phoneNumber?: string }} [logContext]
 */
function buildMessagesStorePayloadJson(mergedMessages, logContext = {}) {
  const arr = Array.isArray(mergedMessages) ? mergedMessages : [];
  const maxBytes = MESSAGES_STORE_MAX_BYTES - 64;
  if (arr.length === 0) return { json: '[]', removed: 0, kept: [] };

  let start = 0;
  let json = JSON.stringify(arr);
  while (json.length > maxBytes && start < arr.length - 1) {
    start += 1;
    json = JSON.stringify(arr.slice(start));
  }

  const kept = arr.slice(start);
  const removed = start;
  if (removed > 0) {
    console.warn(
      JSON.stringify({
        event: 'messages_store_truncated',
        academy_id: String(logContext.academyId || '').trim() || null,
        phone_number: String(logContext.phoneNumber || '').trim() || null,
        messages_removed: removed,
        messages_kept: kept.length,
      })
    );
  } else if (json.length > maxBytes) {
    console.warn(
      JSON.stringify({
        event: 'messages_store_oversized_single',
        academy_id: String(logContext.academyId || '').trim() || null,
        phone_number: String(logContext.phoneNumber || '').trim() || null,
        json_bytes: json.length,
        max_bytes: maxBytes,
      })
    );
  }

  return { json, removed, kept };
}

/**
 * @param {unknown[]} mergedMessages
 * @param {{ academyId?: string; phoneNumber?: string }} [logContext]
 */
export function conversationMessagesStoragePayload(mergedMessages, logContext = {}) {
  const merged = Array.isArray(mergedMessages) ? mergedMessages : [];
  const { json: messagesJson, kept } = buildMessagesStorePayloadJson(merged, logContext);
  return {
    messages: messagesJson,
    messages_recent: buildMessagesRecentPayload(kept),
  };
}

function fullHistoryOffset(fullSorted, sortedRecent) {
  const fullLen = fullSorted.length;
  const recentLen = sortedRecent.length;
  return fullLen > recentLen ? fullLen - recentLen : 0;
}

/**
 * Pagina mensagens do thread: `messages_recent` primeiro; cursor `full:N` para histórico anterior.
 * @param {Record<string, unknown> | null | undefined} doc
 * @param {{ limit: number, cursor?: string, fullMessagesDoc?: Record<string, unknown> | null }} opts
 */
export function loadThreadMessagesFromDoc(doc, { limit, cursor = '', fullMessagesDoc = null } = {}) {
  const fullSorted = sortMessagesChrono(
    safeParseMessages(fullMessagesDoc?.messages ?? doc?.messages)
  );
  const recentParsed = safeParseMessages(doc?.messages_recent);
  const sortedRecent = recentParsed.length > 0 ? sortMessagesChrono(recentParsed) : null;
  const cur = String(cursor || '').trim();

  if (cur.startsWith('full:')) {
    const fullCursor = cur.slice(5).trim();
    return paginateMessagesWindow(fullSorted, limit, fullCursor);
  }

  if (sortedRecent && sortedRecent.length > 0) {
    const { slice, next_cursor: recentNext } = paginateMessagesWindow(sortedRecent, limit, cur);
    if (recentNext) {
      return { slice, next_cursor: recentNext };
    }
    const offset = fullHistoryOffset(fullSorted, sortedRecent);
    if (offset > 0) {
      return { slice, next_cursor: `full:${offset}` };
    }
    return { slice, next_cursor: '' };
  }

  return paginateMessagesWindow(fullSorted, limit, cur);
}

export function threadNeedsFullMessagesFetch(cursor) {
  return String(cursor || '').trim().startsWith('full:');
}

/** `messages_recent` ausente ou `[]` exige leitura do blob `messages` (lento). */
export function hasUsableMessagesRecent(doc) {
  return safeParseMessages(doc?.messages_recent).length > 0;
}
