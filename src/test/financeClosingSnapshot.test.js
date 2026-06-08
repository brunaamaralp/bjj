import { describe, it, expect } from 'vitest';
import { snapshotTotalsMismatch } from '../../lib/server/financeClosingHandler.js';
import { buildClosingRows, computeClosingTotals } from '../lib/monthlyClosing.js';

describe('financeClosing snapshot validation', () => {
  it('snapshotTotalsMismatch detects expected/received/pending drift', () => {
    const server = { expected: 1000, received: 800, pending: 200 };
    expect(snapshotTotalsMismatch(server, { expected: 1000, received: 800, pending: 200 })).toBeNull();
    expect(snapshotTotalsMismatch(server, { received: 799 }).key).toBe('received');
    expect(snapshotTotalsMismatch(server, { pending: 250 }).key).toBe('pending');
  });

  it('buildClosingRows includes active student without payment in expected', () => {
    const students = [
      { id: 's1', name: 'Ana', plan: 'Mensal', type: 'adulto' },
    ];
    const leadById = new Map(students.map((s) => [s.id, s]));
    const { rows } = buildClosingRows({
      payments: [],
      transactions: [],
      leadById,
      financeConfig: { plans: [{ name: 'Mensal', price: 200 }] },
      referenceMonth: '2026-06',
    });
    const totals = computeClosingTotals(rows);
    expect(totals.expected).toBeGreaterThan(0);
    expect(totals.received).toBe(0);
    expect(totals.pending).toBe(totals.expected);
  });
});
