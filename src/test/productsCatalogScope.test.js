import { describe, expect, it } from 'vitest';
import {
  allowedProductTypesForLojaScope,
  filterParentsByLojaCatalogScope,
  LOJA_PRODUCT_SCOPES,
  otherLojaCatalogTab,
  applyLojaImportRowDefaults,
} from '../lib/lojaProductScope.js';
import { buildParentCreateBodyFromImportRows, classifyImportRow } from '../lib/productImport.js';

const MIX = [
  { id: '1', nome: 'Kimono venda', type: 'sale' },
  { id: '2', nome: 'Kimono aluguel', type: 'rental' },
  { id: '3', nome: 'Kimono dual', type: 'both' },
  { id: '4', nome: 'Limpeza', type: 'supply' },
];

describe('productsCatalogScope', () => {
  it('filterParentsByLojaCatalogScope — produtos', () => {
    const ids = filterParentsByLojaCatalogScope(MIX, LOJA_PRODUCT_SCOPES.PRODUCTS).map((p) => p.id);
    expect(ids).toEqual(['1', '3', '4']);
  });

  it('filterParentsByLojaCatalogScope — aluguel', () => {
    const ids = filterParentsByLojaCatalogScope(MIX, LOJA_PRODUCT_SCOPES.RENTAL).map((p) => p.id);
    expect(ids).toEqual(['2', '3']);
  });

  it('allowedProductTypesForLojaScope', () => {
    const rental = allowedProductTypesForLojaScope(LOJA_PRODUCT_SCOPES.RENTAL).map((o) => o.value);
    expect(rental.sort()).toEqual(['both', 'rental']);
    const prod = allowedProductTypesForLojaScope(LOJA_PRODUCT_SCOPES.PRODUCTS).map((o) => o.value);
    expect(prod).toEqual(['sale', 'both', 'supply']);
  });

  it('otherLojaCatalogTab', () => {
    expect(otherLojaCatalogTab(LOJA_PRODUCT_SCOPES.PRODUCTS)).toBe(LOJA_PRODUCT_SCOPES.RENTAL);
    expect(otherLojaCatalogTab(LOJA_PRODUCT_SCOPES.RENTAL)).toBe(LOJA_PRODUCT_SCOPES.PRODUCTS);
  });

  it('applyLojaImportRowDefaults — rental', () => {
    const row = applyLojaImportRowDefaults({ nome: 'Kimono', sale_price: 15 }, 'rental');
    expect(row.type).toBe('rental');
    expect(row.rental_price).toBe(15);
  });

  it('buildParentCreateBodyFromImportRows — rental default', () => {
    const body = buildParentCreateBodyFromImportRows(
      [{ nome: 'Kimono', sale_price: 20, initial_quantity: 3, Tamanho: 'M' }],
      { defaultProductType: 'rental' }
    );
    expect(body.type).toBe('rental');
    expect(body.rental_price).toBe(20);
    expect(body.variants[0].initial_rental_quantity).toBe(3);
  });

  it('classifyImportRow accepts sale_price as rental when defaultProductType rental', () => {
    expect(
      classifyImportRow({ nome: 'K', sale_price: 10 }, { defaultProductType: 'rental' })
    ).toBe('ready');
  });
});
