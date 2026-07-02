import { describe, it, expect } from 'vitest';
import {
  scoreBankItemToTx,
  matchBankItemsToTransactions,
  bankAccountMatchLevel,
} from '../../lib/server/bankReconciliationMatcher.js';

describe('bankReconciliationMatcher', () => {
  const tx = {
    id: 'tx1',
    status: 'settled',
    type: 'plan',
    direction: 'in',
    gross: 100,
    net: 100,
    settledAt: '2026-05-10',
    reconciled: false,
  };

  it('score 100 para data e valor exatos', () => {
    expect(
      scoreBankItemToTx(
        { date: '2026-05-10', amount: 100, direction: 'credit' },
        tx
      )
    ).toBe(100);
  });

  it('score 85 para ±1 dia', () => {
    expect(
      scoreBankItemToTx(
        { date: '2026-05-11', amount: 100, direction: 'credit' },
        tx
      )
    ).toBe(85);
  });

  it('sugere match sem conciliar automaticamente', () => {
    const items = [{ date: '2026-05-10', amount: 100, direction: 'credit', description: 'Pix' }];
    const results = matchBankItemsToTransactions(items, [tx]);
    expect(results[0].status).toBe('unmatched');
    expect(results[0].suggested_tx_id).toBe('tx1');
    expect(results[0].match_score).toBe(100);
  });

  it('rejeita conta bancária diferente', () => {
    expect(
      scoreBankItemToTx(
        { date: '2026-05-10', amount: 100, direction: 'credit', bank_account: 'Nubank · 1' },
        { ...tx, bankAccount: 'Sicoob · 1' }
      )
    ).toBe(0);
    expect(bankAccountMatchLevel('Nubank · 1', 'Sicoob · 1')).toBe('mismatch');
  });

  it('limita score quando extrato tem conta e tx não', () => {
    expect(
      scoreBankItemToTx(
        { date: '2026-05-10', amount: 100, direction: 'credit', bank_account: 'Sicoob · 1' },
        tx
      )
    ).toBe(50);
  });

  it('ignora lançamento accrual (CMV) mesmo com valor e data iguais', () => {
    const cmvTx = {
      id: 'tx-cmv',
      status: 'settled',
      type: 'stock_purchase',
      direction: 'out',
      gross: 100,
      net: -100,
      settledAt: '2026-05-10',
      reconciled: false,
      origin_type: 'sale_cmv',
      ledger_regime: 'accrual',
    };
    expect(
      scoreBankItemToTx({ date: '2026-05-10', amount: 100, direction: 'debit' }, cmvTx)
    ).toBe(0);
    const results = matchBankItemsToTransactions(
      [{ date: '2026-05-10', amount: 100, direction: 'credit', description: 'Pix' }],
      [cmvTx, tx]
    );
    expect(results[0].suggested_tx_id).toBe('tx1');
    expect(results[0].suggested_tx_id).not.toBe('tx-cmv');
  });
});
