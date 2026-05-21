import { describe, it, expect } from 'vitest';
import {
  resolveCurrentQuantity,
  computeStockStatus,
  quantityDeltaForMoveType,
  parseStockItemIdFromTaskDescription,
  buildRestockTaskDescription,
  buildConsolidatedRestockTaskTitle,
  buildConsolidatedRestockTaskDescription,
  isConsolidatedRestockTask,
  STOCK_RESTOCK_MARKER,
  STOCK_RESTOCK_CONSOLIDATED_FLAG,
} from '../lib/stockInventory.js';
import { readStockCheckSchedule, nextOccurrenceYmd } from '../lib/stockSettings.js';

describe('stockInventory', () => {
  it('resolveCurrentQuantity uses field or legacy', () => {
    expect(resolveCurrentQuantity({ current_quantity: 5 })).toBe(5);
    expect(
      resolveCurrentQuantity({ quantidade_total: 10, quantidade_vendida: 3, quantidade_alugada: 2 })
    ).toBe(5);
  });

  it('computeStockStatus', () => {
    expect(computeStockStatus(10, 0)).toBe('ok');
    expect(computeStockStatus(5, 5)).toBe('attention');
    expect(computeStockStatus(3, 5)).toBe('critical');
    expect(computeStockStatus(6, 5)).toBe('ok');
  });

  it('quantityDeltaForMoveType', () => {
    expect(quantityDeltaForMoveType('entrada', 3)).toBe(3);
    expect(quantityDeltaForMoveType('saida_venda', 2)).toBe(-2);
    expect(quantityDeltaForMoveType('ajuste', -1)).toBe(-1);
  });

  it('restock task description parses item id', () => {
    const desc = buildRestockTaskDescription({
      itemId: 'abc123',
      currentQty: 2,
      unit: 'pacote',
      minimumLevel: 5,
    });
    expect(desc).toContain(STOCK_RESTOCK_MARKER);
    expect(parseStockItemIdFromTaskDescription(desc)).toBe('abc123');
  });

  it('buildConsolidatedRestockTaskTitle pluralizes', () => {
    expect(buildConsolidatedRestockTaskTitle(1)).toBe('Repor estoque — 1 produto em nível crítico');
    expect(buildConsolidatedRestockTaskTitle(3)).toBe('Repor estoque — 3 produtos em nível crítico');
  });

  it('buildConsolidatedRestockTaskDescription lists products', () => {
    const desc = buildConsolidatedRestockTaskDescription([
      {
        item: { $id: 'a1', nome: 'Camisa', Tamanho: 'G' },
        currentQty: 1,
        minimumLevel: 3,
      },
      {
        item: { $id: 'a2', nome: 'Bermuda', Tamanho: '42' },
        currentQty: 0,
        minimumLevel: 2,
      },
    ]);
    expect(desc).toContain(STOCK_RESTOCK_MARKER);
    expect(desc).toContain(STOCK_RESTOCK_CONSOLIDATED_FLAG);
    expect(desc).toContain('product_ids:a1,a2');
    expect(desc).toContain('Camisa · G — saldo: 1, mínimo: 3');
    expect(desc).toContain('Bermuda · 42 — saldo: 0, mínimo: 2');
    const task = { title: buildConsolidatedRestockTaskTitle(2), description: desc, status: 'pending' };
    expect(isConsolidatedRestockTask(task)).toBe(true);
  });
});

describe('stockSettings', () => {
  it('readStockCheckSchedule defaults', () => {
    const s = readStockCheckSchedule({});
    expect(s.enabled).toBe(false);
    expect(s.dayOfWeek).toBe(5);
  });

  it('nextOccurrenceYmd returns friday from sunday', () => {
    const sun = new Date('2026-05-17T12:00:00');
    expect(nextOccurrenceYmd(5, sun)).toBe('2026-05-22');
  });
});
