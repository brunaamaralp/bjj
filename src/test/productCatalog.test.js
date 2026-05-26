import { describe, it, expect } from 'vitest';
import {
  parseBaseNameFromLegacyNome,
  parseLegacyVariantSize,
  variantDisplayLabel,
  legacyStockItemsAsParents,
  filterParentCatalog,
  findDuplicateVariantIndexes,
  variantComboKey,
  applyDefaultSizePresets,
  duplicateVariantRowsFromProduct,
  findParentByProductOrVariantId,
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

  it('applyDefaultSizePresets replaces blank rows and skips existing sizes', () => {
    const rows = [{ size: 'M', color: '', initial_quantity: '0', minimum_level: '0', sku: '' }, { size: '', color: '', initial_quantity: '0', minimum_level: '0', sku: '' }];
    const out = applyDefaultSizePresets(rows, { forCreate: true });
    expect(out.some((r) => r.size === 'M')).toBe(true);
    expect(out.some((r) => r.size === 'P')).toBe(true);
    expect(out.some((r) => r.size === 'XGG')).toBe(true);
    expect(out.filter((r) => !r.size).length).toBe(0);
    const again = applyDefaultSizePresets(out, { forCreate: true });
    expect(again.length).toBe(out.length);
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
});
