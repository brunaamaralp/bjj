import { describe, it, expect } from 'vitest';
import {
  aggregatePeriodSummary,
  aggregateOperationalSummary,
  aggregateOperationalWeeklySeries,
} from '../../lib/server/financeTxAggregate.js';

describe('financeTxAggregate', () => {
  const docs = [
    {
      id: '1',
      type: 'plan',
      gross: 200,
      net: 200,
      status: 'settled',
      method: 'pix',
    },
    {
      id: '2',
      type: 'expense',
      gross: 50,
      net: -50,
      direction: 'out',
      status: 'settled',
    },
    {
      id: '3',
      type: 'plan',
      gross: 100,
      status: 'pending',
    },
    {
      id: '4',
      type: 'plan',
      gross: 999,
      status: 'cancelled',
    },
    {
      id: '5',
      type: 'refund',
      gross: 30,
      net: -30,
      status: 'settled',
      method: 'pix',
    },
  ];

  it('aggregatePeriodSummary sums settled and pending, skips cancelled', () => {
    const s = aggregatePeriodSummary(docs);
    expect(s.settledIn).toBe(230);
    expect(s.settledOut).toBe(50);
    expect(s.periodBalance).toBe(180);
    expect(s.pendingIn).toBe(100);
    expect(s.pendingOut).toBe(0);
    expect(s.countSettled).toBe(3);
    expect(s.countPending).toBe(1);
  });

  it('aggregateOperationalSummary handles refunds and byMethod', () => {
    const s = aggregateOperationalSummary(docs);
    expect(s.received).toBe(170);
    expect(s.expenses).toBe(50);
    expect(s.balance).toBe(120);
    expect(s.receivedCount).toBe(2);
    expect(s.expenseCount).toBe(1);
    expect(s.byMethod.pix).toBe(200);
  });

  it('aggregateOperationalWeeklySeries agrupa por semana no intervalo', () => {
    const txs = [
      {
        id: 'w1-in',
        type: 'plan',
        gross: 100,
        net: 100,
        status: 'settled',
        settledAt: '2026-04-07T12:00:00.000Z',
        method: 'pix',
      },
      {
        id: 'w1-out',
        type: 'expense',
        gross: 40,
        net: -40,
        direction: 'out',
        status: 'settled',
        settledAt: '2026-04-08T12:00:00.000Z',
      },
      {
        id: 'w2-in',
        type: 'plan',
        gross: 50,
        net: 50,
        status: 'settled',
        settledAt: '2026-04-15T12:00:00.000Z',
        method: 'pix',
      },
    ];
    const series = aggregateOperationalWeeklySeries(txs, '2026-04-01', '2026-04-30');
    expect(series.length).toBeGreaterThan(0);
    const withData = series.filter((row) => row.received > 0 || row.expenses > 0);
    expect(withData.length).toBeGreaterThanOrEqual(2);
    const totalReceived = series.reduce((sum, row) => sum + row.received, 0);
    const totalExpenses = series.reduce((sum, row) => sum + row.expenses, 0);
    expect(totalReceived).toBe(150);
    expect(totalExpenses).toBe(40);
  });
});
