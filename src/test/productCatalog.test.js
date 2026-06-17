import { describe, it, expect } from 'vitest';
import {
  parseBaseNameFromLegacyNome,
  parseLegacyVariantSize,
  variantDisplayLabel,
  legacyStockItemsAsParents,
  normalizeProductsCatalogFromApi,
  parentRowsFromFlatVariants,
  stubParentsForOrphanVariants,
  filterParentCatalog,
  findDuplicateVariantIndexes,
  findDuplicateVariantIds,
  variantComboKey,
  duplicateVariantRowsFromProduct,
  findParentByProductOrVariantId,
  normalizeVariantsInput,
} from '../lib/productCatalog.js';

describe('productCatalog', () => {
  it('parseBaseNameFromLegacyNome splits on middle dot', () => {
    expect(parseBaseNameFromLegacyNome('Camisa GBLP V1 FEM · G')).toBe('Camisa GBLP V1 FEM');
    expect(parseBaseNameFromLegacyNome('Boné')).toBe('Boné');
  });

  it('parseLegacyVariantSize prefers Tamanho field', () => {
    expect(parseLegacyVariantSize({ nome: 'X · G', Tamanho: 'M' })).toBe('M');
    expect(parseLegacyVariantSize({ nome: 'X · G' })).toBe('G');
    expect(parseLegacyVariantSize({ nome: 'X' })).toBe('Único');
  });

  it('variantDisplayLabel combines size and color', () => {
    expect(variantDisplayLabel('Camisa', { size: 'G', color: 'Azul' })).toBe('Camisa · G / Azul');
  });

  it('legacyStockItemsAsParents groups by base name', () => {
    const items = [
      { id: '1', nome: 'Kimono', categoria: 'Vestuário', sale_price: 100, is_for_sale: true, is_active: true, current_quantity: 2, minimum_level: 0, lifecycle: 'ativo', Tamanho: 'P' },
      { id: '2', nome: 'Kimono', categoria: 'Vestuário', sale_price: 100, is_for_sale: true, is_active: true, current_quantity: 1, minimum_level: 0, lifecycle: 'ativo', Tamanho: 'M' },
    ];
    const parents = legacyStockItemsAsParents(items);
    expect(parents).toHaveLength(1);
    expect(parents[0].nome).toBe('Kimono');
    expect(parents[0].variants).toHaveLength(2);
    expect(parents[0].total_quantity).toBe(3);
  });

  it('findDuplicateVariantIndexes detects same size+color', () => {
    const rows = [
      { size: 'M', color: 'Azul' },
      { size: 'G', color: '' },
      { size: 'm', color: 'azul' },
    ];
    const dup = findDuplicateVariantIndexes(rows);
    expect(dup.has(0)).toBe(true);
    expect(dup.has(2)).toBe(true);
    expect(variantComboKey('M', 'Azul')).toBe(variantComboKey('m', 'azul'));
  });

  it('findDuplicateVariantIndexes ignores rows marked for deletion', () => {
    const rows = [
      { id: 'a', size: 'M', color: '' },
      { id: 'b', size: 'M', color: '', _pendingDelete: true },
    ];
    expect(findDuplicateVariantIndexes(rows).size).toBe(0);
  });

  it('findDuplicateVariantIds detects persisted duplicates', () => {
    const dupIds = findDuplicateVariantIds([
      { id: 'v1', size: 'P' },
      { id: 'v2', size: 'M' },
      { id: 'v3', size: 'p' },
    ]);
    expect(dupIds.has('v1')).toBe(true);
    expect(dupIds.has('v3')).toBe(true);
    expect(dupIds.has('v2')).toBe(false);
  });

  it('duplicateVariantRowsFromProduct copies sizes without stock', () => {
    const rows = duplicateVariantRowsFromProduct({
      variants: [
        { size: 'M', color: 'Azul', minimum_level: 2, current_quantity: 5 },
        { size: 'G', minimum_level: 1, current_quantity: 3 },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.initial_quantity === '0')).toBe(true);
    expect(rows.some((r) => r.size === 'M' && r.color === 'Azul')).toBe(true);
  });

  it('findParentByProductOrVariantId resolves parent from variant id', () => {
    const products = [
      {
        id: 'parent-1',
        nome: 'Kimono',
        variants: [{ id: 'var-m', size: 'M' }, { id: 'var-g', size: 'G' }],
      },
    ];
    expect(findParentByProductOrVariantId(products, 'parent-1')?.id).toBe('parent-1');
    expect(findParentByProductOrVariantId(products, 'var-g')?.id).toBe('parent-1');
    expect(findParentByProductOrVariantId(products, 'missing')).toBeNull();
  });

  it('normalizeVariantsInput includes price_override when mask is set', () => {
    const out = normalizeVariantsInput([
      {
        size: 'M',
        color: '',
        sku: '',
        initial_quantity: '0',
        minimum_level: '0',
        priceOverrideMask: 'R$ 10,00',
      },
    ]);
    expect(out[0].price_override).toBe(10);
    const empty = normalizeVariantsInput([
      { size: 'G', color: '', sku: '', initial_quantity: '0', minimum_level: '0', priceOverrideMask: '' },
    ]);
    expect(empty[0].price_override).toBeUndefined();
  });

  it('filterParentCatalog status sem_estoque uses all variants', () => {
    const parents = [
      {
        nome: 'A',
        categoria: 'C',
        is_for_sale: true,
        lifecycle: 'sem_estoque',
        variants: [{ lifecycle: 'sem_estoque' }],
      },
      {
        nome: 'B',
        categoria: 'C',
        is_for_sale: true,
        lifecycle: 'ativo',
        variants: [{ lifecycle: 'ativo' }],
      },
    ];
    expect(filterParentCatalog(parents, { statusFilter: 'sem_estoque' })).toHaveLength(1);
    expect(filterParentCatalog(parents, { statusFilter: 'ativo' })).toHaveLength(1);
  });

  it('parentRowsFromFlatVariants monta pais quando products[] vem vazio', () => {
    const parents = parentRowsFromFlatVariants([
      {
        id: 'v1',
        product_id: 'parent-1',
        nome: 'Kimono',
        categoria: 'Vestuário',
        size: 'M',
        current_quantity: 2,
        minimum_level: 0,
        lifecycle: 'ativo',
        is_active: true,
        is_for_sale: true,
      },
    ]);
    expect(parents).toHaveLength(1);
    expect(parents[0].id).toBe('parent-1');
    expect(parents[0].variants).toHaveLength(1);
  });

  it('normalizeProductsCatalogFromApi usa variantes planas em parent_variant', () => {
    const out = normalizeProductsCatalogFromApi({
      catalog_mode: 'parent_variant',
      products: [],
      variants: [
        {
          id: 'v1',
          product_id: 'p1',
          nome: 'Kimono',
          categoria: 'Vestuário',
          size: 'M',
          current_quantity: 1,
          lifecycle: 'ativo',
          is_active: true,
          is_for_sale: true,
        },
      ],
    });
    expect(out.parentProducts).toHaveLength(1);
    expect(out.parentProducts[0].nome).toBe('Kimono');
  });

  it('stubParentsForOrphanVariants ignora pais já conhecidos', () => {
    const stubs = stubParentsForOrphanVariants(
      [{ id: 'v1', product_id: 'p1', nome: 'Kimono', categoria: 'Vestuário' }],
      new Set(['p1'])
    );
    expect(stubs).toHaveLength(0);
  });
});
