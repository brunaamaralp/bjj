import { describe, it, expect } from 'vitest';
import {
  buildPayFormForEnrollment,
  enrollmentPlanPricing,
  referenceMonthFromEnrollmentDate,
} from '../lib/enrollmentPayment.js';

describe('enrollmentPayment', () => {
  const financeConfig = {
    plans: [{ name: 'Mensal', price: 150 }],
    paymentMethods: [{ value: 'pix', label: 'Pix', active: true }],
  };

  it('referenceMonthFromEnrollmentDate derives YYYY-MM', () => {
    expect(referenceMonthFromEnrollmentDate('2026-06-23')).toBe('2026-06');
  });

  it('enrollmentPlanPricing returns gross, discount and final price', () => {
    expect(
      enrollmentPlanPricing(financeConfig, 'Mensal', {
        discount_amount: 30,
      })
    ).toMatchObject({
      planPrice: 150,
      discountAmount: 30,
      finalPrice: 120,
    });
  });

  it('buildPayFormForEnrollment pre-fills liquid amount with student discount', () => {
    const form = buildPayFormForEnrollment(
      { discount_amount: 30, preferred_payment_method: 'pix' },
      financeConfig,
      '2026-06-23',
      'Mensal'
    );
    expect(form.reference_month).toBe('2026-06');
    expect(form.amount).toBe('120,00');
  });
});
