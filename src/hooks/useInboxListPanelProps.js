import { useMemo } from 'react';
import { inboxFilterLabel } from '../lib/inboxUrlState.js';

function useInboxListTopbarMeta({
  loading,
  listFetchedOnce,
  searchPending,
  listMetaShowsFiltered,
  visibleConversationCount,
  itemsLength,
  lastUpdatedAt,
  whatsappDisconnected = false,
}) {
  return useMemo(() => {
    if (whatsappDisconnected && listFetchedOnce) {
      return 'WhatsApp não conectado';
    }
    if (loading || searchPending || !listFetchedOnce) {
      if (searchPending) return 'Buscando…';
      return 'Carregando…';
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
    listFetchedOnce,
    searchPending,
    listMetaShowsFiltered,
    visibleConversationCount,
    itemsLength,
    lastUpdatedAt,
    whatsappDisconnected,
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
    listFetchedOnce = false,
    itemsLength,
    waChatConnected,
    whatsappDisconnected = false,
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
    listFetchedOnce,
    searchPending,
    listMetaShowsFiltered,
    visibleConversationCount,
    itemsLength,
    lastUpdatedAt,
    whatsappDisconnected,
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
      listFetchedOnce,
      itemsLength,
      waChatConnected,
      whatsappDisconnected,
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
      listFetchedOnce,
      itemsLength,
      waChatConnected,
      whatsappDisconnected,
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
