import { describe, it, expect } from 'vitest';
import {
  buildPaymentReceiptText,
  isPaymentReceiptEligible,
  formatPaymentIdShort,
  paymentCategoryLabel,
} from '../../lib/receipts/paymentReceiptText.js';
import { PAYMENT_CATEGORY } from '../lib/paymentCategories.js';

describe('paymentReceiptText', () => {
  const basePayment = {
    $id: 'pay1234567890',
    status: 'paid',
    amount: 150,
    paid_amount: 150,
    method: 'pix',
    plan_name: 'Mensal',
    reference_month: '2026-05',
    paid_at: '2026-05-18T14:30:00.000Z',
    registered_by_name: 'Recepção',
    payment_category: PAYMENT_CATEGORY.PLAN,
  };

  it('formatPaymentIdShort uses last 4 chars', () => {
    expect(formatPaymentIdShort('pay1234567890')).toBe('#7890');
  });

  it('isPaymentReceiptEligible accepts paid with amount', () => {
    expect(isPaymentReceiptEligible(basePayment).ok).toBe(true);
  });

  it('rejects pending and covered', () => {
    expect(isPaymentReceiptEligible({ ...basePayment, status: 'pending' }).ok).toBe(false);
    expect(isPaymentReceiptEligible({ ...basePayment, status: 'covered' }).ok).toBe(false);
  });

  it('buildPaymentReceiptText substitutes placeholders', () => {
    const text = buildPaymentReceiptText({
      footer: 'Obrigado!',
      academyName: 'Academia Teste',
      studentName: 'João Silva',
      payment: basePayment,
    });
    expect(text).toContain('Academia Teste');
    expect(text).toContain('João Silva');
    expect(text).toContain('#7890');
    expect(text).toContain('Mensalidade');
    expect(text).toContain('R$');
    expect(text).toContain('Obrigado!');
  });

  it('includes bundle coverage months', () => {
    const anchor = {
      ...basePayment,
      payment_category: PAYMENT_CATEGORY.BUNDLE,
      bundle_months: 3,
      reference_month: '2026-05',
      bundle_origin_id: 'pay1234567890',
    };
    const text = buildPaymentReceiptText({
      academyName: 'A',
      studentName: 'B',
      payment: anchor,
      bundlePayments: [
        { reference_month: '2026-05' },
        { reference_month: '2026-06' },
        { reference_month: '2026-07' },
      ],
    });
    expect(text).toContain('Meses cobertos');
    expect(paymentCategoryLabel(PAYMENT_CATEGORY.BUNDLE)).toBe('Plano (pacote)');
  });

  it('throws when not eligible', () => {
    expect(() =>
      buildPaymentReceiptText({
        academyName: 'A',
        studentName: 'B',
        payment: { ...basePayment, status: 'cancelled' },
      })
    ).toThrow();
  });
});
