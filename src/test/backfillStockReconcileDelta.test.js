import { describe, it, expect } from 'vitest';
import {
  RECONCILE_DELTA_MOTIVO,
  buildReconcileDeltaBackfillPlan,
  buildReconcileDeltaMovePayload,
  indexItemsWithReconcileDeltaBackfill,
  isReconcileDeltaBackfillMove,
  reconcileDeltaReferenciaId,
  reconcileMoveForDelta,
  summarizeReconcileDeltaPlan,
} from '../lib/backfillStockReconcileDelta.js';
import { STOCK_DELTA_CAUSES } from '../lib/auditStockBalance.js';

describe('backfillStockReconcileDelta', () => {
  it('reconcileMoveForDelta mapeia sinal para entrada/saida', () => {
    expect(reconcileMoveForDelta(3)).toEqual({ tipo: 'entrada', quantidade: 3 });
    expect(reconcileMoveForDelta(-4)).toEqual({ tipo: 'saida', quantidade: 4 });
    expect(reconcileMoveForDelta(0)).toBeNull();
  });

  it('isReconcileDeltaBackfillMove detecta motivo ou referencia', () => {
    expect(isReconcileDeltaBackfillMove({ motivo: RECONCILE_DELTA_MOTIVO })).toBe(true);
    expect(isReconcileDeltaBackfillMove({ referencia_id: 'audit_backfill:reconcile:v1' })).toBe(true);
  });

  it('buildReconcileDeltaBackfillPlan cria entrada quando saldo > movimentos', () => {
    const rows = [
      {
        item_id: 'v1',
        item_label: 'Item A',
        academy_id: 'ac1',
        current_quantity: 12,
        calculated_quantity: 3,
        delta: 9,
        move_count: 2,
        probable_cause: STOCK_DELTA_CAUSES.BALANCE_HIGHER_THAN_MOVES,
      },
    ];
    const { plan } = buildReconcileDeltaBackfillPlan(rows, new Set());
    expect(plan).toHaveLength(1);
    expect(plan[0].tipo).toBe('entrada');
    expect(plan[0].quantidade).toBe(9);
  });

  it('buildReconcileDeltaBackfillPlan cria saida quando saldo < movimentos', () => {
    const rows = [
      {
        item_id: 'v2',
        current_quantity: 0,
        calculated_quantity: 6,
        delta: -6,
        move_count: 3,
        probable_cause: STOCK_DELTA_CAUSES.BALANCE_LOWER_THAN_MOVES,
      },
    ];
    const { plan } = buildReconcileDeltaBackfillPlan(rows, new Set());
    expect(plan[0].tipo).toBe('saida');
    expect(plan[0].quantidade).toBe(6);
  });

  it('ignora delta acima do max', () => {
    const rows = [{ item_id: 'v1', delta: 20, move_count: 1, current_quantity: 20, calculated_quantity: 0 }];
    const { plan: p1, skipped: s1 } = buildReconcileDeltaBackfillPlan(rows, new Set(), { maxAbsDelta: 10 });
    expect(p1).toHaveLength(0);
    expect(s1[0].reason).toBe('delta_above_max');
  });

  it('ignora followup duplicado', () => {
    const rows = [{ item_id: 'v1', delta: -2, move_count: 1, current_quantity: 0, calculated_quantity: 2 }];
    const refs = new Set([
      reconcileDeltaReferenciaId('v1'),
      reconcileDeltaReferenciaId('v1', 'followup'),
    ]);
    const { plan, skipped } = buildReconcileDeltaBackfillPlan(rows, new Set(['v1']), { existingReconcileRefs: refs });
    expect(plan).toHaveLength(0);
    expect(skipped[0].reason).toBe('already_reconciled');
  });

  it('permite followup quando item já reconciliado mas delta persiste', () => {
    const rows = [{ item_id: 'v1', delta: -2, move_count: 4, current_quantity: 1, calculated_quantity: 3, academy_id: 'ac1' }];
    const refs = new Set([reconcileDeltaReferenciaId('v1')]);
    const { plan } = buildReconcileDeltaBackfillPlan(rows, new Set(['v1']), { existingReconcileRefs: refs });
    expect(plan).toHaveLength(1);
    expect(plan[0].referencia_id).toBe(reconcileDeltaReferenciaId('v1', 'followup'));
    expect(plan[0].tipo).toBe('saida');
  });

  it('indexItemsWithReconcileDeltaBackfill agrupa por item', () => {
    const set = indexItemsWithReconcileDeltaBackfill([
      { item_estoque_id: 'v1', motivo: RECONCILE_DELTA_MOTIVO },
    ]);
    expect(set.has('v1')).toBe(true);
  });

  it('summarizeReconcileDeltaPlan soma entradas e saídas', () => {
    const s = summarizeReconcileDeltaPlan(
      [
        { tipo: 'entrada', quantidade: 2 },
        { tipo: 'saida', quantidade: 5 },
      ],
      []
    );
    expect(s.items_to_reconcile).toBe(2);
    expect(s.units_in).toBe(2);
    expect(s.units_out).toBe(5);
  });

  it('buildReconcileDeltaMovePayload inclui referencia idempotente', () => {
    const payload = buildReconcileDeltaMovePayload({
      item_id: 'v1',
      academy_id: 'ac1',
      tipo: 'entrada',
      quantidade: 1,
    });
    expect(payload.referencia_id).toBe(reconcileDeltaReferenciaId('v1'));
  });
});
