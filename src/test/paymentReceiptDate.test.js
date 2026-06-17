import { describe, it, expect } from 'vitest';
import {
  coverageMonthForPaymentForm,
  suggestPaidAtYmd,
  paidAtMonthDivergesFromCoverage,
  paidAtCoverageDivergenceMessage,
} from '../lib/paymentReceiptDate.js';

describe('paymentReceiptDate', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');

  it('suggestPaidAtYmd usa hoje quando cobertura = mês atual', () => {
    expect(suggestPaidAtYmd({ coverageMonth: '2026-06', now })).toBe('2026-06-15');
  });

  it('suggestPaidAtYmd usa dia 1 para cobertura em mês passado', () => {
    expect(suggestPaidAtYmd({ coverageMonth: '2026-03', now })).toBe('2026-03-01');
  });

  it('coverageMonthForPaymentForm — bundle usa bundle_start_month', () => {
    expect(
      coverageMonthForPaymentForm({
        payment_type: 'bundle',
        bundle_start_month: '2026-03',
        reference_month: '2026-06',
      })
    ).toBe('2026-03');
  });

  it('coverageMonthForPaymentForm — plan usa reference_month ou override', () => {
    expect(
      coverageMonthForPaymentForm({ payment_type: 'plan', reference_month: '2026-04' })
    ).toBe('2026-04');
    expect(
      coverageMonthForPaymentForm(
        { payment_type: 'plan', reference_month: '2026-04' },
        { referenceMonth: '2026-05' }
      )
    ).toBe('2026-05');
  });

  it('detecta divergência entre cobertura março e recebimento junho', () => {
    const payForm = {
      payment_type: 'bundle',
      bundle_start_month: '2026-03',
      paid_at: '2026-06-10',
      status: 'paid',
    };
    expect(paidAtMonthDivergesFromCoverage(payForm)).toBe(true);
    expect(paidAtCoverageDivergenceMessage(payForm)).toMatch(/mar/i);
    expect(paidAtCoverageDivergenceMessage(payForm)).toMatch(/jun/i);
  });

  it('não diverge quando paid_at está no mesmo mês da cobertura', () => {
    const payForm = {
      payment_type: 'bundle',
      bundle_start_month: '2026-03',
      paid_at: '2026-03-05',
      status: 'paid',
    };
    expect(paidAtMonthDivergesFromCoverage(payForm)).toBe(false);
  });

  it('ignora pendente e taxas avulsas', () => {
    expect(
      paidAtMonthDivergesFromCoverage({
        payment_type: 'plan',
        reference_month: '2026-03',
        paid_at: '2026-06-01',
        status: 'pending',
      })
    ).toBe(false);
    expect(
      paidAtMonthDivergesFromCoverage({
        payment_type: 'fee',
        paid_at: '2026-06-01',
        status: 'paid',
      })
    ).toBe(false);
  });
});
