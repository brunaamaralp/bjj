import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getInboxListStatsCached,
  setInboxListStatsCached,
  invalidateInboxListStatsCache,
  inboxListStatsCacheKey,
} from '../../lib/server/inboxListStatsCache.js';

describe('inboxListStatsCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invalidateInboxListStatsCache('acad-1');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and returns cached stats', () => {
    const stats = { unread_conversations: 3, needs_me: 1, resolved: 0, transferred: 0 };
    setInboxListStatsCached('acad-1', false, stats);
    expect(getInboxListStatsCached('acad-1', false)).toEqual(stats);
  });

  it('expires cache after TTL', () => {
    setInboxListStatsCached('acad-1', false, { unread_conversations: 1 });
    vi.advanceTimersByTime(61_000);
    expect(getInboxListStatsCached('acad-1', false)).toBeNull();
  });

  it('uses distinct keys for archived vs active', () => {
    expect(inboxListStatsCacheKey('a', false)).not.toBe(inboxListStatsCacheKey('a', true));
  });
});
