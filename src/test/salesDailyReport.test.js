import { describe, it, expect } from 'vitest';
import { aggregatePaymentTotalsFromSaleDocs } from '../../lib/server/salePaymentTotals.js';
import {
  buildDailyReportPayload,
  buildDailyReportSummary,
  parseReportDateYmd,
} from '../../lib/server/salesDailyReportBuild.js';

describe('parseReportDateYmd', () => {
  it('aceita YYYY-MM-DD válido', () => {
    expect(parseReportDateYmd('2026-07-01')).toBe('2026-07-01');
  });

  it('rejeita formato inválido', () => {
    expect(parseReportDateYmd('01/07/2026')).toBeNull();
    expect(parseReportDateYmd('')).toBeNull();
  });
});

describe('aggregatePaymentTotalsFromSaleDocs', () => {
  it('soma PIX em vendas concluídas', () => {
    const totals = aggregatePaymentTotalsFromSaleDocs([
      {
        status: 'concluida',
        pagamentos_json: JSON.stringify([{ forma: 'pix', valor: 100 }]),
      },
      {
        status: 'concluida',
        pagamentos_json: JSON.stringify([{ forma: 'pix', valor: 50 }]),
      },
    ]);
    expect(totals.pix).toBe(150);
  });

  it('ignora canceladas', () => {
    const totals = aggregatePaymentTotalsFromSaleDocs([
      {
        status: 'cancelada',
        pagamentos_json: JSON.stringify([{ forma: 'pix', valor: 999 }]),
      },
      {
        status: 'concluida',
        total: 40,
        forma_pagamento: 'dinheiro',
      },
    ]);
    expect(totals.pix).toBeUndefined();
    expect(totals.dinheiro).toBe(40);
  });

  it('desconta troco da forma de troco', () => {
    const totals = aggregatePaymentTotalsFromSaleDocs([
      {
        status: 'concluida',
        pagamentos_json: JSON.stringify([
          { forma: 'dinheiro', valor: 100, troco: 20, forma_troco: 'pix' },
        ]),
      },
    ]);
    expect(totals.dinheiro).toBe(100);
    expect(totals.pix).toBe(-20);
  });
});

describe('buildDailyReportSummary', () => {
  it('conta concluídas, canceladas e pendentes', () => {
    const summary = buildDailyReportSummary([
      { status: 'concluida', total: 100 },
      { status: 'concluida', total: 200 },
      { status: 'cancelada', total: 50 },
      { status: 'pendente', total: 80, deferred: true },
    ]);
    expect(summary.concluded_count).toBe(2);
    expect(summary.concluded_total).toBe(300);
    expect(summary.ticket_medio).toBe(150);
    expect(summary.cancel_count).toBe(1);
    expect(summary.pending_count).toBe(1);
    expect(summary.pending_total).toBe(80);
    expect(summary.payments_count).toBe(0);
    expect(summary.reception_total).toBe(300);
  });
});

describe('buildDailyReportPayload', () => {
  it('separa listas por status', () => {
    const mapped = [
      { id: '1', status: 'concluida', total: 100, created_at: '2026-07-01T10:00:00Z' },
      { id: '2', status: 'cancelada', total: 50, created_at: '2026-07-01T11:00:00Z' },
    ];
    const raw = [
      { status: 'concluida', pagamentos_json: '[]', total: 100, forma_pagamento: 'pix' },
      { status: 'cancelada', total: 50 },
    ];
    const payload = buildDailyReportPayload({
      dateYmd: '2026-07-01',
      academyName: 'Demo',
      mappedSales: mapped,
      rawSaleDocs: raw,
    });
    expect(payload.ok).toBe(true);
    expect(payload.sales_concluded).toHaveLength(1);
    expect(payload.sales_cancelled).toHaveLength(1);
    expect(payload.summary.concluded_count).toBe(1);
    expect(payload.academy_name).toBe('Demo');
  });
});
