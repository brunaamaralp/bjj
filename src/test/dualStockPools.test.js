import { describe, expect, it } from 'vitest';
import {
  aggregatePoolTotals,
  availableFromPools,
  buildVariantPoolFields,
  formatStockPoolsSummary,
  hasDualPoolFields,
  normalizeProductType,
  productTypeShowsRentalPools,
  productTypeShowsSalePools,
  saleQuantity,
  syncCurrentQuantityFromPools,
  totalPhysicalQuantity,
} from '../lib/dualStockPools.js';
import { normalizeVariantsInput, buildParentCatalogRows } from '../lib/productCatalog.js';

describe('dualStockPools', () => {
  it('normaliza tipo both', () => {
    expect(normalizeProductType('venda_e_aluguel')).toBe('both');
    expect(productTypeShowsSalePools('both')).toBe(true);
    expect(productTypeShowsRentalPools('both')).toBe(true);
  });

  it('resolve pools e current_quantity', () => {
    const item = { sale_quantity: 3, rental_available: 2, rental_out: 1 };
    expect(hasDualPoolFields(item)).toBe(true);
    expect(availableFromPools(item)).toBe(5);
    expect(totalPhysicalQuantity(item)).toBe(6);
    expect(saleQuantity(item)).toBe(3);
  });

  it('ignora pools com default 0 quando current_quantity legado tem saldo', () => {
    const unmigrated = { sale_quantity: 0, rental_available: 0, rental_out: 0, current_quantity: 8 };
    expect(hasDualPoolFields(unmigrated)).toBe(false);
    expect(saleQuantity(unmigrated)).toBe(0);
  });

  it('buildVariantPoolFields por tipo de produto', () => {
    expect(
      buildVariantPoolFields({ parentType: 'sale', initial_quantity: 4 })
    ).toEqual({
      sale_quantity: 4,
      rental_available: 0,
      rental_out: 0,
      current_quantity: 4,
    });

    expect(
      buildVariantPoolFields({ parentType: 'rental', initial_quantity: 2 })
    ).toEqual({
      sale_quantity: 0,
      rental_available: 2,
      rental_out: 0,
      current_quantity: 2,
    });

    expect(
      buildVariantPoolFields({
        parentType: 'both',
        initial_sale_quantity: 1,
        initial_rental_quantity: 3,
      })
    ).toEqual({
      sale_quantity: 1,
      rental_available: 3,
      rental_out: 0,
      current_quantity: 4,
    });
  });

  it('syncCurrentQuantityFromPools soma disponíveis', () => {
    expect(syncCurrentQuantityFromPools({ sale_quantity: 2, rental_available: 5 })).toEqual({
      sale_quantity: 2,
      rental_available: 5,
      current_quantity: 7,
    });
  });

  it('aggregatePoolTotals em buildParentCatalogRows', () => {
    const parents = [
      {
        id: 'p1',
        nome: 'Kimono',
        type: 'both',
        is_active: true,
        categoria: 'Uniforme',
      },
    ];
    const variants = [
      {
        product_id: 'p1',
        id: 'v1',
        sale_quantity: 2,
        rental_available: 3,
        rental_out: 1,
        current_quantity: 5,
        minimum_level: 0,
        lifecycle: 'ativo',
        display_label: 'M',
      },
    ];
    const [row] = buildParentCatalogRows(parents, variants);
    expect(row.total_sale_quantity).toBe(2);
    expect(row.total_rental_available).toBe(3);
    expect(row.total_rental_out).toBe(1);
    expect(row.total_quantity).toBe(6);
  });

  it('normalizeVariantsInput mapeia saldos iniciais', () => {
    const rows = normalizeVariantsInput(
      [{ size: 'M', initial_sale_quantity: '2', initial_rental_quantity: '1' }],
      'both'
    );
    expect(rows[0].sale_quantity).toBe(2);
    expect(rows[0].rental_available).toBe(1);
    expect(rows[0].current_quantity).toBe(3);
  });

  it('formatStockPoolsSummary', () => {
    const text = formatStockPoolsSummary(
      { sale_quantity: 1, rental_available: 2, rental_out: 1 },
      'both'
    );
    expect(text).toContain('1 venda');
    expect(text).toContain('2 aluguel');
    expect(text).toContain('1 emprestado');
  });
});
