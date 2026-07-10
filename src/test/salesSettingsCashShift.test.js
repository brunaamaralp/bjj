import { describe, it, expect } from 'vitest';
import { readSalesSettings, normalizeSaleSource } from '../../src/lib/salesSettings.js';

describe('salesSettings cash shift by source', () => {
  it('normalizeSaleSource defaults unknown to pdv', () => {
    expect(normalizeSaleSource('')).toBe('pdv');
    expect(normalizeSaleSource('modal')).toBe('modal');
    expect(normalizeSaleSource('INVALID')).toBe('pdv');
  });

  it('cashShiftRequiredFor defaults to pdv only', () => {
    const s = readSalesSettings(JSON.stringify({ sales: { requireCashShift: true } }));
    expect(s.cashShiftRequiredFor).toEqual(['pdv']);
  });

  it('respects custom cashShiftRequiredFor list', () => {
    const s = readSalesSettings(
      JSON.stringify({
        sales: {
          requireCashShift: true,
          cashShiftRequiredFor: ['pdv', 'nl'],
        },
      })
    );
    expect(s.cashShiftRequiredFor).toEqual(['pdv', 'nl']);
  });
});
