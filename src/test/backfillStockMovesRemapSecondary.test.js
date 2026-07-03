import { describe, it, expect } from 'vitest';
import {
  bootstrapOldProductToNewProduct,
  buildSecondaryStockMoveRemapPlan,
  indexVariantsByLegacyId,
  summarizeSecondaryRemapPlan,
} from '../lib/backfillStockMovesRemapSecondary.js';

describe('backfillStockMovesRemapSecondary', () => {
  it('indexVariantsByLegacyId agrupa por legacy_stock_item_id', () => {
    const map = indexVariantsByLegacyId([{ $id: 'v1', legacy_stock_item_id: 'leg-a' }]);
    expect(map.get('leg-a')).toHaveLength(1);
  });

  it('bootstrapOldProductToNewProduct infere produto antigo→novo', () => {
    const legacyByStockId = indexVariantsByLegacyId([
      { $id: 'v-new', product_id: 'p-new', legacy_stock_item_id: 'si-1' },
    ]);
    const oldVariants = [
      { $id: 'ov-linked', product_id: 'p-old', legacy_stock_item_id: 'si-1' },
      { $id: 'ov-sibling', product_id: 'p-old', size: 'M' },
    ];
    const map = bootstrapOldProductToNewProduct(oldVariants, legacyByStockId);
    expect(map.get('p-old')).toBe('p-new');
  });

  it('remapeia movimento em variante antiga via legacy_stock_item_id', () => {
    const variants = [{ $id: 'v-new', product_id: 'p1', legacy_stock_item_id: 'si-1', size: 'M' }];
    const oldVariants = [{ $id: 'ov-old', product_id: 'p-old', legacy_stock_item_id: 'si-1', size: 'M' }];
    const moves = [{ $id: 'm1', item_estoque_id: 'ov-old', tipo: 'entrada', quantidade: 1 }];
    const { plan } = buildSecondaryStockMoveRemapPlan({ variants, oldVariants, moves });
    expect(plan).toHaveLength(1);
    expect(plan[0].to_item_estoque_id).toBe('v-new');
    expect(plan[0].match_method).toBe('old_variant_via_legacy');
  });

  it('remapeia stock_item via nome+tamanho parseado', () => {
    const products = [{ $id: 'p1', name: 'Camisa GBLP V1 FEM' }];
    const variants = [{ $id: 'v-g', product_id: 'p1', size: 'G' }];
    const stockItems = [{ $id: 'si-1', nome: 'Camisa GBLP V1 FEM · G' }];
    const moves = [{ $id: 'm1', item_estoque_id: 'si-1', tipo: 'saida_venda', quantidade: 1 }];
    const { plan } = buildSecondaryStockMoveRemapPlan({ variants, stockItems, products, moves });
    expect(plan).toHaveLength(1);
    expect(plan[0].match_method).toBe('stock_item_name_size');
  });

  it('ignora match ambíguo', () => {
    const variants = [
      { $id: 'v1', legacy_stock_item_id: 'si-x' },
      { $id: 'v2', legacy_stock_item_id: 'si-x' },
    ];
    const moves = [{ $id: 'm1', item_estoque_id: 'si-x', tipo: 'entrada', quantidade: 1 }];
    const { plan, skipped } = buildSecondaryStockMoveRemapPlan({ variants, moves });
    expect(plan).toHaveLength(0);
    expect(skipped.some((s) => s.reason === 'ambiguous_direct_legacy')).toBe(true);
  });

  it('summarizeSecondaryRemapPlan agrupa por método', () => {
    const plan = [
      { to_item_estoque_id: 'v1', from_item_estoque_id: 'a', match_method: 'direct_legacy' },
      { to_item_estoque_id: 'v1', from_item_estoque_id: 'b', match_method: 'direct_legacy' },
    ];
    const s = summarizeSecondaryRemapPlan(plan, [], []);
    expect(s.moves_to_remap).toBe(2);
    expect(s.by_method.direct_legacy).toBe(2);
  });
});
