import { describe, it, expect } from 'vitest';
import {
  aggregatePaymentTotalsFromPaymentDocs,
  aggregateStudentPaymentsTicketMedio,
  isDailyReportEligiblePayment,
  mergePaymentTotals,
  paidAtMatchesReportDay,
  paidAtYmd,
} from '../../lib/server/dailyReportStudentPayments.js';
import {
  buildDailyReportPayload,
  buildDailyReportSummary,
} from '../../lib/server/salesDailyReportBuild.js';
import {
  clearSalesDailyReportDeepLink,
  lojaVendasDailyReportParams,
  resolveSalesDailyReportDeepLink,
} from '../lib/lojaSalesTabs.js';

describe('paidAtYmd', () => {
  it('extrai YYYY-MM-DD de ISO', () => {
    expect(paidAtYmd('2026-07-01T14:00:00.000Z')).toBe('2026-07-01');
    expect(paidAtYmd('2026-07-01')).toBe('2026-07-01');
  });
});

describe('isDailyReportEligiblePayment', () => {
  it('aceita mensalidade paga no dia', () => {
    const doc = {
      payment_category: 'plan',
      status: 'paid',
      amount: 150,
      paid_amount: 150,
      method: 'pix',
      paid_at: '2026-07-01',
    };
    expect(isDailyReportEligiblePayment(doc, '2026-07-01')).toBe(true);
  });

  it('rejeita filho de pacote', () => {
    const doc = {
      payment_category: 'bundle',
      bundle_origin_id: 'anchor1',
      $id: 'child1',
      status: 'paid',
      amount: 100,
      paid_at: '2026-07-01',
    };
    expect(isDailyReportEligiblePayment(doc, '2026-07-01')).toBe(false);
  });

  it('rejeita covered', () => {
    expect(
      isDailyReportEligiblePayment(
        { payment_category: 'plan', status: 'covered', paid_at: '2026-07-01' },
        '2026-07-01'
      )
    ).toBe(false);
  });
});

describe('aggregatePaymentTotalsFromPaymentDocs', () => {
  it('soma por forma de pagamento', () => {
    const totals = aggregatePaymentTotalsFromPaymentDocs([
      { status: 'paid', amount: 100, method: 'pix' },
      { status: 'partial', paid_amount: 50, expected_amount: 200, method: 'dinheiro' },
    ]);
    expect(totals.pix).toBe(100);
    expect(totals.dinheiro).toBe(50);
  });
});

describe('aggregateStudentPaymentsTicketMedio', () => {
  it('calcula ticket médio por recebimento', () => {
    const out = aggregateStudentPaymentsTicketMedio([
      { status: 'paid', amount: 100, paid_amount: 100 },
      { status: 'paid', amount: 200, paid_amount: 200 },
    ]);
    expect(out.paymentsCount).toBe(2);
    expect(out.paymentsTotal).toBe(300);
    expect(out.ticketMedio).toBe(150);
  });

  it('retorna zero sem recebimentos', () => {
    expect(aggregateStudentPaymentsTicketMedio([])).toEqual({
      paymentsCount: 0,
      paymentsTotal: 0,
      ticketMedio: 0,
    });
  });
});

describe('mergePaymentTotals', () => {
  it('combina vendas e mensalidades', () => {
    expect(mergePaymentTotals({ pix: 100 }, { pix: 50, dinheiro: 20 })).toEqual({
      pix: 150,
      dinheiro: 20,
    });
  });
});

describe('buildDailyReportSummary com mensalidades', () => {
  it('calcula total recepção', () => {
    const summary = buildDailyReportSummary(
      [{ status: 'concluida', total: 100 }],
      [{ amount: 80 }, { amount: 20 }]
    );
    expect(summary.payments_count).toBe(2);
    expect(summary.payments_total).toBe(100);
    expect(summary.reception_total).toBe(200);
  });
});

describe('buildDailyReportPayload mensalidades', () => {
  it('inclui payments_received', () => {
    const payload = buildDailyReportPayload({
      dateYmd: '2026-07-01',
      academyName: 'Demo',
      mappedSales: [],
      rawSaleDocs: [],
      mappedPayments: [{ id: 'p1', amount: 50, paid_at: '2026-07-01T10:00:00Z' }],
      rawPaymentDocs: [{ status: 'paid', amount: 50, method: 'pix' }],
    });
    expect(payload.payments_received).toHaveLength(1);
    expect(payload.summary.payments_total).toBe(50);
  });
});

describe('deep link lojaSalesTabs', () => {
  it('resolve report=1 e date', () => {
    const params = new URLSearchParams('tab=vendas&subtab=history&report=1&date=2026-07-01');
    expect(resolveSalesDailyReportDeepLink(params)).toEqual({
      open: true,
      dateYmd: '2026-07-01',
    });
  });

  it('monta e limpa params', () => {
    const prev = new URLSearchParams('tab=vendas&subtab=new');
    const next = lojaVendasDailyReportParams('2026-07-01', prev);
    expect(next.get('subtab')).toBe('history');
    expect(next.get('report')).toBe('1');
    expect(next.get('date')).toBe('2026-07-01');

    const cleared = clearSalesDailyReportDeepLink(next);
    expect(cleared.get('report')).toBeNull();
    expect(cleared.get('date')).toBeNull();
    expect(cleared.get('subtab')).toBe('history');
  });

  it('paidAtMatchesReportDay', () => {
    expect(paidAtMatchesReportDay('2026-07-01T18:00:00Z', '2026-07-01')).toBe(true);
    expect(paidAtMatchesReportDay('2026-07-02', '2026-07-01')).toBe(false);
  });
});
