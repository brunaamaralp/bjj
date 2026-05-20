import { describe, it, expect } from 'vitest';
import { catalogProductsForSale, enrichCatalogProduct } from '../lib/salesCatalog';

describe('salesCatalog', () => {
  it('enrichCatalogProduct marks out of stock', () => {
    const p = enrichCatalogProduct({
      id: '1',
      nome: 'Kimono',
      categoria: 'Vestuário',
      current_quantity: 0,
      minimum_level: 2,
      is_for_sale: true,
      is_active: true,
      display_label: 'Kimono',
      Tamanho: 'M',
      sale_price: 100,
    });
    expect(p.stockLevel).toBe('out');
    expect(p.canAdd).toBe(false);
  });

  it('catalogProductsForSale keeps active for-sale items only', () => {
    const rows = [
      { id: '1', is_for_sale: true, is_active: true, current_quantity: 5, minimum_level: 0 },
      { id: '2', is_for_sale: false, is_active: true, current_quantity: 5, minimum_level: 0 },
      { id: '3', is_for_sale: true, is_active: false, current_quantity: 5, minimum_level: 0 },
    ].map(enrichCatalogProduct);
    expect(catalogProductsForSale(rows).map((p) => p.id)).toEqual(['1']);
  });
});
