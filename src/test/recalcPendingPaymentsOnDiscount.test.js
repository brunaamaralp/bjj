import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  didStudentDiscountChange,
  pendingPlanPaymentAmount,
  recalcPendingPaymentsOnDiscountChange,
} from '../lib/recalcPendingPaymentsOnDiscount.js';

const listDocuments = vi.fn();
const updatePayment = vi.fn();

vi.mock('../lib/appwrite.js', () => ({
  databases: { listDocuments: (...args) => listDocuments(...args) },
  DB_ID: 'db',
}));

vi.mock('../lib/studentPayments.js', () => ({
  updatePayment: (...args) => updatePayment(...args),
}));

describe('recalcPendingPaymentsOnDiscount', () => {
  const financeConfig = { plans: [{ name: 'Mensal', price: 200 }] };

  beforeEach(() => {
    listDocuments.mockReset();
    updatePayment.mockReset();
    updatePayment.mockResolvedValue({});
  });

  it('didStudentDiscountChange detects type and amount changes', () => {
    expect(
      didStudentDiscountChange(
        { discount_type: 'fixed', discount_amount: 30 },
        { discount_type: 'fixed', discount_amount: 40 }
      )
    ).toBe(true);
    expect(
      didStudentDiscountChange(
        { discount_type: 'fixed', discount_amount: 30 },
        { discount_type: 'percent', discount_amount: 30 }
      )
    ).toBe(true);
    expect(
      didStudentDiscountChange(
        { discount_type: 'fixed', discount_amount: 30 },
        { discount_type: 'fixed', discount_amount: 30 }
      )
    ).toBe(false);
  });

  it('pendingPlanPaymentAmount uses calcFinalPrice with discount', () => {
    expect(
      pendingPlanPaymentAmount(
        { plan: 'Mensal', discount_type: 'fixed', discount_amount: 30 },
        financeConfig
      )
    ).toBe(170);
    expect(
      pendingPlanPaymentAmount(
        { plan: 'Mensal', discount_type: 'percent', discount_amount: 10 },
        financeConfig
      )
    ).toBe(180);
  });

  it('skips when discount unchanged', async () => {
    const student = { plan: 'Mensal', discount_type: 'fixed', discount_amount: 30 };
    const result = await recalcPendingPaymentsOnDiscountChange({
      studentId: 's1',
      academyId: 'ac1',
      student,
      financeConfig,
      previousStudent: student,
    });
    expect(result.skipped).toBe(true);
    expect(listDocuments).not.toHaveBeenCalled();
  });

  it('does nothing when there are no pending payments', async () => {
    listDocuments.mockResolvedValueOnce({ documents: [] });

    const result = await recalcPendingPaymentsOnDiscountChange({
      studentId: 's1',
      academyId: 'ac1',
      student: { plan: 'Mensal', discount_type: 'fixed', discount_amount: 50 },
      financeConfig,
      previousStudent: { plan: 'Mensal', discount_type: 'fixed', discount_amount: 30 },
    });

    expect(result.updated).toBe(0);
    expect(updatePayment).not.toHaveBeenCalled();
  });

  it('updates pending plan payments with new discounted amount', async () => {
    listDocuments.mockResolvedValueOnce({
      documents: [
        {
          $id: 'p1',
          status: 'pending',
          payment_category: 'plan',
          amount: 170,
          reference_month: '2026-07',
          method: 'pix',
        },
        {
          $id: 'p2',
          status: 'pending',
          payment_category: 'fee',
          amount: 50,
          reference_month: '2026-07',
        },
      ],
    });

    const result = await recalcPendingPaymentsOnDiscountChange({
      studentId: 's1',
      academyId: 'ac1',
      student: { plan: 'Mensal', discount_type: 'fixed', discount_amount: 50 },
      financeConfig,
      previousStudent: { plan: 'Mensal', discount_type: 'fixed', discount_amount: 30 },
    });

    expect(result.updated).toBe(1);
    expect(updatePayment).toHaveBeenCalledTimes(1);
    expect(updatePayment).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        amount: 150,
        expected_amount: 150,
        status: 'pending',
      })
    );
  });

  it('does not throw when a payment update fails', async () => {
    listDocuments.mockResolvedValueOnce({
      documents: [
        {
          $id: 'p1',
          status: 'pending',
          payment_category: 'plan',
          amount: 170,
          reference_month: '2026-07',
        },
      ],
    });
    updatePayment.mockRejectedValueOnce(new Error('patch failed'));

    const result = await recalcPendingPaymentsOnDiscountChange({
      studentId: 's1',
      academyId: 'ac1',
      student: { plan: 'Mensal', discount_type: 'fixed', discount_amount: 50 },
      financeConfig,
      previousStudent: { plan: 'Mensal', discount_type: 'fixed', discount_amount: 30 },
    });

    expect(result.updated).toBe(0);
  });
});
