/**
 * Lógica pura extraída de useInboxConversationList.js (linhas 134–162).
 * Mantida no harness de testes — não altera produção.
 */

/**
 * @param {Record<string, unknown>} item
 * @param {Map<string, { unread_count?: number; last_user_msg_at?: string; updated_at?: string }> | undefined} previousMeta
 * @param {string} selectedPhone
 */
export function shouldNotifyConversationListItem(item, previousMeta, selectedPhone) {
  const phone = String(item?.phone_number || '').trim();
  const selected = String(selectedPhone || '').trim();
  if (!phone || phone === selected) return false;

  const curUnread = Number.isFinite(Number(item?.unread_count)) ? Number(item.unread_count) : 0;
  if (curUnread <= 0) return false;

  const prev = previousMeta instanceof Map ? previousMeta.get(phone) : undefined;
  const prevUnread = prev && Number.isFinite(Number(prev.unread_count)) ? Number(prev.unread_count) : 0;
  const prevLu = prev && typeof prev.last_user_msg_at === 'string' ? prev.last_user_msg_at : '';
  const curLu = String(item?.last_user_msg_at || '').trim();
  const prevUpdated = prev && typeof prev.updated_at === 'string' ? prev.updated_at : '';
  const curUpdated = String(item?.updated_at || '').trim();
  const unreadIncreased = curUnread > prevUnread;
  const userMsgRenewed = Boolean(curLu && curLu !== prevLu);
  const updatedAdvanced = Boolean(curUpdated && curUpdated !== prevUpdated);

  if (!unreadIncreased && !(userMsgRenewed && updatedAdvanced)) return false;
  return true;
}
