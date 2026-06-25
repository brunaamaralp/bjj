import { describe, expect, it } from 'vitest';
import { buildStockPurchaseFinancePayload } from '../../lib/server/inventoryMoveHandler.js';
import { FINANCE_ORIGIN_STOCK_ENTRY } from '../lib/financeOriginTypes.js';

describe('buildStockPurchaseFinancePayload', () => {
  it('inclui origin_type e origin_id do movimento de estoque', () => {
    const payload = buildStockPurchaseFinancePayload({
      academyId: 'acad-1',
      purchasePrice: 120,
      itemName: 'Kimono M',
      quantity: 10,
      unit: 'unidade',
      paymentMethod: 'pix',
      moveDate: '2026-06-25',
      stockMoveId: 'move-abc',
    });

    expect(payload).toMatchObject({
      academyId: 'acad-1',
      gross: 120,
      type: 'stock_purchase',
      origin_type: FINANCE_ORIGIN_STOCK_ENTRY,
      origin_id: 'move-abc',
      status: 'settled',
    });
    expect(payload.planName).toContain('Compra de estoque');
    expect(payload.note).toContain('Kimono M');
  });

  it('retorna null quando preço inválido', () => {
    expect(
      buildStockPurchaseFinancePayload({
        academyId: 'a',
        purchasePrice: 0,
        itemName: 'X',
        quantity: 1,
        stockMoveId: 'm',
      })
    ).toBeNull();
  });
});
