/**
 * Metadados da última mensagem para exibição na lista de conversas.
 * Persistidos em last_preview / last_message_* no doc; fallback via deriveLastMessageMeta(messages).
 */

export function sortMessagesChrono(msgs) {
  const arr = Array.isArray(msgs) ? msgs.slice() : [];
  return arr.sort((a, b) => {
    const ta = new Date(String(a?.timestamp || '')).getTime();
    const tb = new Date(String(b?.timestamp || '')).getTime();
    const na = Number.isFinite(ta) ? ta : 0;
    const nb = Number.isFinite(tb) ? tb : 0;
    if (na !== nb) return na - nb;
    return 0;
  });
}

const EMPTY_META = {
  last_preview: '',
  last_message_role: '',
  last_message_sender: '',
  last_message_timestamp: '',
};

/**
 * @param {Array} messages
 * @returns {{ last_preview: string, last_message_role: string, last_message_sender: string, last_message_timestamp: string }}
 */
export function deriveLastMessageMeta(messages) {
  const arr = sortMessagesChrono(messages);
  if (arr.length === 0) return { ...EMPTY_META };
  const last = arr[arr.length - 1];
  const content = String(last?.content || '').trim();
  const preview = content.replace(/_{2,}/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    last_preview: preview,
    last_message_role: last?.role === 'assistant' ? 'assistant' : 'user',
    last_message_sender: String(last?.sender || '').trim() || (last?.role === 'assistant' ? 'ai' : ''),
    last_message_timestamp: String(last?.timestamp || '').trim(),
  };
}

/**
 * @param {Record<string, unknown> | null | undefined} doc
 */
export function hasStoredLastMessageMeta(doc) {
  if (!doc || typeof doc !== 'object') return false;
  const preview = String(doc.last_preview ?? '').trim();
  const ts = String(doc.last_message_timestamp ?? '').trim();
  return Boolean(preview || ts);
}

/**
 * @param {Record<string, unknown> | null | undefined} doc
 */
export function readStoredLastMessageMeta(doc) {
  if (!doc || typeof doc !== 'object') return { ...EMPTY_META };
  return {
    last_preview: String(doc.last_preview ?? '').trim(),
    last_message_role: String(doc.last_message_role ?? '').trim(),
    last_message_sender: String(doc.last_message_sender ?? '').trim(),
    last_message_timestamp: String(doc.last_message_timestamp ?? '').trim(),
  };
}

/**
 * Payload parcial para persistir last_* após merge de mensagens.
 * @param {Array} mergedMessages
 */
export function lastMessageMetaPayload(mergedMessages) {
  return deriveLastMessageMeta(mergedMessages);
}
