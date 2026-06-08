import { describe, it, expect } from 'vitest';
import {
  aggregatePeriodSummary,
  aggregateOperationalSummary,
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
});
