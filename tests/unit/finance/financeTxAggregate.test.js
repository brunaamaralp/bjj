import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  aggregatePeriodSummary,
  aggregateOperationalSummary,
} from '../../../lib/server/financeTxAggregate.js';

function fakeTx({ status = 'settled', type = 'plan', gross = 100, net = 100, method = 'pix', direction = null } = {}) {
  const doc = { status, type, gross, net, method };
  if (direction != null) doc.direction = direction;
  return doc;
}

describe('financeTxAggregate', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('BLOCO 1 — aggregatePeriodSummary', () => {
    it('lista vazia → todos os campos zero', () => {
      expect(aggregatePeriodSummary([])).toEqual({
        settledIn: 0,
        settledOut: 0,
        periodBalance: 0,
        pendingIn: 0,
        pendingOut: 0,
        countSettled: 0,
        countPending: 0,
      });
    });

    it('1 tx settled entrada (plan, gross=100, net=90) → settledIn=90, settledOut=0, countSettled=1', () => {
      const summary = aggregatePeriodSummary([
        fakeTx({ status: 'settled', type: 'plan', gross: 100, net: 90 }),
      ]);
      expect(summary.settledIn).toBe(90);
      expect(summary.settledOut).toBe(0);
      expect(summary.countSettled).toBe(1);
    });

    it('1 tx settled saída (expense_operational, gross=50) → settledOut=50, settledIn=0', () => {
      const summary = aggregatePeriodSummary([
        fakeTx({ status: 'settled', type: 'expense_operational', gross: 50, net: -50 }),
      ]);
      expect(summary.settledOut).toBe(50);
      expect(summary.settledIn).toBe(0);
      expect(summary.countSettled).toBe(1);
    });

    it('1 tx pending entrada → pendingIn=100, countPending=1', () => {
      const summary = aggregatePeriodSummary([
        fakeTx({ status: 'pending', type: 'plan', gross: 100, net: 100 }),
      ]);
      expect(summary.pendingIn).toBe(100);
      expect(summary.countPending).toBe(1);
    });

    it('1 tx cancelled → ignorada (não entra em nenhum contador)', () => {
      const summary = aggregatePeriodSummary([
        fakeTx({ status: 'cancelled', type: 'plan', gross: 999, net: 999 }),
      ]);
      expect(summary.countSettled).toBe(0);
      expect(summary.countPending).toBe(0);
      expect(summary.settledIn).toBe(0);
      expect(summary.settledOut).toBe(0);
      expect(summary.pendingIn).toBe(0);
    });

    it('mix: 2 settled in + 1 settled out + 1 pending in → periodBalance arredondado', () => {
      const summary = aggregatePeriodSummary([
        fakeTx({ status: 'settled', type: 'plan', gross: 100, net: 90 }),
        fakeTx({ status: 'settled', type: 'plan', gross: 80, net: 80 }),
        fakeTx({ status: 'settled', type: 'expense_operational', gross: 50, net: -50 }),
        fakeTx({ status: 'pending', type: 'plan', gross: 100, net: 100 }),
      ]);
      expect(summary.settledIn).toBe(170);
      expect(summary.settledOut).toBe(50);
      expect(summary.periodBalance).toBe(120);
      expect(summary.pendingIn).toBe(100);
      expect(summary.countSettled).toBe(3);
      expect(summary.countPending).toBe(1);
    });

    it('tx com gross=100.005 → arredondamento correto (roundMoney)', () => {
      const summary = aggregatePeriodSummary([
        fakeTx({ status: 'settled', type: 'plan', gross: 100.005, net: 100.005 }),
      ]);
      expect(summary.settledIn).toBe(100.01);
      expect(summary.periodBalance).toBe(100.01);
    });
  });

  describe('BLOCO 2 — aggregateOperationalSummary', () => {
    it('lista vazia → received=0, expenses=0, balance=0', () => {
      expect(aggregateOperationalSummary([])).toEqual({
        received: 0,
        expenses: 0,
        balance: 0,
        receivedCount: 0,
        expenseCount: 0,
        byMethod: {},
      });
    });

    it("tx settled, type='plan', net=90 → received=90, receivedCount=1", () => {
      const summary = aggregateOperationalSummary([
        fakeTx({ status: 'settled', type: 'plan', gross: 100, net: 90 }),
      ]);
      expect(summary.received).toBe(90);
      expect(summary.receivedCount).toBe(1);
    });

    it("tx settled, type='expense_operational', gross=50 → expenses=50, expenseCount=1", () => {
      const summary = aggregateOperationalSummary([
        fakeTx({ status: 'settled', type: 'expense_operational', gross: 50, net: -50 }),
      ]);
      expect(summary.expenses).toBe(50);
      expect(summary.expenseCount).toBe(1);
    });

    it("tx settled, type='refund', net=-30 → received=-30 (reduz received)", () => {
      const summary = aggregateOperationalSummary([
        fakeTx({ status: 'settled', type: 'refund', gross: 30, net: -30 }),
      ]);
      expect(summary.received).toBe(-30);
      expect(summary.receivedCount).toBe(1);
    });

    it('tx pending → ignorada (só settled conta)', () => {
      const summary = aggregateOperationalSummary([
        fakeTx({ status: 'pending', type: 'plan', gross: 500, net: 500 }),
      ]);
      expect(summary.received).toBe(0);
      expect(summary.receivedCount).toBe(0);
    });

    it("tx settled, method='cartao' → byMethod.cartao acumulado", () => {
      const summary = aggregateOperationalSummary([
        fakeTx({ status: 'settled', type: 'plan', gross: 75, net: 75, method: 'cartao' }),
      ]);
      expect(summary.byMethod.cartao).toBe(75);
    });

    it('balance = received - expenses', () => {
      const summary = aggregateOperationalSummary([
        fakeTx({ status: 'settled', type: 'plan', gross: 200, net: 200 }),
        fakeTx({ status: 'settled', type: 'expense_operational', gross: 80, net: -80 }),
      ]);
      expect(summary.balance).toBe(summary.received - summary.expenses);
      expect(summary.balance).toBe(120);
    });
  });
});
