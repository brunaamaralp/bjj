import { useMemo } from 'react';
import { inboxFilterLabel } from '../lib/inboxUrlState.js';

function useInboxListTopbarMeta({
  loading,
  searchPending,
  listMetaShowsFiltered,
  visibleConversationCount,
  itemsLength,
  lastUpdatedAt,
}) {
  return useMemo(() => {
    if (loading || searchPending) {
      return searchPending ? 'Buscando…' : 'Carregando…';
    }
    if (listMetaShowsFiltered) {
      return `${visibleConversationCount} exibidas · ${itemsLength} carregadas`;
    }
    const updatedSuffix = lastUpdatedAt
      ? ` · atualizado às ${new Date(lastUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
      : '';
    return `${itemsLength} conversas${updatedSuffix}`;
  }, [
    loading,
    searchPending,
    listMetaShowsFiltered,
    visibleConversationCount,
    itemsLength,
    lastUpdatedAt,
  ]);
}

/**
 * Props estáveis para InboxListPanel.
 */
export function useInboxListPanelProps(params) {
  const {
    search,
    onSearchChange,
    searchQuery,
    hasMore,
    listFilter,
    stats,
    extraFiltersMenuOpen,
    setExtraFiltersMenuOpen,
    inboxExtraFilterActive,
    setListFilter,
    onConversationListScroll,
    groupedFilteredItems,
    loading,
    itemsLength,
    waChatConnected,
    loadingMore,
    handleSelectConversation,
    onPrefetchConversation,
    selectedPhone,
    ticketChip,
    formatTimeOnly,
    formatWhen,
    formatListActivityLabel,
    isMobile,
    handleClearInboxListFilters,
    setConversationSheet,
    agentIaActive,
    searchPending,
    listMetaShowsFiltered,
    visibleConversationCount,
    lastUpdatedAt,
    pageActionsMenu,
    onSyncWhatsApp,
    waSyncing,
    desktopNotify,
    onToggleDesktopNotify,
  } = params;

  const listTopbarMeta = useInboxListTopbarMeta({
    loading,
    searchPending,
    listMetaShowsFiltered,
    visibleConversationCount,
    itemsLength,
    lastUpdatedAt,
  });

  const activeFilterLabel = inboxExtraFilterActive ? inboxFilterLabel(listFilter) : '';

  return useMemo(
    () => ({
      search,
      onSearchChange,
      searchQuery,
      hasMore,
      listFilter,
      stats,
      extraFiltersMenuOpen,
      setExtraFiltersMenuOpen,
      inboxExtraFilterActive,
      setListFilter,
      onConversationListScroll,
      groupedFilteredItems,
      loading,
      itemsLength,
      waChatConnected,
      loadingMore,
      handleSelectConversation,
      onPrefetchConversation,
      selectedPhone,
      ticketChip,
      formatTimeOnly,
      formatWhen,
      formatListActivityLabel,
      isMobile,
      handleClearInboxListFilters,
      setConversationSheet,
      agentIaActive,
      searchPending,
      activeFilterLabel,
      onClearActiveFilter: () => setListFilter('all'),
      listTopbarMeta,
      pageActionsMenu,
      onSyncWhatsApp,
      waSyncing,
      desktopNotify,
      onToggleDesktopNotify,
    }),
    [
      search,
      onSearchChange,
      searchQuery,
      hasMore,
      listFilter,
      stats,
      extraFiltersMenuOpen,
      setExtraFiltersMenuOpen,
      inboxExtraFilterActive,
      setListFilter,
      onConversationListScroll,
      groupedFilteredItems,
      loading,
      itemsLength,
      waChatConnected,
      loadingMore,
      handleSelectConversation,
      onPrefetchConversation,
      selectedPhone,
      ticketChip,
      formatTimeOnly,
      formatWhen,
      formatListActivityLabel,
      isMobile,
      handleClearInboxListFilters,
      setConversationSheet,
      agentIaActive,
      searchPending,
      activeFilterLabel,
      listTopbarMeta,
      pageActionsMenu,
      onSyncWhatsApp,
      waSyncing,
      desktopNotify,
      onToggleDesktopNotify,
    ]
  );
}
