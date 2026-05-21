import { describe, it, expect } from 'vitest';
import {
  scoreBankItemToTx,
  matchBankItemsToTransactions,
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

  it('auto-match em import batch', () => {
    const items = [{ date: '2026-05-10', amount: 100, direction: 'credit', description: 'Pix' }];
    const results = matchBankItemsToTransactions(items, [tx]);
    expect(results[0].status).toBe('matched');
    expect(results[0].matched_tx_id).toBe('tx1');
  });
});
