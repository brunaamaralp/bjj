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
import { invalidateInboxThreadCache } from '../lib/inboxThreadCache.js';

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
    invalidateInboxThreadCache('acad-1', '5511999887766');
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

  it('retries fetch when inflight prefetch finishes without cache', async () => {
    let callCount = 0;
    vi.mocked(fetchWithBillingGuard).mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          blocked: false,
          res: {
            ok: false,
            headers: { get: () => 'application/json' },
            text: async () => JSON.stringify({ erro: 'prefetch fail' }),
          },
        };
      }
      return {
        blocked: false,
        res: {
          ok: true,
          headers: { get: () => 'application/json' },
          text: async () =>
            JSON.stringify({
              conversation_id: 'conv-99',
              messages: [{ message_id: 'm1', role: 'user', content: 'ok' }],
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
      await result.current.loadThread('5511999887766', { prefetch: true });
    });

    await act(async () => {
      await result.current.loadThread('5511999887766');
    });

    expect(callCount).toBe(2);
    expect(h.setSelected).toHaveBeenCalled();
  });

  it('skips setSelected on silent refresh when messages unchanged', async () => {
    const messages = [{ message_id: 'm1', role: 'user', content: 'stable', status: 'sent' }];
    vi.mocked(fetchWithBillingGuard).mockResolvedValue({
      blocked: false,
      res: {
        ok: true,
        headers: { get: () => 'application/json' },
        text: async () =>
          JSON.stringify({
            conversation_id: 'conv-99',
            messages,
            next_cursor: '',
            ticket_status: 'open',
          }),
      },
    });

    const h = createThreadHarness();
    h.selectedRef.current = { phone: '5511999887766', messages };

    let selectedUpdaterResult;
    h.setSelected.mockImplementation((fn) => {
      if (typeof fn === 'function') {
        selectedUpdaterResult = fn(h.selectedRef.current);
      }
    });

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
      await result.current.loadThread('5511999887766', { silent: true });
    });

    expect(selectedUpdaterResult).toBe(h.selectedRef.current);
  });
});
