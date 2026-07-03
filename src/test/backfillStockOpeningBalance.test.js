import { describe, it, expect } from 'vitest';
import {
  OPENING_BALANCE_MOTIVO,
  buildOpeningBalanceBackfillPlan,
  buildOpeningBalanceMovePayload,
  indexItemsWithOpeningBackfill,
  isOpeningBalanceBackfillMove,
  openingBalanceReferenciaId,
  summarizeOpeningBalancePlan,
} from '../lib/backfillStockOpeningBalance.js';
import { STOCK_DELTA_CAUSES } from '../lib/auditStockBalance.js';

describe('backfillStockOpeningBalance', () => {
  it('detecta movimento de backfill por motivo ou referencia_id', () => {
    expect(isOpeningBalanceBackfillMove({ motivo: OPENING_BALANCE_MOTIVO })).toBe(true);
    expect(isOpeningBalanceBackfillMove({ referencia_id: 'audit_backfill:opening:v1' })).toBe(true);
    expect(isOpeningBalanceBackfillMove({ motivo: 'cadastro_inicial' })).toBe(false);
  });

  it('indexItemsWithOpeningBackfill agrupa por item', () => {
    const set = indexItemsWithOpeningBackfill([
      { item_estoque_id: 'v1', motivo: OPENING_BALANCE_MOTIVO },
      { item_estoque_id: 'v2', referencia_id: 'audit_backfill:opening:v2' },
    ]);
    expect(set.has('v1')).toBe(true);
    expect(set.has('v2')).toBe(true);
  });

  it('buildOpeningBalanceBackfillPlan inclui itens sem movimento com saldo', () => {
    const rows = [
      {
        item_id: 'v1',
        item_label: 'Kimono · M',
        academy_id: 'ac1',
        current_quantity: 5,
        move_count: 0,
        delta: 5,
        probable_cause: STOCK_DELTA_CAUSES.LEGACY_OR_DIRECT_BALANCE,
      },
      {
        item_id: 'v2',
        current_quantity: 3,
        move_count: 2,
        delta: 1,
        probable_cause: STOCK_DELTA_CAUSES.BALANCE_HIGHER_THAN_MOVES,
      },
    ];
    const { plan, skipped } = buildOpeningBalanceBackfillPlan(rows, new Set());
    expect(plan).toHaveLength(1);
    expect(plan[0].item_id).toBe('v1');
    expect(plan[0].quantidade).toBe(5);
    expect(plan[0].referencia_id).toBe(openingBalanceReferenciaId('v1'));
    expect(skipped.some((s) => s.reason === 'has_moves')).toBe(true);
  });

  it('ignora item já backfilled', () => {
    const rows = [
      {
        item_id: 'v1',
        current_quantity: 2,
        move_count: 0,
        delta: 2,
        probable_cause: STOCK_DELTA_CAUSES.LEGACY_OR_DIRECT_BALANCE,
      },
    ];
    const { plan, skipped } = buildOpeningBalanceBackfillPlan(rows, new Set(['v1']));
    expect(plan).toHaveLength(0);
    expect(skipped[0].reason).toBe('already_backfilled');
  });

  it('buildOpeningBalanceMovePayload não inclui patch de estoque', () => {
    const payload = buildOpeningBalanceMovePayload({
      item_id: 'v1',
      academy_id: 'ac1',
      quantidade: 4,
      referencia_id: openingBalanceReferenciaId('v1'),
    });
    expect(payload.tipo).toBe('entrada');
    expect(payload.quantidade).toBe(4);
    expect(payload.quantity_before).toBe(0);
    expect(payload.motivo).toBe(OPENING_BALANCE_MOTIVO);
  });

  it('summarizeOpeningBalancePlan soma unidades', () => {
    const s = summarizeOpeningBalancePlan(
      [{ quantidade: 3 }, { quantidade: 5 }],
      [{ reason: 'has_moves' }]
    );
    expect(s.items_to_backfill).toBe(2);
    expect(s.total_units).toBe(8);
    expect(s.skipped_has_moves).toBe(1);
  });
});
