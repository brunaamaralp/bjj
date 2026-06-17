import { describe, expect, it } from 'vitest';
import { buildInventoryMoveStockPatch } from '../lib/inventoryStockPatch.js';

describe('inventoryStockPatch', () => {
  it('ajuste negativo atualiza pools dual', () => {
    const item = { sale_quantity: 5, rental_available: 0, rental_out: 0, current_quantity: 5 };
    expect(buildInventoryMoveStockPatch(item, 'sale', 'ajuste', -2)).toEqual({
      sale_quantity: 3,
      rental_available: 0,
      rental_out: 0,
      current_quantity: 3,
    });
  });

  it('entrada positiva atualiza pools dual', () => {
    const item = { sale_quantity: 2, rental_available: 0, rental_out: 0, current_quantity: 2 };
    expect(buildInventoryMoveStockPatch(item, 'sale', 'entrada', 3)).toEqual({
      sale_quantity: 5,
      rental_available: 0,
      rental_out: 0,
      current_quantity: 5,
    });
  });
});
