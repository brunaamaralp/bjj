import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useInboxListPanelProps } from '../hooks/useInboxListPanelProps.js';

const noop = () => {};

describe('useInboxListPanelProps', () => {
  it('monta meta da lista e rótulo de filtro ativo', () => {
    const { result } = renderHook(() =>
      useInboxListPanelProps({
        search: '',
        onSearchChange: noop,
        searchQuery: '',
        hasMore: false,
        listFilter: 'needs_me',
        stats: {},
        extraFiltersMenuOpen: false,
        setExtraFiltersMenuOpen: noop,
        inboxExtraFilterActive: true,
        setListFilter: noop,
        onConversationListScroll: noop,
        groupedFilteredItems: [],
        loading: false,
        itemsLength: 3,
        waChatConnected: true,
        loadingMore: false,
        handleSelectConversation: noop,
        onPrefetchConversation: noop,
        selectedPhone: '',
        ticketChip: null,
        formatTimeOnly: noop,
        formatWhen: noop,
        formatListActivityLabel: noop,
        isMobile: false,
        handleClearInboxListFilters: noop,
        setConversationSheet: noop,
        agentIaActive: false,
        searchPending: false,
        listMetaShowsFiltered: true,
        visibleConversationCount: 2,
        lastUpdatedAt: null,
        pageActionsMenu: null,
        onSyncWhatsApp: noop,
        waSyncing: false,
        desktopNotify: false,
        onToggleDesktopNotify: noop,
      })
    );

    expect(result.current.activeFilterLabel).toBeTruthy();
    expect(result.current.itemsLength).toBe(3);
    expect(result.current.onClearActiveFilter).toBeTypeOf('function');
  });
});
