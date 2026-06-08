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

  it('skips pending payments', async () => {
    const needs = await paymentNeedsMirrorRepair({
      status: 'pending',
      payment_category: 'plan',
      financial_tx_id: '',
    });
    expect(needs).toBe(false);
  });
});
