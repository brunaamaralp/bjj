import { describe, it, expect } from 'vitest';
import { aggregateOperationalSummary, aggregateRevenueBreakdown } from '../../lib/server/financeTxAggregate.js';
import { computeClosingTotals, buildClosingRows } from '../lib/monthlyClosing.js';

function settledInPeriod(docs, fromYmd, toYmd) {
  const from = new Date(`${fromYmd}T00:00:00`).getTime();
  const to = new Date(`${toYmd}T23:59:59.999`).getTime();
  return (docs || []).filter((d) => {
    if (String(d.status || '').toLowerCase() !== 'settled') return false;
    const iso = d.settledAt || d.$createdAt;
    const t = new Date(iso).getTime();
    return t >= from && t <= to;
  });
}

describe('paridade Relatórios financeiro × Fechamento mensal', () => {
  const from = '2026-04-01';
  const to = '2026-04-30';

  const txs = [
    {
      id: 'tx1',
      type: 'plan',
      gross: 200,
      net: 200,
      status: 'settled',
      settledAt: '2026-04-10T12:00:00.000Z',
      createdAt: '2026-04-10T12:00:00.000Z',
      method: 'pix',
    },
    {
      id: 'tx2',
      type: 'expense',
      gross: 50,
      net: -50,
      direction: 'out',
      status: 'settled',
      settledAt: '2026-04-12T12:00:00.000Z',
      createdAt: '2026-04-12T12:00:00.000Z',
      method: 'pix',
    },
    {
      id: 'tx3',
      type: 'plan',
      gross: 100,
      net: 100,
      status: 'pending',
      createdAt: '2026-04-15T12:00:00.000Z',
      method: 'pix',
    },
  ];

  it('saldo operacional = entradas liquidadas − despesas no intervalo', () => {
    const inPeriod = settledInPeriod(
      txs.map((t) => ({ ...t, $createdAt: t.createdAt })),
      from,
      to
    );
    const op = aggregateOperationalSummary(inPeriod);
    expect(op.received).toBe(200);
    expect(op.expenses).toBe(50);
    expect(op.balance).toBe(150);
  });

  it('fechamento mensal soma recebido alinhado às entradas (sem despesa)', () => {
    const rows = buildClosingRows({
      payments: [],
      transactions: txs.filter((t) => t.status === 'settled' && t.type !== 'expense'),
      leadById: new Map(),
      referenceMonth: '2026-04',
    });
    const closing = computeClosingTotals(rows.rows);
    const op = aggregateOperationalSummary(
      settledInPeriod(txs.map((t) => ({ ...t, $createdAt: t.createdAt })), from, to)
    );
    expect(closing.received).toBe(op.received);
  });

  it('faturamento (gross) difere de recebimentos (net) quando há MDR', () => {
    const mdrTxs = [
      {
        id: 'tx-mdr',
        type: 'plan',
        gross: 200,
        fee: 6,
        net: 194,
        status: 'settled',
        settledAt: '2026-04-10T12:00:00.000Z',
        createdAt: '2026-04-10T12:00:00.000Z',
        method: 'cartao_credito',
      },
    ];
    const inPeriod = settledInPeriod(
      mdrTxs.map((t) => ({ ...t, $createdAt: t.createdAt })),
      from,
      to
    );
    const breakdown = aggregateRevenueBreakdown(inPeriod);
    const op = aggregateOperationalSummary(inPeriod);
    expect(breakdown.grossIn).toBe(200);
    expect(breakdown.fees).toBe(6);
    expect(breakdown.netIn).toBe(194);
    expect(op.received).toBe(194);
    expect(breakdown.grossIn).not.toBe(breakdown.netIn);
  });
});
