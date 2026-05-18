import { describe, it, expect } from 'vitest';
import { buildProductPayloadFromBody, sanitizeStockItemDocument } from '../../lib/server/stockProductMap.js';

describe('stockProductMap', () => {
  it('buildProductPayloadFromBody ignores item_estoque_id and other foreign keys', () => {
    const built = buildProductPayloadFromBody(
      {
        nome: 'Kimono',
        categoria: 'Uniformes',
        item_estoque_id: 'should-not-appear',
        venda_id: 'x',
        action: 'create',
        initial_quantity: 2,
      },
      { isCreate: true }
    );
    expect(built.error).toBeUndefined();
    expect(built.payload.item_estoque_id).toBeUndefined();
    expect(built.payload.venda_id).toBeUndefined();
    expect(built.payload.nome).toBe('Kimono');
    expect(built.initial_quantity).toBe(2);
  });

  it('sanitizeStockItemDocument keeps only STOCK_ITEMS fields', () => {
    const out = sanitizeStockItemDocument({
      nome: 'A',
      item_estoque_id: 'bad',
      academy_id: 'ac1',
    });
    expect(out.nome).toBe('A');
    expect(out.academy_id).toBe('ac1');
    expect(out.item_estoque_id).toBeUndefined();
  });
});
