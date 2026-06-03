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

describe('useInboxThreadLoader', () => {
  beforeEach(() => {
    vi.mocked(fetchWithBillingGuard).mockReset();
  });

  it('loadThread sets messages on success', async () => {
    vi.mocked(fetchWithBillingGuard).mockResolvedValue({
      blocked: false,
      res: {
        ok: true,
        headers: { get: () => 'application/json' },
        text: async () =>
          JSON.stringify({
            messages: [{ role: 'user', content: 'Oi', message_id: 'm1', timestamp: '2026-01-01T12:00:00Z' }],
            next_cursor: '',
            ticket_status: 'open',
            need_human: false,
          }),
      },
    });

    const academyIdRef = { current: 'acad-1' };
    const threadScrollRef = { current: null };
    const threadAbortRef = { current: null };
    const threadRequestSeqRef = { current: 0 };
    const lastAutoScrollPhoneRef = { current: '' };
    let selected = null;
    const setSelected = vi.fn((fn) => {
      selected = typeof fn === 'function' ? fn(selected) : fn;
    });
    const setItems = vi.fn();

    const { result } = renderHook(() =>
      useInboxThreadLoader({
        academyIdRef,
        threadScrollRef,
        threadAbortRef,
        threadRequestSeqRef,
        lastAutoScrollPhoneRef,
        setError: vi.fn(),
        setThreadError: vi.fn(),
        setThreadPaging: vi.fn(),
        setThreadLoading: vi.fn(),
        setThreadCursor: vi.fn(),
        setThreadHasMore: vi.fn(),
        setSelected,
        setItems,
      })
    );

    await act(async () => {
      await result.current.loadThread('5511999990001');
    });

    expect(setSelected).toHaveBeenCalled();
    const lastCall = setSelected.mock.calls[setSelected.mock.calls.length - 1][0];
    const next = lastCall(null);
    expect(next.phone).toBe('5511999990001');
    expect(next.messages).toHaveLength(1);
  });
});
