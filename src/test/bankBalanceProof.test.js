import { describe, it, expect } from 'vitest';
import { computeBankBalanceProof } from '../../lib/server/bankBalanceProof.js';

describe('bankBalanceProof', () => {
  it('computes statement net and balance gap', () => {
    const proof = computeBankBalanceProof({
      statement: { total_credit: 500, total_debit: 200, bank_account: 'Sicoob · 1' },
      items: [
        { amount: 300, direction: 'credit', status: 'matched' },
        { amount: 100, direction: 'debit', status: 'unmatched' },
      ],
      naviUnmatched: [
        { gross: 50, net: 50, type: 'plan', direction: 'in', bankAccount: 'Sicoob · 1' },
      ],
    });
    expect(proof.statement_net).toBe(300);
    expect(proof.reconciled_net).toBe(300);
    expect(proof.pending_statement).toBe(-100);
    expect(proof.orphan_navi_net).toBe(50);
    expect(proof.balance_gap).toBe(100);
  });

  it('filters orphan tx by bank account', () => {
    const proof = computeBankBalanceProof({
      statement: { total_credit: 100, total_debit: 0, bank_account: 'Nubank · 1' },
      items: [],
      naviUnmatched: [
        { gross: 80, net: 80, type: 'plan', bankAccount: 'Sicoob · 1' },
        { gross: 20, net: 20, type: 'plan', bankAccount: 'Nubank · 1' },
      ],
    });
    expect(proof.orphan_navi_net).toBe(20);
  });
});
