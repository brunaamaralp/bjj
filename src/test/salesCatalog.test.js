import { describe, it, expect } from 'vitest';
import {
  catalogProductsForSale,
  enrichCatalogProduct,
  enrichSalesParentRow,
  findCatalogVariantByCode,
  normalizeSalesCatalogFromApi,
  variantOptionLabel,
  parentNeedsVariantPicker,
  cartVariantOptions,
} from '../lib/salesCatalog';

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

  it('catalogProductsForSale keeps rows when sale/active flags are omitted', () => {
    expect(
      catalogProductsForSale([
        { id: '1', nome: 'Kimono', current_quantity: 2, minimum_level: 0 },
      ])
    ).toHaveLength(1);
  });

  it('normalizeSalesCatalogFromApi groups legacy sizes under one parent', () => {
    const parents = normalizeSalesCatalogFromApi({
      catalog_mode: 'legacy',
      variants: [
        {
          id: 'v1',
          nome: 'Kimono · P',
          categoria: 'Vestuário',
          Tamanho: 'P',
          current_quantity: 3,
          is_for_sale: true,
          is_active: true,
          sale_price: 200,
        },
        {
          id: 'v2',
          nome: 'Kimono · M',
          categoria: 'Vestuário',
          Tamanho: 'M',
          current_quantity: 5,
          is_for_sale: true,
          is_active: true,
          sale_price: 200,
        },
      ],
    });
    expect(parents).toHaveLength(1);
    expect(parents[0].variant_count).toBe(2);
    expect(parents[0].variants.map((v) => v.id)).toEqual(['v1', 'v2']);
    expect(parents[0].canAdd).toBe(true);
    expect(parents[0]._singleVariant).toBeNull();
  });

  it('normalizeSalesCatalogFromApi keeps parents when parent is_active is false but variants are active', () => {
    const parents = normalizeSalesCatalogFromApi({
      catalog_mode: 'parent_variant',
      products: [
        {
          id: 'p1',
          nome: 'Kimono',
          is_for_sale: true,
          is_active: false,
          variants: [
            {
              id: 'v1',
              product_id: 'p1',
              nome: 'Kimono',
              size: 'M',
              current_quantity: 3,
              is_for_sale: true,
              is_active: true,
              display_label: 'Kimono · M',
            },
          ],
        },
      ],
      variants: [],
    });
    expect(parents).toHaveLength(1);
    expect(parents[0].variants[0].id).toBe('v1');
  });

  it('normalizeSalesCatalogFromApi merges nested products with flat variants', () => {
    const parents = normalizeSalesCatalogFromApi({
      catalog_mode: 'parent_variant',
      products: [
        {
          id: 'p1',
          nome: 'Kimono',
          is_for_sale: true,
          is_active: true,
          variants: [],
        },
      ],
      variants: [
        {
          id: 'v1',
          product_id: 'p1',
          nome: 'Kimono',
          size: 'M',
          current_quantity: 2,
          is_for_sale: true,
          is_active: true,
          display_label: 'Kimono · M',
        },
      ],
    });
    expect(parents).toHaveLength(1);
    expect(parents[0].variants).toHaveLength(1);
  });

  it('normalizeSalesCatalogFromApi falls back to flat variants when nested lists are empty', () => {
    const parents = normalizeSalesCatalogFromApi({
      catalog_mode: 'parent_variant',
      products: [
        {
          id: 'p1',
          nome: 'Kimono',
          is_for_sale: true,
          is_active: true,
          variants: [],
        },
      ],
      variants: [
        {
          id: 'v1',
          product_id: 'p1',
          nome: 'Kimono',
          size: 'M',
          current_quantity: 4,
          is_for_sale: true,
          is_active: true,
          display_label: 'Kimono · M',
        },
      ],
    });
    expect(parents).toHaveLength(1);
    expect(parents[0].variants).toHaveLength(1);
    expect(parents[0].variants[0].id).toBe('v1');
  });

  it('normalizeSalesCatalogFromApi enriches parent_variant products from API', () => {
    const parents = normalizeSalesCatalogFromApi({
      catalog_mode: 'parent_variant',
      products: [
        {
          id: 'p1',
          nome: 'Faixa',
          is_for_sale: true,
          is_active: true,
          variants: [
            {
              id: 'v1',
              product_id: 'p1',
              nome: 'Faixa',
              size: 'A1',
              current_quantity: 2,
              is_for_sale: true,
              is_active: true,
              display_label: 'Faixa · A1',
            },
            {
              id: 'v2',
              product_id: 'p1',
              nome: 'Faixa',
              size: 'A2',
              current_quantity: 0,
              is_for_sale: true,
              is_active: true,
              display_label: 'Faixa · A2',
            },
          ],
        },
      ],
      variants: [],
    });
    expect(parents).toHaveLength(1);
    expect(parents[0].variants).toHaveLength(2);
    expect(parents[0].variants[0].canAdd).toBe(true);
    expect(parents[0].variants[1].canAdd).toBe(false);
  });

  it('variantOptionLabel uses sku when size is empty', () => {
    expect(variantOptionLabel({ sku: 'GG', color: 'Azul' })).toBe('GG / Azul');
  });

  it('findCatalogVariantByCode matches variant sku', () => {
    const parent = enrichSalesParentRow({
      id: 'p1',
      nome: 'Kimono',
      variants: [
        enrichCatalogProduct({
          id: 'v1',
          sku: 'KIM-P',
          current_quantity: 3,
          is_for_sale: true,
          is_active: true,
          sale_price: 100,
        }),
      ],
    });
    const hit = findCatalogVariantByCode([parent], 'KIM-P');
    expect(hit.kind).toBe('variant');
    expect(hit.variant.id).toBe('v1');
  });

  it('findCatalogVariantByCode opens picker for parent sku with multiple variants', () => {
    const parent = enrichSalesParentRow({
      id: 'p1',
      nome: 'Kimono',
      sku: 'KIMONO',
      variants: [
        enrichCatalogProduct({ id: 'v1', sku: 'P', current_quantity: 2, is_for_sale: true, is_active: true }),
        enrichCatalogProduct({ id: 'v2', sku: 'M', current_quantity: 2, is_for_sale: true, is_active: true }),
      ],
    });
    const hit = findCatalogVariantByCode([parent], 'KIMONO');
    expect(hit.kind).toBe('needs_picker');
    expect(hit.parent.id).toBe('p1');
  });

  it('findCatalogVariantByCode returns not_found for unknown code', () => {
    expect(findCatalogVariantByCode([], 'XYZ')).toEqual({ kind: 'not_found' });
  });

  it('findCatalogVariantByCode flags ambiguous sku', () => {
    const parents = [
      enrichSalesParentRow({
        id: 'p1',
        nome: 'A',
        variants: [enrichCatalogProduct({ id: 'v1', sku: 'DUP', current_quantity: 1, is_for_sale: true, is_active: true })],
      }),
      enrichSalesParentRow({
        id: 'p2',
        nome: 'B',
        variants: [enrichCatalogProduct({ id: 'v2', sku: 'DUP', current_quantity: 1, is_for_sale: true, is_active: true })],
      }),
    ];
    expect(findCatalogVariantByCode(parents, 'DUP').kind).toBe('ambiguous');
  });

  it('parentNeedsVariantPicker and cartVariantOptions', () => {
    const parent = {
      id: 'p1',
      nome: 'Kimono',
      variants: [{ id: 'a' }, { id: 'b' }],
    };
    expect(parentNeedsVariantPicker(parent)).toBe(true);
    expect(cartVariantOptions(parent)).toHaveLength(2);
    expect(cartVariantOptions({ ...parent, variants: [parent.variants[0]] })).toBeNull();
  });
});
