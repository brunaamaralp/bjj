/** Limites de UI da tela Conversas (lista + thread). */

export const INBOX_LIST_SECTION_INITIAL = 12;
export const INBOX_LIST_SECTION_MORE_STEP = 24;

/** Preview da lista em modo compacto. */
export const INBOX_LIST_PREVIEW_MAX_COMPACT = 36;

/** Altura fixa de cada linha de conversa (compact) — alinhada ao skeleton e ao virtualizer. */
export const INBOX_LIST_ITEM_ROW_HEIGHT = 72;

/** Texto da bolha antes de "Ver mais". */
export const INBOX_MSG_TRUNCATE_CHARS = 600;

/** Grupos recolhidos por padrão na lista (ex.: resolvidas). */
export const INBOX_LIST_DEFAULT_COLLAPSED_GROUPS = ['resolved'];

/** Virtualizar lista acima deste número de linhas renderizadas. */
export const INBOX_LIST_VIRTUALIZE_THRESHOLD = 20;

/** Virtualizar thread acima deste número de blocos (dia + grupos de bolhas). */
export const INBOX_THREAD_VIRTUALIZE_THRESHOLD = 40;

export const INBOX_LIST_LEGEND_DISMISSED_KEY = 'inbox_list_legend_dismissed';

/**
 * Trunca em limite de caracteres, preferindo quebra em espaço ou newline.
 * @param {string} text
 * @param {number} [maxChars=INBOX_MSG_TRUNCATE_CHARS]
 */
export function truncateInboxMessageText(text, maxChars = INBOX_MSG_TRUNCATE_CHARS) {
  const raw = String(text ?? '');
  if (raw.length <= maxChars) return raw;
  let cut = raw.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  const lastNewline = cut.lastIndexOf('\n');
  const breakAt = Math.max(lastSpace, lastNewline);
  if (breakAt > maxChars * 0.75) cut = cut.slice(0, breakAt);
  return `${cut.trimEnd()}…`;
}

/** Mensagem truncável: texto puro, sem mídia. */
export function isInboxTruncatableTextMessage(m, { isImageMsg, isAudioMsg, otherMediaKind }) {
  if (otherMediaKind || isImageMsg || isAudioMsg) return false;
  const typeLower = String(m?.type || '').trim().toLowerCase();
  if (!typeLower || typeLower === 'text' || typeLower === 'chat') return true;
  return !['image', 'audio', 'ptt', 'document', 'video', 'sticker', 'file'].includes(typeLower);
}
