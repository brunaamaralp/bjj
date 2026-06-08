import { describe, expect, it } from 'vitest';
import { inboxFilterFromUrlParam, inboxFilterToUrlParam } from '../lib/inboxUrlState.js';

describe('inboxUrlState', () => {
  it('maps legacy pending alias to need_human', () => {
    expect(inboxFilterFromUrlParam('pending')).toBe('need_human');
  });

  it('returns null for all or empty filter', () => {
    expect(inboxFilterFromUrlParam('all')).toBeNull();
    expect(inboxFilterFromUrlParam('')).toBeNull();
    expect(inboxFilterToUrlParam('all')).toBeNull();
  });

  it('round-trips supported filters', () => {
    expect(inboxFilterToUrlParam('needs_me')).toBe('needs_me');
    expect(inboxFilterFromUrlParam('archived')).toBe('archived');
  });
});
