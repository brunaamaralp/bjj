import { INBOX_MSG_TRUNCATE_CHARS } from './inboxUiConstants.js';

function estimateMessageItemHeight(m, expanded) {
  const content = String(m?.content || '');
  const typeLower = String(m?.type || '').toLowerCase();
  if (typeLower === 'image' || /\[imagem/i.test(content)) return 200;
  if (typeLower === 'audio' || typeLower === 'ptt' || /\[áudio/i.test(content)) return 76;
  if (['video', 'document', 'sticker', 'file'].includes(typeLower)) return 88;
  if (/\[(vídeo|documento|arquivo)/i.test(content)) return 88;

  const len = content.length;
  const truncated = !expanded && len > INBOX_MSG_TRUNCATE_CHARS;
  if (truncated) return 100;
  const lines = Math.max(1, Math.ceil(len / 48));
  return Math.min(56 + lines * 22, 420);
}

/**
 * Altura estimada de um bloco do thread (divisor de dia ou grupo de bolhas).
 * @param {object} block
 * @param {Record<string, boolean>} [expandedMsgs]
 */
export function estimateInboxThreadBlockHeight(block, expandedMsgs = {}) {
  if (!block || typeof block !== 'object') return 48;
  if (block.type === 'day') return 36;

  const items = Array.isArray(block.items) ? block.items : [];
  let h = 16;
  for (const entry of items) {
    const key = String(entry?.key || '');
    const m = entry?.m;
    h += estimateMessageItemHeight(m, Boolean(expandedMsgs[key]));
    if (expandedMsgs[key]) h += 12;
  }
  return Math.max(h, 56);
}

/** Índice do bloco que contém a mensagem (para scroll). */
export function findThreadBlockIndexForMsgKey(blocks, msgKey) {
  const key = String(msgKey || '').trim();
  if (!key || !Array.isArray(blocks)) return -1;
  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i];
    if (b?.type === 'day') continue;
    const items = Array.isArray(b?.items) ? b.items : [];
    if (items.some((it) => String(it?.key || '') === key)) return i;
  }
  return -1;
}

export function threadBlockReactKey(block, index) {
  if (block?.type === 'day') return `day:${block.key || index}`;
  return `group:${block?.id || index}`;
}
