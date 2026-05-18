import { describe, it, expect } from 'vitest';
import {
  normalizePaymentCategory,
  isMensalidadesGridPayment,
  shouldUpsertByReferenceMonth,
  enumerateCoverageMonths,
  isBundleAnchorPayment,
  isBundleChildPayment,
} from '../lib/paymentCategories.js';

describe('paymentCategories', () => {
  it('registros sem categoria contam como plan', () => {
    expect(normalizePaymentCategory(null)).toBe('plan');
    expect(normalizePaymentCategory({})).toBe('plan');
  });

  it('isMensalidadesGridPayment inclui plan e bundle', () => {
    expect(isMensalidadesGridPayment({ payment_category: 'plan' })).toBe(true);
    expect(isMensalidadesGridPayment({ payment_category: 'bundle' })).toBe(true);
    expect(isMensalidadesGridPayment({ payment_category: 'fee' })).toBe(false);
    expect(isMensalidadesGridPayment({ payment_category: 'other' })).toBe(false);
  });

  it('shouldUpsertByReferenceMonth só plan e bundle', () => {
    expect(shouldUpsertByReferenceMonth('plan')).toBe(true);
    expect(shouldUpsertByReferenceMonth('bundle')).toBe(true);
    expect(shouldUpsertByReferenceMonth('fee')).toBe(false);
  });

  it('enumerateCoverageMonths gera N meses', () => {
    expect(enumerateCoverageMonths('2026-01', 3)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(enumerateCoverageMonths('2026-11', 3)).toEqual(['2026-11', '2026-12', '2027-01']);
  });

  it('bundle anchor vs child', () => {
    const anchor = { $id: 'a1', payment_category: 'bundle', bundle_origin_id: 'a1' };
    const child = { $id: 'c1', payment_category: 'bundle', bundle_origin_id: 'a1' };
    expect(isBundleAnchorPayment(anchor)).toBe(true);
    expect(isBundleChildPayment(child)).toBe(true);
  });
});
