import { describe, expect, it } from 'vitest';
import { monthEndYmd, formatBalanceDelta } from './financeiroOverview.js';

describe('monthEndYmd', () => {
  it('returns last day of month', () => {
    expect(monthEndYmd('2026-02')).toBe('2026-02-28');
    expect(monthEndYmd('2024-02')).toBe('2024-02-29');
    expect(monthEndYmd('2026-06')).toBe('2026-06-30');
  });
});

describe('formatBalanceDelta', () => {
  it('computes pct change for bank total comparison', () => {
    expect(formatBalanceDelta(1100, 1000)).toEqual({ type: 'pct', pct: 10 });
    expect(formatBalanceDelta(900, 1000)).toEqual({ type: 'pct', pct: -10 });
  });
});
