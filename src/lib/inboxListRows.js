import {
  INBOX_LIST_SECTION_INITIAL,
} from './inboxUiConstants.js';

/** @typedef {'header'|'item'|'more'|'collapsed'} InboxListRowType */

/**
 * Linhas achatadas para render (e virtualização) da lista de conversas.
 * @param {Array<{ key: string, label: string, items: object[] }>} groups
 * @param {Set<string>} collapsedGroups
 * @param {Record<string, number>} visibleByGroup
 */
export function buildInboxListRows(groups, collapsedGroups, visibleByGroup) {
  const rows = [];
  const list = Array.isArray(groups) ? groups : [];
  const collapsed = collapsedGroups instanceof Set ? collapsedGroups : new Set();
  const limits = visibleByGroup && typeof visibleByGroup === 'object' ? visibleByGroup : {};

  for (const group of list) {
    const groupKey = String(group?.key ?? '');
    const items = Array.isArray(group?.items) ? group.items : [];
    if (!items.length) continue;

    const isGroupCollapsed = collapsed.has(groupKey);
    const isCollapsible = groupKey === 'resolved' || items.length > INBOX_LIST_SECTION_INITIAL;

    rows.push({
      type: 'header',
      id: `header:${groupKey}`,
      groupKey,
      label: String(group?.label ?? ''),
      count: items.length,
      collapsible: isCollapsible,
      collapsed: isGroupCollapsed,
    });

    if (isGroupCollapsed) {
      rows.push({
        type: 'collapsed',
        id: `collapsed:${groupKey}`,
        groupKey,
        hiddenCount: items.length,
      });
      continue;
    }

    const visibleLimit = Number(limits[groupKey]) || INBOX_LIST_SECTION_INITIAL;
    const visibleItems = items.slice(0, visibleLimit);
    for (let idx = 0; idx < visibleItems.length; idx += 1) {
      const it = visibleItems[idx];
      const phone = String(it?._phone || it?.phone_number || '').trim();
      rows.push({
        type: 'item',
        id: `item:${groupKey}:${String(it?.id || phone || idx)}`,
        groupKey,
        item: it,
      });
    }

    const hiddenCount = items.length - visibleItems.length;
    if (hiddenCount > 0) {
      rows.push({
        type: 'more',
        id: `more:${groupKey}`,
        groupKey,
        hiddenCount,
      });
    }
  }

  return rows;
}

export function estimateInboxListRowHeight(row) {
  if (!row || typeof row !== 'object') return 40;
  if (row.type === 'header') return 28;
  if (row.type === 'item') return 54;
  if (row.type === 'more' || row.type === 'collapsed') return 36;
  return 40;
}
