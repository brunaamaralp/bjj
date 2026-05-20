import { describe, it, expect } from 'vitest';
import { paymentDuplicateDateKey } from '../../lib/server/studentPaymentsHandler.js';

describe('paymentDuplicateDateKey', () => {
  it('uses paid_at day first', () => {
    expect(paymentDuplicateDateKey({ paid_at: '2026-04-15T14:00:00.000Z' })).toBe('2026-04-15');
  });

  it('falls back to due_date', () => {
    expect(paymentDuplicateDateKey({ due_date: '2026-05-01T00:00:00.000Z' })).toBe('2026-05-01');
  });

  it('falls back to reference_month first day', () => {
    expect(paymentDuplicateDateKey({ reference_month: '2026-03' })).toBe('2026-03-01');
  });
});
