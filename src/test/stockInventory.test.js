import { describe, it, expect } from 'vitest';
import {
  resolveCurrentQuantity,
  computeStockStatus,
  quantityDeltaForMoveType,
  parseStockItemIdFromTaskDescription,
  buildRestockTaskDescription,
  STOCK_RESTOCK_MARKER,
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
