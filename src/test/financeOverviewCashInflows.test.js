import { describe, it, expect } from 'vitest';
import { enrichOverviewPeriodSummary } from '../../lib/server/financeOverviewCashInflows.js';

describe('enrichOverviewPeriodSummary', () => {
  it('soma mensalidades recebidas sem espelho e pendências de pagamento/venda', () => {
    const summary = {
      settledIn: 100,
      settledOut: 40,
      periodBalance: 60,
      pendingIn: 50,
    };
    const txItems = [
      {
        id: 'tx-pending-card',
        status: 'pending',
        type: 'plan',
        gross: 80,
        net: 75,
        origin_type: 'student_payment',
        origin_id: 'pay-1',
      },
      {
        id: 'tx-settled',
        status: 'settled',
        type: 'plan',
        gross: 100,
        net: 100,
        origin_type: 'student_payment',
        origin_id: 'pay-2',
      },
    ];
    const enriched = enrichOverviewPeriodSummary(summary, txItems, {
      payments: [
        {
          $id: 'pay-3',
          status: 'paid',
          paid_amount: 150,
          paid_at: '2026-07-10',
        },
      ],
      sales: [
        {
          $id: 'sale-1',
          status: 'concluida',
          total: 200,
          pagamentos_json: JSON.stringify([{ forma: 'pix', valor: 200 }]),
        },
      ],
    });

    expect(enriched.supplementalInflow).toBe(350);
    expect(enriched.pendingReceivedInflow).toBe(80);
    expect(enriched.settledIn).toBe(530);
    expect(enriched.periodBalance).toBe(490);
  });

  it('não duplica pagamento/venda já espelhados no caixa', () => {
    const enriched = enrichOverviewPeriodSummary(
      { settledIn: 320, settledOut: 0, periodBalance: 320 },
      [
        {
          id: 'tx-1',
          status: 'settled',
          type: 'product',
          gross: 200,
          net: 195,
          origin_type: 'sale',
          origin_id: 'sale-1',
          saleId: 'sale-1',
        },
        {
          id: 'tx-2',
          status: 'settled',
          type: 'plan',
          gross: 120,
          net: 120,
          origin_type: 'student_payment',
          origin_id: 'pay-1',
        },
      ],
      {
        payments: [{ $id: 'pay-1', status: 'paid', paid_amount: 120 }],
        sales: [
          {
            $id: 'sale-1',
            status: 'concluida',
            total: 200,
            pagamentos_json: JSON.stringify([{ forma: 'pix', valor: 200 }]),
          },
        ],
      }
    );

    expect(enriched.supplementalInflow).toBe(0);
    expect(enriched.settledIn).toBe(320);
  });
});
