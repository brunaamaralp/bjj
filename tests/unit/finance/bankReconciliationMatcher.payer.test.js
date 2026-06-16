import { describe, expect, it } from 'vitest';
import {
  matchBankItemsToTransactions,
  partitionMatchResults,
  BANK_MATCH_SUGGEST_SCORE,
} from '../../../lib/server/bankReconciliationMatcher.js';

const baseItem = {
  date: '2026-06-10',
  amount: 200,
  direction: 'credit',
  description: 'PIX JOSE SANTOS',
  bank_account: 'Sicoob',
};

function tx(id, leadId, leadName) {
  return {
    id,
    lead_id: leadId,
    lead_name: leadName,
    gross: 200,
    direction: 'in',
    settledAt: '2026-06-10',
    bank_account: 'Sicoob',
    status: 'settled',
    reconciled: false,
  };
}

describe('bankReconciliationMatcher payer bonus', () => {
  const payerContextByLeadId = new Map([
    [
      'lead-a',
      {
        lead_id: 'lead-a',
        lead_name: 'Pedro A',
        responsavel: '',
        payer_aliases: [{ display: 'Jose Santos', normalized: 'JOSE SANTOS', source: 'learned' }],
      },
    ],
    [
      'lead-b',
      {
        lead_id: 'lead-b',
        lead_name: 'Pedro B',
        responsavel: '',
        payer_aliases: [],
      },
    ],
  ]);

  it('alias desempata dois lançamentos com mesmo valor e data', () => {
    const items = [baseItem];
    const transactions = [tx('tx-a', 'lead-a', 'Pedro A'), tx('tx-b', 'lead-b', 'Pedro B')];
    const results = matchBankItemsToTransactions(items, transactions, { payerContextByLeadId });
    const { suggested } = partitionMatchResults(results);
    expect(suggested).toHaveLength(1);
    expect(suggested[0].suggested_tx_id).toBe('tx-a');
    expect(suggested[0].match_tier).toBe('amount_date_name');
  });

  it('empate sem bônus de nome gera candidatos', () => {
    const items = [{ ...baseItem, description: 'CREDITO' }];
    const transactions = [tx('tx-a', 'lead-a', 'Pedro A'), tx('tx-b', 'lead-b', 'Pedro B')];
    const results = matchBankItemsToTransactions(items, transactions, { payerContextByLeadId });
    expect(results).toHaveLength(1);
    expect(results[0].suggested_tx_id).toBeNull();
    expect(results[0].suggested_tx_candidates?.length).toBeGreaterThanOrEqual(2);
  });

  it('débito não aplica bônus de nome', () => {
    const items = [{ ...baseItem, direction: 'debit', description: 'PIX JOSE SANTOS' }];
    const transactions = [tx('tx-a', 'lead-a', 'Pedro A')];
    transactions[0].direction = 'out';
    transactions[0].gross = 200;
    const results = matchBankItemsToTransactions(items, transactions, {
      payerContextByLeadId,
    });
    const { suggested, unmatched } = partitionMatchResults(results);
    const row = suggested[0] || unmatched[0];
    expect(row?.match_score).toBeGreaterThanOrEqual(0);
    if (row?.match_score >= BANK_MATCH_SUGGEST_SCORE) {
      expect(row.match_tier).not.toBe('amount_date_name');
    }
  });
});
