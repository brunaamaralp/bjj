import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useInboxListStats } from '../hooks/useInboxListStats.js';

vi.mock('../lib/inboxApiUtils.js', () => ({
  getInboxJwt: vi.fn().mockResolvedValue('jwt-test'),
  safeParseInboxJson: (raw) => JSON.parse(raw),
}));

vi.mock('../lib/billingBlockedFetch', () => ({
  fetchWithBillingGuard: vi.fn(),
}));

import { fetchWithBillingGuard } from '../lib/billingBlockedFetch.js';

describe('useInboxListStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchWithBillingGuard).mockResolvedValue({
      blocked: false,
      res: {
        ok: true,
        text: async () =>
          JSON.stringify({
            unread_conversations: 2,
            needs_me: 1,
            resolved: 3,
            transferred: 0,
          }),
      },
    });
  });

  it('refreshStats faz uma única request e hidrata stats', async () => {
    const { result } = renderHook(() =>
      useInboxListStats({ academyId: 'acad-1', listFilter: 'all' })
    );

    await act(async () => {
      await result.current.refreshStats();
    });

    expect(fetchWithBillingGuard).toHaveBeenCalledTimes(1);
    expect(fetchWithBillingGuard).toHaveBeenCalledWith(
      '/api/conversations?stats=1',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-academy-id': 'acad-1' }),
      })
    );
    expect(result.current.stats).toEqual({
      unreadBacklog: 2,
      needsMeBacklog: 1,
      resolvedCount: 3,
      transferredCount: 0,
    });
  });

  it('applyStatsFromList hidrata sem request extra', async () => {
    const { result } = renderHook(() =>
      useInboxListStats({ academyId: 'acad-1', listFilter: 'all' })
    );

    act(() => {
      result.current.applyStatsFromList({
        unread_conversations: 5,
        needs_me: 0,
        resolved: 1,
        transferred: 2,
      });
    });

    await waitFor(() => {
      expect(result.current.stats.unreadBacklog).toBe(5);
    });
    expect(fetchWithBillingGuard).not.toHaveBeenCalled();
  });

  it('não dispara fallback timer de 400ms no mount', async () => {
    vi.useFakeTimers();
    renderHook(() => useInboxListStats({ academyId: 'acad-1', listFilter: 'all' }));

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(fetchWithBillingGuard).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
