import { describe, it, expect } from 'vitest';
import {
  mergeCatalogWithInventoryItems,
  variantSizeLabel,
  parentSizeSummary,
} from '../lib/inventoryCatalogMerge.js';

describe('inventoryCatalogMerge', () => {
  it('variantSizeLabel igual produtos', () => {
    expect(variantSizeLabel({ size: 'M', color: 'Azul' })).toBe('M / Azul');
    expect(variantSizeLabel({ Tamanho: 'G' })).toBe('G');
  });

  it('mescla saldo do inventário nas variantes', () => {
    const parents = mergeCatalogWithInventoryItems(
      [
        {
          id: 'p1',
          nome: 'Kimono',
          categoria: 'Vestuário',
          variants: [
            { id: 'v1', size: 'P', current_quantity: 0 },
            { id: 'v2', size: 'M', current_quantity: 0 },
          ],
        },
      ],
      [
        { id: 'v1', current_quantity: 3, minimum_level: 1, status: 'ok' },
        { id: 'v2', current_quantity: 0, minimum_level: 2, status: 'critical' },
      ]
    );
    expect(parents[0].hasVariants).toBe(true);
    expect(parents[0].variants[0].current_quantity).toBe(3);
    expect(parents[0].variants[1].current_quantity).toBe(0);
    expect(parentSizeSummary(parents[0])).toBe('P, M');
  });

  it('recalcula status ao mesclar (ignora status desatualizado da API)', () => {
    const parents = mergeCatalogWithInventoryItems(
      [
        {
          id: 'p1',
          nome: 'Kimono',
          variants: [{ id: 'v1', size: 'M', current_quantity: 5, minimum_level: 10, status: 'ok' }],
        },
      ],
      [{ id: 'v1', current_quantity: 5, minimum_level: 10, status: 'ok' }]
    );
    expect(parents[0].variants[0].status).toBe('reorder');
    expect(parents[0].status).toBe('reorder');
  });

  it('não reexibe variantes órfãs de produto excluído', () => {
    const parents = mergeCatalogWithInventoryItems(
      [{ id: 'p1', nome: 'Kimono', variants: [{ id: 'v1', size: 'M' }] }],
      [
        { id: 'v1', current_quantity: 2, product_id: 'p1' },
        { id: 'v-old', current_quantity: 5, product_id: 'deleted-parent' },
        { id: 'legacy-1', nome: 'Faixa antiga', current_quantity: 1 },
      ]
    );
    expect(parents).toHaveLength(2);
    const kimono = parents.find((p) => p.id === 'p1');
    expect(kimono?.variants.map((v) => v.id)).toEqual(['v1']);
    expect(parents.some((p) => (p.variants || []).some((v) => v.id === 'v-old'))).toBe(false);
    expect(parents.some((p) => p.variants?.[0]?.id === 'legacy-1')).toBe(true);
  });

  it('ignora produto pai sem variantes válidas', () => {
    const parents = mergeCatalogWithInventoryItems(
      [
        { id: 'p-empty', nome: 'Sem SKU', variants: [] },
        { id: 'p1', nome: 'Kimono', variants: [{ id: 'v1', size: 'M' }] },
      ],
      [{ id: 'v1', current_quantity: 2 }]
    );
    expect(parents).toHaveLength(1);
    expect(parents[0].id).toBe('p1');
  });

  it('não duplica catálogo + legado vinculado por legacy_stock_item_id', () => {
    const parents = mergeCatalogWithInventoryItems(
      [
        {
          id: 'p1',
          nome: 'Kimono',
          variants: [{ id: 'v-new', size: 'M', legacy_stock_item_id: 'legacy-1' }],
        },
      ],
      [
        { id: 'v-new', current_quantity: 2, product_id: 'p1' },
        { id: 'legacy-1', nome: 'Kimono · M', current_quantity: 2 },
      ]
    );
    expect(parents).toHaveLength(1);
    expect(parents[0].variants.map((v) => v.id)).toEqual(['v-new']);
  });

  it('unifica pai real e stub órfão com o mesmo nome', () => {
    const parents = mergeCatalogWithInventoryItems(
      [
        { id: 'p-real', nome: 'Kimono', variants: [{ id: 'v1', size: 'P' }] },
        { id: 'deleted-parent', nome: 'Kimono', variants: [{ id: 'v2', size: 'M' }] },
      ],
      [
        { id: 'v1', current_quantity: 1, product_id: 'p-real' },
        { id: 'v2', current_quantity: 2, product_id: 'deleted-parent' },
      ]
    );
    expect(parents).toHaveLength(1);
    expect(parents[0].id).toBe('p-real');
    expect(parents[0].variants.map((v) => v.id).sort()).toEqual(['v1', 'v2']);
  });
});
