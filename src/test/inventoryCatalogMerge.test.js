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
});
