import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInboxThreadLoader } from '../hooks/useInboxThreadLoader.js';

vi.mock('../lib/inboxApiUtils.js', () => ({
  getInboxJwt: vi.fn().mockResolvedValue('jwt-test'),
  normalizeInboxApiError: (_raw, fb) => fb,
  safeParseInboxJson: (raw) => JSON.parse(raw),
}));

vi.mock('../lib/billingBlockedFetch', () => ({
  fetchWithBillingGuard: vi.fn(),
}));

import { fetchWithBillingGuard } from '../lib/billingBlockedFetch.js';

function createThreadHarness() {
  const academyIdRef = { current: 'acad-1' };
  const threadScrollRef = { current: null };
  const threadAbortRef = { current: null };
  const threadRequestSeqRef = { current: 0 };
  const lastAutoScrollPhoneRef = { current: '' };
  const itemsRef = { current: [{ id: 'conv-99', phone_number: '5511999887766' }] };
  const selectedRef = { current: null };

  const setters = {
    setError: vi.fn(),
    setThreadError: vi.fn(),
    setThreadPaging: vi.fn(),
    setThreadLoading: vi.fn(),
    setThreadCursor: vi.fn(),
    setThreadHasMore: vi.fn(),
    setSelected: vi.fn(),
    setItems: vi.fn(),
  };

  return { academyIdRef, threadScrollRef, threadAbortRef, threadRequestSeqRef, lastAutoScrollPhoneRef, itemsRef, selectedRef, ...setters };
}

describe('useInboxThreadLoader', () => {
  beforeEach(() => {
    vi.mocked(fetchWithBillingGuard).mockReset();
  });

  it('passes conversation_id from list item', async () => {
    let capturedUrl = '';
    vi.mocked(fetchWithBillingGuard).mockImplementation(async (url) => {
      capturedUrl = String(url);
      return {
        blocked: false,
        res: {
          ok: true,
          headers: { get: () => 'application/json' },
          text: async () =>
            JSON.stringify({
              conversation_id: 'conv-99',
              messages: [],
              next_cursor: '',
              ticket_status: 'open',
            }),
        },
      };
    });

    const h = createThreadHarness();
    const { result } = renderHook(() =>
      useInboxThreadLoader({
        academyIdRef: h.academyIdRef,
        threadScrollRef: h.threadScrollRef,
        threadAbortRef: h.threadAbortRef,
        threadRequestSeqRef: h.threadRequestSeqRef,
        lastAutoScrollPhoneRef: h.lastAutoScrollPhoneRef,
        itemsRef: h.itemsRef,
        selectedRef: h.selectedRef,
        setError: h.setError,
        setThreadError: h.setThreadError,
        setThreadPaging: h.setThreadPaging,
        setThreadLoading: h.setThreadLoading,
        setThreadCursor: h.setThreadCursor,
        setThreadHasMore: h.setThreadHasMore,
        setSelected: h.setSelected,
        setItems: h.setItems,
      })
    );

    await act(async () => {
      await result.current.loadThread('5511999887766');
    });

    expect(capturedUrl).toContain('conversation_id=conv-99');
  });
});
