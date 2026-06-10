import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInboxConversationList } from '../hooks/useInboxConversationList.js';

vi.mock('../lib/inboxApiUtils.js', () => ({
  getInboxJwt: vi.fn().mockResolvedValue('jwt-test'),
  normalizeInboxApiError: (_raw, fb) => fb,
  safeParseInboxJson: (raw) => JSON.parse(raw),
}));

vi.mock('../lib/billingBlockedFetch', () => ({
  fetchWithBillingGuard: vi.fn(),
}));

import { fetchWithBillingGuard } from '../lib/billingBlockedFetch.js';

function createListHarness() {
  const academyIdRef = { current: 'acad-1' };
  const listFilterRef = { current: 'all' };
  const selectedPhoneRef = { current: '' };
  const listMetaRef = { current: new Map() };
  const notifiedOnceRef = { current: false };
  const loadingListRef = { current: false };
  const onListItemNotifyRef = { current: vi.fn() };
  const onListReadyRef = { current: vi.fn() };
  const onStatsFromListRef = { current: vi.fn() };

  let nextCursor = null;
  let hasMore = true;
  let loading = false;
  let loadingMore = false;
  let items = [];
  let listCapped = false;

  const setters = {
    setNextCursor: vi.fn((v) => {
      nextCursor = typeof v === 'function' ? v(nextCursor) : v;
    }),
    setHasMore: vi.fn((v) => {
      hasMore = typeof v === 'function' ? v(hasMore) : v;
    }),
    setError: vi.fn(),
    setLoading: vi.fn((v) => {
      loading = typeof v === 'function' ? v(loading) : v;
    }),
    setLoadingMore: vi.fn((v) => {
      loadingMore = typeof v === 'function' ? v(loadingMore) : v;
    }),
    setLastUpdatedAt: vi.fn(),
    setItems: vi.fn((fn) => {
      items = typeof fn === 'function' ? fn(items) : fn;
    }),
    setListCapped: vi.fn((v) => {
      listCapped = typeof v === 'function' ? v(listCapped) : v;
    }),
  };

  return {
    academyIdRef,
    listFilterRef,
    selectedPhoneRef,
    listMetaRef,
    notifiedOnceRef,
    loadingListRef,
    onListItemNotifyRef,
    get state() {
      return { nextCursor, hasMore, loading, loadingMore, items, listCapped };
    },
    ...setters,
  };
}

describe('useInboxConversationList', () => {
  beforeEach(() => {
    vi.mocked(fetchWithBillingGuard).mockReset();
  });

  it('loadList loads items on reset', async () => {
    vi.mocked(fetchWithBillingGuard).mockResolvedValue({
      blocked: false,
      res: {
        ok: true,
        text: async () =>
          JSON.stringify({
            items: [{ phone_number: '5511999990001', unread_count: 0 }],
            next_cursor: '',
          }),
      },
    });

    const h = createListHarness();
    const { result } = renderHook(() =>
      useInboxConversationList({
        academyIdRef: h.academyIdRef,
        debouncedSearchQuery: '',
        listFilterRef: h.listFilterRef,
        selectedPhoneRef: h.selectedPhoneRef,
        listMetaRef: h.listMetaRef,
        notifiedOnceRef: h.notifiedOnceRef,
        loadingListRef: h.loadingListRef,
        nextCursor: h.state.nextCursor,
        hasMore: h.state.hasMore,
        loading: h.state.loading,
        loadingMore: h.state.loadingMore,
        onListItemNotifyRef: h.onListItemNotifyRef,
        onListReadyRef: h.onListReadyRef,
        onStatsFromListRef: h.onStatsFromListRef,
        ...h,
      })
    );

    await act(async () => {
      await result.current.loadList({ reset: true });
    });

    expect(h.state.items).toHaveLength(1);
    expect(h.state.items[0].phone_number).toBe('5511999990001');
  });

  it('loadList sends include_stats and notifies callbacks', async () => {
    const onListReadyRef = { current: vi.fn() };
    const onStatsFromListRef = { current: vi.fn() };
    let capturedUrl = '';
    vi.mocked(fetchWithBillingGuard).mockImplementation(async (url) => {
      capturedUrl = String(url);
      return {
        blocked: false,
        res: {
          ok: true,
          text: async () =>
            JSON.stringify({
              items: [{ id: 'c1', phone_number: '5511888777666', unread_count: 0 }],
              next_cursor: '',
              stats: { unread_conversations: 2, needs_me: 1, resolved: 0, transferred: 0 },
            }),
        },
      };
    });

    const h = createListHarness();
    const { result } = renderHook(() =>
      useInboxConversationList({
        academyIdRef: h.academyIdRef,
        debouncedSearchQuery: '',
        listFilterRef: h.listFilterRef,
        selectedPhoneRef: h.selectedPhoneRef,
        listMetaRef: h.listMetaRef,
        notifiedOnceRef: h.notifiedOnceRef,
        loadingListRef: h.loadingListRef,
        nextCursor: h.state.nextCursor,
        hasMore: h.state.hasMore,
        loading: h.state.loading,
        loadingMore: h.state.loadingMore,
        onListItemNotifyRef: h.onListItemNotifyRef,
        ...h,
        onListReadyRef,
        onStatsFromListRef,
      })
    );

    await act(async () => {
      await result.current.loadList({ reset: true });
    });

    expect(capturedUrl).toContain('include_stats=1');
    expect(onStatsFromListRef.current).toHaveBeenCalledWith({
      unread_conversations: 2,
      needs_me: 1,
      resolved: 0,
      transferred: 0,
    });
    expect(onListReadyRef.current).toHaveBeenCalledWith(
      expect.objectContaining({ firstPhone: '5511888777666', firstConversationId: 'c1' })
    );
  });
});
