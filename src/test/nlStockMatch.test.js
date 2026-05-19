import { describe, it, expect } from 'vitest';
import { matchStockProduct } from '../../lib/nlStockMatch.js';

const catalog = [
  {
    id: 'p1',
    nome: 'Rashguard',
    display_label: 'Rashguard Branca · M',
    categoria: 'Vestuário',
    Tamanho: 'M',
    sale_price: 189,
    current_quantity: 3,
    is_for_sale: true,
    is_active: true,
  },
  {
    id: 'p2',
    nome: 'Rashguard',
    display_label: 'Rashguard Preta · M',
    categoria: 'Vestuário',
    Tamanho: 'M',
    sale_price: 189,
    current_quantity: 0,
    is_for_sale: true,
    is_active: true,
  },
];

describe('nlStockMatch', () => {
  it('encontra produto por id', () => {
    const r = matchStockProduct('', catalog, { stockItemId: 'p1' });
    expect(r.status).toBe('ok');
    expect(r.product.id).toBe('p1');
  });

  it('encontra produto por texto', () => {
    const r = matchStockProduct('rashguard branca m', catalog);
    expect(r.status).toBe('ok');
    expect(r.product.id).toBe('p1');
  });

  it('marca ambíguo quando scores próximos', () => {
    const r = matchStockProduct('rashguard m', catalog);
    expect(r.status).toBe('ambiguous');
  });
});
