import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PRODUCT_DISCOUNT_PCT,
  normalizeProfessorCompensation,
  resolveStaffRates,
  computeProductDebitAmount,
} from '../../lib/professorCompensation.js';

describe('professorCompensation', () => {
  it('defaults product discount to 30', () => {
    const cfg = normalizeProfessorCompensation({});
    expect(cfg.product_discount_pct).toBe(DEFAULT_PRODUCT_DISCOUNT_PCT);
    expect(DEFAULT_PRODUCT_DISCOUNT_PCT).toBe(30);
  });

  it('resolveStaffRates uses override over role', () => {
    const cfg = normalizeProfessorCompensation({
      roles: {
        professor: { lesson_amount: 50, experimental_amount: 30 },
        instructor: { lesson_amount: 40, experimental_amount: 20 },
      },
      overrides: {
        'roster:abc': { lesson_amount: 60 },
      },
    });
    expect(resolveStaffRates(cfg, 'roster:abc', 'professor')).toEqual({
      lesson_amount: 60,
      experimental_amount: 30,
    });
    expect(resolveStaffRates(cfg, 'roster:xyz', 'instructor').lesson_amount).toBe(40);
  });

  it('computeProductDebitAmount applies discount on sale price', () => {
    expect(computeProductDebitAmount({ unitPrice: 100, qty: 2, discountPct: 30 })).toBe(140);
  });
});
