import { describe, it, expect } from 'vitest';
import { paymentNeedsMirrorRepair } from '../../lib/server/studentPaymentReconcileCore.js';

describe('studentPaymentReconcileCore', () => {
  it('paymentNeedsMirrorRepair when paid without tx id', async () => {
    const needs = await paymentNeedsMirrorRepair({
      status: 'paid',
      payment_category: 'plan',
      financial_tx_id: '',
    });
    expect(needs).toBe(true);
  });

  it('pending without tx id does not need mirror repair', async () => {
    const needs = await paymentNeedsMirrorRepair({
      status: 'pending',
      payment_category: 'plan',
      financial_tx_id: '',
      expected_amount: 200,
    });
    expect(needs).toBe(false);
  });

  it('includes fee paid without tx id', async () => {
    const needs = await paymentNeedsMirrorRepair({
      status: 'paid',
      payment_category: 'fee',
      financial_tx_id: '',
    });
    expect(needs).toBe(true);
  });

  it('skips covered bundle child', async () => {
    const needs = await paymentNeedsMirrorRepair({
      status: 'covered',
      payment_category: 'bundle',
      financial_tx_id: '',
    });
    expect(needs).toBe(false);
  });
});
