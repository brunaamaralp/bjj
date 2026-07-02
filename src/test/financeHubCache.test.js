import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchFinanceHubCached,
  financeHubCacheKey,
  invalidateFinanceHubCache,
  peekFinanceHubCache,
} from '../lib/financeHubCache.js';

describe('financeHubCache', () => {
  beforeEach(() => {
    invalidateFinanceHubCache();
  });

  it('returns cached data within TTL without calling fetcher again', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    const key = financeHubCacheKey(['overview', 'acad-1', '2026-07']);

    const first = await fetchFinanceHubCached(key, fetcher);
    const second = await fetchFinanceHubCached(key, fetcher);

    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(peekFinanceHubCache(key)).toEqual({ ok: true });
  });

  it('deduplicates concurrent in-flight requests', async () => {
    let resolve;
    const fetcher = vi.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        })
    );
    const key = financeHubCacheKey(['receivables', 'acad-2', '2026-06']);

    const p1 = fetchFinanceHubCached(key, fetcher);
    const p2 = fetchFinanceHubCached(key, fetcher);
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(1);

    resolve({ items: [] });
    await expect(Promise.all([p1, p2])).resolves.toEqual([{ items: [] }, { items: [] }]);
  });

  it('force bypasses cache', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ v: 1 })
      .mockResolvedValueOnce({ v: 2 });
    const key = financeHubCacheKey(['payables', 'acad-3']);

    await fetchFinanceHubCached(key, fetcher);
    const forced = await fetchFinanceHubCached(key, fetcher, { force: true });

    expect(forced).toEqual({ v: 2 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('invalidateFinanceHubCache clears entries for one academy', async () => {
    const fetcherA = vi.fn().mockResolvedValue({ a: 1 });
    const fetcherB = vi.fn().mockResolvedValue({ b: 1 });
    const keyA = financeHubCacheKey(['overview', 'acad-a', '2026-01']);
    const keyB = financeHubCacheKey(['overview', 'acad-b', '2026-01']);

    await fetchFinanceHubCached(keyA, fetcherA);
    await fetchFinanceHubCached(keyB, fetcherB);

    invalidateFinanceHubCache('acad-a');

    expect(peekFinanceHubCache(keyA)).toBeNull();
    expect(peekFinanceHubCache(keyB)).toEqual({ b: 1 });
  });
});
