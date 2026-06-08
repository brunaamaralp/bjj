import { useMemo } from 'react';
import {
  enrichInboxListItems,
  filterInboxListBySearch,
  filterInboxListItems,
  firstVisibleInboxConversation,
  flattenInboxGroups,
  groupInboxListItems,
  sortInboxByActivity,
} from '../lib/inboxListPipeline.js';

/**
 * Enriquecimento, filtro, agrupamento e lista plana da inbox (derivado de items + leads).
 */
export function useInboxListPipeline({
  items,
  leadById,
  leadByPhone,
  highlighted,
  listFilter,
  searchQuery = '',
  normalizePhone,
  pickDisplayName,
}) {
  const enrichedItems = useMemo(
    () =>
      enrichInboxListItems({
        items,
        leadById,
        leadByPhone,
        highlighted,
        normalizePhone,
        pickDisplayName,
      }),
    [items, leadById, leadByPhone, highlighted, normalizePhone, pickDisplayName]
  );

  const prioritizedItems = useMemo(() => sortInboxByActivity(enrichedItems), [enrichedItems]);

  const filteredItems = useMemo(
    () => filterInboxListItems(prioritizedItems, listFilter),
    [prioritizedItems, listFilter]
  );

  const searchFilteredItems = useMemo(
    () => filterInboxListBySearch(filteredItems, searchQuery, normalizePhone),
    [filteredItems, searchQuery, normalizePhone]
  );

  const groupedFilteredItems = useMemo(() => groupInboxListItems(searchFilteredItems), [searchFilteredItems]);

  const firstVisibleConversation = useMemo(
    () => firstVisibleInboxConversation(groupedFilteredItems),
    [groupedFilteredItems]
  );

  const flatVisibleConversations = useMemo(
    () => flattenInboxGroups(groupedFilteredItems),
    [groupedFilteredItems]
  );

  return {
    enrichedItems,
    prioritizedItems,
    filteredItems,
    groupedFilteredItems,
    firstVisibleConversation,
    flatVisibleConversations,
  };
}
