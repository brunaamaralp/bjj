import { describe, it, expect } from 'vitest';
import { formatBalanceDelta } from '../lib/financeiroOverview.js';

describe('formatBalanceDelta (total % vs fim do mês anterior)', () => {
  it('returns text when previous total is zero', () => {
    expect(formatBalanceDelta(100, 0)).toEqual({ type: 'text', text: 'Primeiro mês com movimento' });
    expect(formatBalanceDelta(0, 0)).toEqual({ type: 'text', text: 'Sem movimento no período' });
  });

  it('BUG-7: negative previous balance inverts pct sign (misleading vs intuitive delta)', () => {
    const delta = formatBalanceDelta(-50000, -100000);
    expect(delta.type).toBe('pct');
    expect(delta.pct).toBe(-50);
  });

  it('BUG-7b: less negative total can still show negative pct vs negative baseline', () => {
    const delta = formatBalanceDelta(-102384.86, -150000);
    expect(delta.type).toBe('pct');
    expect(delta.pct).toBeCloseTo(-31.7, 1);
  });

  it('uses raw Number() — pt-BR comma strings are not parsed', () => {
    const delta = formatBalanceDelta('1.938,16', '0');
    expect(delta.type).toBe('text');
    expect(delta.text).toBe('Sem movimento no período');
  });
});
