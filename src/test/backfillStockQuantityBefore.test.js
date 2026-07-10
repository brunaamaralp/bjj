import { describe, expect, it } from 'vitest';
import {
  buildQuantityBeforeBackfillPlan,
  buildQuantityBeforeBackfillPlanForAcademy,
} from '../lib/backfillStockQuantityBefore.js';

describe('backfillStockQuantityBefore', () => {
  it('preenche quantity_before em ordem cronológica', () => {
    const plan = buildQuantityBeforeBackfillPlan([
      { $id: 'm1', item_estoque_id: 'item-1', tipo: 'entrada', quantidade: 10, $createdAt: '2026-06-01T10:00:00Z' },
      { $id: 'm2', item_estoque_id: 'item-1', tipo: 'saida_venda', quantidade: 3, $createdAt: '2026-06-02T10:00:00Z' },
      { $id: 'm3', item_estoque_id: 'item-1', tipo: 'ajuste', quantidade: 2, referencia_id: 'adjustment:+', $createdAt: '2026-06-03T10:00:00Z' },
    ]);

    expect(plan).toEqual([
      { move_id: 'm1', item_estoque_id: 'item-1', quantity_before: 0 },
      { move_id: 'm2', item_estoque_id: 'item-1', quantity_before: 10 },
      { move_id: 'm3', item_estoque_id: 'item-1', quantity_before: 7 },
    ]);
  });

  it('usa movimentos existentes com quantity_before como âncora', () => {
    const plan = buildQuantityBeforeBackfillPlan([
      { $id: 'm1', item_estoque_id: 'item-1', tipo: 'entrada', quantidade: 5, quantity_before: 12, $createdAt: '2026-06-01T10:00:00Z' },
      { $id: 'm2', item_estoque_id: 'item-1', tipo: 'saida_venda', quantidade: 2, $createdAt: '2026-06-02T10:00:00Z' },
    ]);

    expect(plan).toEqual([{ move_id: 'm2', item_estoque_id: 'item-1', quantity_before: 17 }]);
  });

  it('agrega por item na academia', () => {
    const byItem = new Map([
      ['a', [{ $id: 'm1', item_estoque_id: 'a', tipo: 'entrada', quantidade: 1, $createdAt: '2026-06-01T10:00:00Z' }]],
      ['b', [{ $id: 'm2', item_estoque_id: 'b', tipo: 'entrada', quantidade: 2, $createdAt: '2026-06-01T11:00:00Z' }]],
    ]);
    const plan = buildQuantityBeforeBackfillPlanForAcademy(byItem);
    expect(plan).toHaveLength(2);
  });
});
