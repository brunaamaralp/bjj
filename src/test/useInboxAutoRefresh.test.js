import { describe, it, expect } from 'vitest';
import { getInboxAutoRefreshIntervals } from '../hooks/useInboxAutoRefresh.js';

describe('getInboxAutoRefreshIntervals', () => {
  it('sem realtime — aba ativa', () => {
    expect(getInboxAutoRefreshIntervals(false, false)).toEqual({
      listMs: 30_000,
      threadMs: 45_000,
    });
  });

  it('sem realtime — aba oculta', () => {
    expect(getInboxAutoRefreshIntervals(false, true)).toEqual({
      listMs: 90_000,
      threadMs: 90_000,
    });
  });

  it('com realtime — aba ativa', () => {
    expect(getInboxAutoRefreshIntervals(true, false)).toEqual({
      listMs: 90_000,
      threadMs: 60_000,
    });
  });

  it('com realtime — aba oculta', () => {
    expect(getInboxAutoRefreshIntervals(true, true)).toEqual({
      listMs: 120_000,
      threadMs: 120_000,
    });
  });
});
