import { describe, it, expect } from 'vitest';
import {
  buildLegacyStockMoveRemapPlan,
  indexVariantsByLegacyId,
  summarizeLegacyRemapPlan,
} from '../lib/backfillStockMovesRemapLegacy.js';

describe('backfillStockMovesRemapLegacy', () => {
  it('indexVariantsByLegacyId agrupa por legacy_stock_item_id', () => {
    const map = indexVariantsByLegacyId([
      { $id: 'v1', legacy_stock_item_id: 'leg-a' },
      { $id: 'v2', legacy_stock_item_id: 'leg-a' },
    ]);
    expect(map.get('leg-a')).toHaveLength(2);
  });

  it('buildLegacyStockMoveRemapPlan remapeia movimento no legacy id', () => {
    const variants = [{ $id: 'v-new', legacy_stock_item_id: 'leg-old', product_id: 'p1', size: 'M' }];
    const moves = [{ $id: 'm1', item_estoque_id: 'leg-old', tipo: 'entrada', quantidade: 2 }];
    const { plan, skipped } = buildLegacyStockMoveRemapPlan(variants, moves);
    expect(plan).toHaveLength(1);
    expect(plan[0].to_item_estoque_id).toBe('v-new');
    expect(plan[0].from_item_estoque_id).toBe('leg-old');
    expect(skipped).toHaveLength(0);
  });

  it('ignora movimento já no id da variante', () => {
    const variants = [{ $id: 'v-new', legacy_stock_item_id: 'leg-old' }];
    const moves = [{ $id: 'm1', item_estoque_id: 'v-new', tipo: 'entrada', quantidade: 1 }];
    const { plan, skipped } = buildLegacyStockMoveRemapPlan(variants, moves);
    expect(plan).toHaveLength(0);
    expect(skipped.some((s) => s.reason === 'already_on_variant')).toBe(true);
  });

  it('ignora legacy ambíguo (duas variantes)', () => {
    const variants = [
      { $id: 'v1', legacy_stock_item_id: 'leg-x' },
      { $id: 'v2', legacy_stock_item_id: 'leg-x' },
    ];
    const moves = [{ $id: 'm1', item_estoque_id: 'leg-x', tipo: 'saida_venda', quantidade: 1 }];
    const { plan, skipped } = buildLegacyStockMoveRemapPlan(variants, moves);
    expect(plan).toHaveLength(0);
    expect(skipped.some((s) => s.reason === 'ambiguous_legacy')).toBe(true);
  });

  it('summarizeLegacyRemapPlan conta variantes distintas', () => {
    const plan = [
      { to_item_estoque_id: 'v1', from_item_estoque_id: 'l1' },
      { to_item_estoque_id: 'v1', from_item_estoque_id: 'l1' },
      { to_item_estoque_id: 'v2', from_item_estoque_id: 'l2' },
    ];
    const s = summarizeLegacyRemapPlan(plan, []);
    expect(s.moves_to_remap).toBe(3);
    expect(s.variants_affected).toBe(2);
  });
});
