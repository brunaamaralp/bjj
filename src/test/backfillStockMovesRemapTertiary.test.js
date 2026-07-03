import { describe, expect, it } from 'vitest';
import {
  buildOldProductSizeSets,
  matchVariantsByProductSize,
  normStockSize,
  resolveOrphanStockId,
} from '../lib/backfillStockMovesRemapTertiary.js';

describe('backfillStockMovesRemapTertiary', () => {
  it('normStockSize trata ÚNICO como vazio', () => {
    expect(normStockSize('ÚNICO')).toBe('');
    expect(normStockSize('G')).toBe('g');
  });

  it('resolveOrphanStockId via stock_item fuzzy prefix', () => {
    const variants = [
      { $id: 'v1', product_id: 'p1', size: 'P', legacy_stock_item_id: 'si1' },
      { $id: 'v2', product_id: 'p1', size: 'G' },
    ];
    const stockItems = [{ $id: 'si1', nome: 'CAMISA GBLP V1 INF · P' }];
    const products = [{ $id: 'p1', name: 'CAMISA GBLP V1 INF PRETA' }];
    const ctx = {
      variants,
      oldVariants: [],
      stockItems,
      products,
      variantIds: new Set(['v1', 'v2']),
      legacyByStockId: new Map([['si1', [variants[0]]]]),
      stockItemById: new Map([['si1', stockItems[0]]]),
      productNameById: new Map([['p1', 'CAMISA GBLP V1 INF PRETA']]),
      oldVariantById: new Map(),
    };
    expect(resolveOrphanStockId('si1', ctx)).toEqual({ id: 'v1', method: 'legacy_stock_item_id' });
  });

  it('resolveOrphanStockId via old product size-set', () => {
    const variants = [
      { $id: 'nv1', product_id: 'np1', size: 'G' },
      { $id: 'nv2', product_id: 'np1', size: 'M' },
      { $id: 'nv3', product_id: 'np2', size: 'G' },
    ];
    const oldVariants = [
      { $id: 'ov1', product_id: 'op1', size: 'G' },
      { $id: 'ov2', product_id: 'op1', size: 'M' },
      { $id: 'ov3', product_id: 'op1', size: 'P' },
    ];
    const ctx = {
      variants,
      oldVariants,
      stockItems: [],
      products: [],
      variantIds: new Set(variants.map((v) => v.$id)),
      legacyByStockId: new Map(),
      oldVariantById: new Map(oldVariants.map((o) => [o.$id, o])),
      oldProductSizeSets: buildOldProductSizeSets(oldVariants),
      newProductSizeSets: new Map([['np1', new Set(['g', 'm', 'p'])], ['np2', new Set(['g'])]]),
      stockItemById: new Map(),
      productNameById: new Map(),
      oldProductToNew: new Map(),
      oldProductBridge: new Map(),
    };
    const resolved = resolveOrphanStockId('ov1', ctx);
    expect(resolved?.method).toBe('old_product_size_set');
    expect(resolved?.id).toBe('nv1');
  });

  it('matchVariantsByProductSize ignora cor quando não informada', () => {
    const variants = [
      { $id: 'a', product_id: 'p', size: '50', color: 'Azul' },
      { $id: 'b', product_id: 'p', size: '50', color: 'Preto' },
    ];
    expect(matchVariantsByProductSize(variants, 'p', '50')).toHaveLength(2);
    expect(matchVariantsByProductSize(variants, 'p', '50', 'Azul')).toHaveLength(1);
  });
});
