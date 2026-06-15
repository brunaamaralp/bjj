import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deriveClosingTxResultFromPeriodItems,
  buildClosingPayload,
} from '../../../lib/server/financeClosingData.js';
import { FINANCE_REGIME } from '../../../src/lib/financeCompetence.js';

const REF_MONTH = '2025-06';
const IN_MONTH = '2025-06-15T10:00:00Z';
const OUT_MONTH = '2025-07-01T10:00:00Z';

function fakeTx({
  id,
  status = 'settled',
  settledAt = null,
  createdAt = '2025-06-10T10:00:00Z',
  competence_month = '',
} = {}) {
  return { id, status, settledAt, createdAt, competence_month };
}

describe('financeClosingData', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('BLOCO 1 — deriveClosingTxResultFromPeriodItems (regime CASH)', () => {
    it('lista vazia → { transactions: [], pendingInMonth: 0 }', () => {
      expect(deriveClosingTxResultFromPeriodItems([], REF_MONTH, FINANCE_REGIME.CASH)).toEqual({
        transactions: [],
        pendingInMonth: 0,
      });
    });

    it('tx settled com settledAt no mês de referência → incluída', () => {
      const tx = fakeTx({ id: 'tx-settled-in', settledAt: IN_MONTH });
      const result = deriveClosingTxResultFromPeriodItems([tx], REF_MONTH, FINANCE_REGIME.CASH);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].id).toBe('tx-settled-in');
      expect(result.pendingInMonth).toBe(0);
    });

    it('tx settled com settledAt fora do mês → excluída', () => {
      const tx = fakeTx({ id: 'tx-settled-out', settledAt: OUT_MONTH });
      const result = deriveClosingTxResultFromPeriodItems([tx], REF_MONTH, FINANCE_REGIME.CASH);

      expect(result.transactions).toHaveLength(0);
      expect(result.pendingInMonth).toBe(0);
    });

    it('tx pending com createdAt no mês → incluída, pendingInMonth=1', () => {
      const tx = fakeTx({ id: 'tx-pending-in', status: 'pending', createdAt: IN_MONTH });
      const result = deriveClosingTxResultFromPeriodItems([tx], REF_MONTH, FINANCE_REGIME.CASH);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].id).toBe('tx-pending-in');
      expect(result.pendingInMonth).toBe(1);
    });

    it('tx pending com createdAt fora do mês → excluída', () => {
      const tx = fakeTx({ id: 'tx-pending-out', status: 'pending', createdAt: OUT_MONTH });
      const result = deriveClosingTxResultFromPeriodItems([tx], REF_MONTH, FINANCE_REGIME.CASH);

      expect(result.transactions).toHaveLength(0);
      expect(result.pendingInMonth).toBe(0);
    });

    it('tx cancelled → sempre excluída (independente de datas)', () => {
      const tx = fakeTx({
        id: 'tx-cancelled',
        status: 'cancelled',
        settledAt: IN_MONTH,
        createdAt: IN_MONTH,
      });
      const result = deriveClosingTxResultFromPeriodItems([tx], REF_MONTH, FINANCE_REGIME.CASH);

      expect(result.transactions).toHaveLength(0);
      expect(result.pendingInMonth).toBe(0);
    });

    it('duas tx com mesmo id → deduplicadas (Map por id), retorna só uma', () => {
      const first = fakeTx({ id: 'dup', settledAt: IN_MONTH });
      const second = fakeTx({ id: 'dup', settledAt: IN_MONTH, createdAt: OUT_MONTH });
      const result = deriveClosingTxResultFromPeriodItems(
        [first, second],
        REF_MONTH,
        FINANCE_REGIME.CASH
      );

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].id).toBe('dup');
    });

    it('mix: 1 settled in + 1 pending in + 1 cancelled + 1 settled fora do mês → transactions com 2 itens, pendingInMonth=1', () => {
      const result = deriveClosingTxResultFromPeriodItems(
        [
          fakeTx({ id: 'settled-in', settledAt: IN_MONTH }),
          fakeTx({ id: 'pending-in', status: 'pending', createdAt: IN_MONTH }),
          fakeTx({ id: 'cancelled', status: 'cancelled', settledAt: IN_MONTH }),
          fakeTx({ id: 'settled-out', settledAt: OUT_MONTH }),
        ],
        REF_MONTH,
        FINANCE_REGIME.CASH
      );

      expect(result.transactions.map((t) => t.id).sort()).toEqual(['pending-in', 'settled-in']);
      expect(result.pendingInMonth).toBe(1);
    });
  });

  describe('BLOCO 2 — deriveClosingTxResultFromPeriodItems (regime COMPETENCE)', () => {
    it("tx settled com competence_month='2025-06' → incluída", () => {
      const tx = fakeTx({
        id: 'comp-in',
        competence_month: '2025-06',
        settledAt: OUT_MONTH,
      });
      const result = deriveClosingTxResultFromPeriodItems([tx], REF_MONTH, FINANCE_REGIME.COMPETENCE);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].id).toBe('comp-in');
      expect(result.transactions[0].competenceFallback).toBe(false);
    });

    it("tx settled com competence_month='2025-07' → excluída", () => {
      const tx = fakeTx({
        id: 'comp-out',
        competence_month: '2025-07',
        settledAt: IN_MONTH,
      });
      const result = deriveClosingTxResultFromPeriodItems([tx], REF_MONTH, FINANCE_REGIME.COMPETENCE);

      expect(result.transactions).toHaveLength(0);
    });

    it('tx settled sem competence_month, settledAt no mês → incluída com competenceFallback=true', () => {
      const tx = fakeTx({ id: 'fallback-in', settledAt: IN_MONTH, competence_month: '' });
      const result = deriveClosingTxResultFromPeriodItems([tx], REF_MONTH, FINANCE_REGIME.COMPETENCE);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].competenceFallback).toBe(true);
    });

    it('tx settled sem competence_month, settledAt fora do mês → excluída', () => {
      const tx = fakeTx({ id: 'fallback-out', settledAt: OUT_MONTH, competence_month: '' });
      const result = deriveClosingTxResultFromPeriodItems([tx], REF_MONTH, FINANCE_REGIME.COMPETENCE);

      expect(result.transactions).toHaveLength(0);
    });

    it('tx pending no regime COMPETENCE → usa createdAt (mesmo comportamento do CASH)', () => {
      const inMonth = fakeTx({ id: 'pending-in', status: 'pending', createdAt: IN_MONTH });
      const outMonth = fakeTx({ id: 'pending-out', status: 'pending', createdAt: OUT_MONTH });

      const inResult = deriveClosingTxResultFromPeriodItems(
        [inMonth],
        REF_MONTH,
        FINANCE_REGIME.COMPETENCE
      );
      const outResult = deriveClosingTxResultFromPeriodItems(
        [outMonth],
        REF_MONTH,
        FINANCE_REGIME.COMPETENCE
      );

      expect(inResult.transactions).toHaveLength(1);
      expect(inResult.pendingInMonth).toBe(1);
      expect(outResult.transactions).toHaveLength(0);
      expect(outResult.pendingInMonth).toBe(0);
    });
  });

  describe('BLOCO 3 — buildClosingPayload', () => {
    it('campos mínimos → retorna objeto com todas as chaves esperadas', () => {
      const payload = buildClosingPayload({
        referenceMonth: REF_MONTH,
        regime: FINANCE_REGIME.CASH,
      });

      expect(payload).toEqual({
        referenceMonth: REF_MONTH,
        regime: FINANCE_REGIME.CASH,
        payments: [],
        transactions: [],
        pendingInMonth: 0,
        cashClosing: null,
      });
    });

    it('payments undefined → retorna payments: []', () => {
      const payload = buildClosingPayload({
        referenceMonth: REF_MONTH,
        regime: FINANCE_REGIME.CASH,
        payments: undefined,
      });

      expect(payload.payments).toEqual([]);
    });

    it('transactions undefined → retorna transactions: []', () => {
      const payload = buildClosingPayload({
        referenceMonth: REF_MONTH,
        regime: FINANCE_REGIME.CASH,
        transactions: undefined,
      });

      expect(payload.transactions).toEqual([]);
    });

    it('pendingInMonth undefined → retorna pendingInMonth: 0', () => {
      const payload = buildClosingPayload({
        referenceMonth: REF_MONTH,
        regime: FINANCE_REGIME.CASH,
        pendingInMonth: undefined,
      });

      expect(payload.pendingInMonth).toBe(0);
    });

    it('cashClosing null → retorna cashClosing: null', () => {
      const payload = buildClosingPayload({
        referenceMonth: REF_MONTH,
        regime: FINANCE_REGIME.CASH,
        cashClosing: null,
      });

      expect(payload.cashClosing).toBeNull();
    });

    it('cashClosing com doc válido → retorna cashClosing mapeado sem $id direto', () => {
      const payload = buildClosingPayload({
        referenceMonth: REF_MONTH,
        regime: FINANCE_REGIME.CASH,
        cashClosing: {
          $id: 'close-1',
          closed_at: '2025-06-30T23:59:59Z',
          closed_by: 'user-1',
          snapshot_json: '{"total":100}',
        },
      });

      expect(payload.cashClosing).toEqual({
        id: 'close-1',
        closed_at: '2025-06-30T23:59:59Z',
        closed_by: 'user-1',
        snapshot_json: '{"total":100}',
      });
      expect(payload.cashClosing).not.toHaveProperty('$id');
    });
  });
});
