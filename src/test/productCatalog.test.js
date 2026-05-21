import { describe, it, expect } from 'vitest';
import {
  parseBaseNameFromLegacyNome,
  parseLegacyVariantSize,
  variantDisplayLabel,
  legacyStockItemsAsParents,
  filterParentCatalog,
  findDuplicateVariantIndexes,
  variantComboKey,
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
