import { describe, it, expect } from 'vitest';
import {
  validateTxForBankReconciliation,
  amountsReconcileEqual,
  amountsReconcileWithinPercent,
  bankItemDirectionMatchesTx,
  bankItemAmountMatchesTx,
  reconciliationNoteWithJustification,
} from '../../lib/server/bankReconciliationValidation.js';
import { FINANCE_BANK_NOTE_PREFIX, FINANCE_CAT_NOTE_PREFIX } from '../../lib/server/financeTxFields.js';

describe('bankReconciliationValidation', () => {
  const academyId = 'acad-1';
  const settledTx = {
    academyId,
    status: 'settled',
    type: 'plan',
    gross: 100,
    net: 100,
    reconciled: false,
  };

  it('rejects tx from another academy', () => {
    const result = validateTxForBankReconciliation(
      { ...settledTx, academyId: 'other' },
      { academyId, item: { amount: 100, direction: 'credit' } }
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe('forbidden');
  });

  it('rejects non-settled tx', () => {
    const result = validateTxForBankReconciliation(
      { ...settledTx, status: 'pending' },
      { academyId, item: { amount: 100, direction: 'credit' } }
    );
    expect(result.error).toBe('tx_not_settled');
  });

  it('rejects amount mismatch beyond matcher tolerance', () => {
    const result = validateTxForBankReconciliation(settledTx, {
      academyId,
      item: { amount: 50, direction: 'credit' },
    });
    expect(result.error).toBe('amount_mismatch');
  });

  it('accepts amount within matcher percent tolerance', () => {
    expect(
      validateTxForBankReconciliation(
        { ...settledTx, gross: 100, net: 97 },
        { academyId, item: { amount: 97, direction: 'credit' } }
      ).ok
    ).toBe(true);
    expect(
      bankItemAmountMatchesTx({ amount: 97 }, { gross: 100, net: 96.5 })
    ).toBe(true);
  });

  it('accepts matching item', () => {
    const result = validateTxForBankReconciliation(settledTx, {
      academyId,
      item: { amount: 100, direction: 'credit' },
    });
    expect(result.ok).toBe(true);
  });

  it('amountsReconcileEqual within tolerance', () => {
    expect(amountsReconcileEqual(100, 100.01)).toBe(true);
    expect(amountsReconcileEqual(100, 102)).toBe(false);
  });

  it('amountsReconcileWithinPercent matches matcher band', () => {
    expect(amountsReconcileWithinPercent(100, 97)).toBe(true);
    expect(amountsReconcileWithinPercent(100, 96)).toBe(true);
    expect(amountsReconcileWithinPercent(100, 94)).toBe(false);
  });

  it('direction and amount helpers', () => {
    expect(bankItemDirectionMatchesTx({ direction: 'credit' }, settledTx)).toBe(true);
    expect(bankItemDirectionMatchesTx({ direction: 'debit' }, settledTx)).toBe(false);
    expect(bankItemAmountMatchesTx({ amount: 100 }, settledTx)).toBe(true);
  });

  it('preserves category and bank in manual note', () => {
    const prevDoc = {
      note: `${FINANCE_CAT_NOTE_PREFIX}Mensalidade\n${FINANCE_BANK_NOTE_PREFIX}Sicoob · 1\nObs original`,
      type: 'plan',
    };
    const merged = reconciliationNoteWithJustification(prevDoc, 'Conciliado manualmente');
    expect(merged).toContain(`${FINANCE_CAT_NOTE_PREFIX}Mensalidade`);
    expect(merged).toContain(`${FINANCE_BANK_NOTE_PREFIX}Sicoob · 1`);
    expect(merged).toContain('Obs original');
    expect(merged).toContain('Conciliado manualmente');
  });
});
