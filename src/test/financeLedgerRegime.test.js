import { describe, expect, it } from 'vitest';
import {
  FINANCE_LEDGER_REGIME,
  classifyLedgerRegimeForMigration,
  inferLedgerRegimeFromDoc,
  isAccrualLedgerTx,
  isCashLedgerTx,
  txEligibleForBankReconciliation,
} from '../lib/financeLedgerRegime.js';

describe('financeLedgerRegime', () => {
  it('defaults missing field to cash', () => {
    expect(inferLedgerRegimeFromDoc({})).toBe(FINANCE_LEDGER_REGIME.CASH);
    expect(isCashLedgerTx({ type: 'plan', status: 'settled' })).toBe(true);
  });

  it('sale_cmv infers accrual for legacy docs', () => {
    const doc = { origin_type: 'sale_cmv', type: 'stock_purchase', gross: 50 };
    expect(inferLedgerRegimeFromDoc(doc)).toBe(FINANCE_LEDGER_REGIME.ACCRUAL);
    expect(isAccrualLedgerTx(doc)).toBe(true);
    expect(txEligibleForBankReconciliation(doc)).toBe(false);
  });

  it('explicit ledger_regime accrual', () => {
    expect(inferLedgerRegimeFromDoc({ ledger_regime: 'accrual' })).toBe(FINANCE_LEDGER_REGIME.ACCRUAL);
  });

  it('stock_entry purchase stays cash', () => {
    const doc = {
      origin_type: 'stock_entry',
      type: 'stock_purchase',
      category: 'Custo de estoque',
    };
    expect(classifyLedgerRegimeForMigration(doc)).toBe(FINANCE_LEDGER_REGIME.CASH);
  });

  it('migration classifies sale_cmv as accrual', () => {
    expect(
      classifyLedgerRegimeForMigration({ origin_type: 'sale_cmv', ledger_regime: '' })
    ).toBe(FINANCE_LEDGER_REGIME.ACCRUAL);
  });

  it('CMV legado sem origin_type infere accrual (method interno + stock_purchase)', () => {
    const doc = {
      type: 'stock_purchase',
      method: 'interno',
      planName: 'CMV — Kimono infantil',
      gross: 80,
    };
    expect(inferLedgerRegimeFromDoc(doc)).toBe(FINANCE_LEDGER_REGIME.ACCRUAL);
    expect(isAccrualLedgerTx(doc)).toBe(true);
  });
});
