import { describe, expect, it } from 'vitest';
import { suggestPendingPaymentsForBankItem } from '../../../lib/server/bankReconPendingPaymentHints.js';

describe('bankReconPendingPaymentHints', () => {
  const statementPeriod = { period_start: '2026-06-01', period_end: '2026-06-30' };

  it('ignora débito e linhas já conciliadas', () => {
    expect(
      suggestPendingPaymentsForBankItem(
        { direction: 'debit', amount: 200, date: '2026-06-10', status: 'unmatched' },
        statementPeriod,
        { paymentsByMonth: new Map([['2026-06', [{ $id: 'p1', lead_id: 'l1', expected_amount: 200, status: 'pending' }]]]) }
      )
    ).toEqual([]);
    expect(
      suggestPendingPaymentsForBankItem(
        { direction: 'credit', amount: 200, date: '2026-06-10', status: 'matched' },
        statementPeriod,
        { paymentsByMonth: new Map() }
      )
    ).toEqual([]);
  });

  it('filtra por valor ±0,02 e ranqueia por nome no extrato', () => {
    const paymentsByMonth = new Map([
      [
        '2026-06',
        [
          { $id: 'pay-a', lead_id: 'lead-a', expected_amount: 200, status: 'pending', plan_name: 'Plano A' },
          { $id: 'pay-b', lead_id: 'lead-b', expected_amount: 200, status: 'awaiting', plan_name: 'Plano B' },
          { $id: 'pay-c', lead_id: 'lead-c', expected_amount: 199.99, status: 'pending', plan_name: 'Plano C' },
        ],
      ],
    ]);
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
      ['lead-b', { lead_id: 'lead-b', lead_name: 'Pedro B', responsavel: '', payer_aliases: [] }],
    ]);

    const hints = suggestPendingPaymentsForBankItem(
      {
        direction: 'credit',
        amount: 200,
        date: '2026-06-12',
        description: 'PIX JOSE SANTOS',
        status: 'unmatched',
      },
      statementPeriod,
      { paymentsByMonth, payerContextByLeadId }
    );

    expect(hints).toHaveLength(3);
    expect(hints[0].lead_id).toBe('lead-a');
    expect(hints[0].payment_id).toBe('pay-a');
    expect(hints[1].lead_id).toBe('lead-b');
    expect(hints.some((h) => h.lead_id === 'lead-c')).toBe(true);
  });
});
