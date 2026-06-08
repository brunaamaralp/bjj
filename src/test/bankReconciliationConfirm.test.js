import { describe, it, expect } from 'vitest';
import {
  validateTxForBankReconciliation,
  amountsReconcileEqual,
} from '../../lib/server/bankReconciliationValidation.js';

describe('bank reconciliation confirm validation', () => {
  const settledTx = {
    academyId: 'a1',
    status: 'settled',
    gross: 100,
    net: 100,
    type: 'plan',
    reconciled: false,
  };

  it('rejects wrong academy', () => {
    const result = validateTxForBankReconciliation(settledTx, {
      academyId: 'other',
      item: { amount: 100, direction: 'credit' },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('forbidden');
  });

  it('rejects amount mismatch', () => {
    const result = validateTxForBankReconciliation(settledTx, {
      academyId: 'a1',
      item: { amount: 50, direction: 'credit' },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('amount_mismatch');
  });

  it('accepts matching credit item', () => {
    const result = validateTxForBankReconciliation(settledTx, {
      academyId: 'a1',
      item: { amount: 100, direction: 'credit' },
    });
    expect(result.ok).toBe(true);
  });

  it('amountsReconcileEqual respects tolerance', () => {
    expect(amountsReconcileEqual(100, 100.01)).toBe(true);
    expect(amountsReconcileEqual(100, 105)).toBe(false);
  });
});
