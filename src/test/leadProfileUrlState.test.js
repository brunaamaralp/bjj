import { describe, expect, it } from 'vitest';
import {
  leadHistoryFilterFromUrlParam,
  leadHistoryFilterToUrlParam,
} from '../lib/leadProfileUrlState.js';

describe('leadProfileUrlState', () => {
  it('returns all for empty or all param', () => {
    expect(leadHistoryFilterFromUrlParam('')).toBe('all');
    expect(leadHistoryFilterFromUrlParam('all')).toBe('all');
    expect(leadHistoryFilterToUrlParam('all')).toBeNull();
  });

  it('round-trips supported filters', () => {
    expect(leadHistoryFilterToUrlParam('note')).toBe('note');
    expect(leadHistoryFilterFromUrlParam('note')).toBe('note');
    expect(leadHistoryFilterFromUrlParam('message')).toBe('message');
    expect(leadHistoryFilterFromUrlParam('schedule')).toBe('schedule');
    expect(leadHistoryFilterFromUrlParam('stage_change')).toBe('stage_change');
    expect(leadHistoryFilterToUrlParam('conversation')).toBe('conversation');
    expect(leadHistoryFilterFromUrlParam('conversation')).toBe('conversation');
  });

  it('falls back to all for unknown filter', () => {
    expect(leadHistoryFilterFromUrlParam('invalid')).toBe('all');
    expect(leadHistoryFilterToUrlParam('invalid')).toBeNull();
  });
});
