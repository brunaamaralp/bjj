/** Máximo de conversas mantidas na lista em memória (performance). */
export const MAX_INBOX_LIST_ITEMS = 150;

/**
 * Mantém no máximo MAX_INBOX_LIST_ITEMS; preserva conversa selecionada se sair da janela.
 * @returns {{ items: unknown[], capped: boolean }}
 */
export function capInboxListItems(items, selectedPhone) {
  const list = Array.isArray(items) ? items : [];
  if (list.length <= MAX_INBOX_LIST_ITEMS) {
    return { items: list, capped: false };
  }
  const selected = String(selectedPhone || '').trim();
  let trimmed = list.slice(-MAX_INBOX_LIST_ITEMS);
  if (selected) {
    const selectedItem = list.find((it) => String(it?.phone_number || '').trim() === selected);
    if (selectedItem) {
      const inTrimmed = trimmed.some((it) => String(it?.phone_number || '').trim() === selected);
      if (!inTrimmed) {
        trimmed = [selectedItem, ...trimmed.slice(0, MAX_INBOX_LIST_ITEMS - 1)];
      }
    }
  }
  return { items: trimmed, capped: true };
}
