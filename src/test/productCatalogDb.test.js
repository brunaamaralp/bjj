import { describe, it, expect } from 'vitest';
import { appendUnmigratedLegacyCatalog } from '../../lib/server/productCatalogDb.js';

describe('appendUnmigratedLegacyCatalog', () => {
  it('adiciona itens legados não migrados ao catálogo', () => {
    const legacyDocs = [
      {
        $id: 'legacy-1',
        nome: 'Kimono · M',
        categoria: 'Vestuário',
        current_quantity: 2,
        is_active: true,
        is_for_sale: true,
        migrated: false,
      },
    ];
    const { products, variants } = appendUnmigratedLegacyCatalog([], [], legacyDocs);
    expect(products).toHaveLength(1);
    expect(products[0].nome).toBe('Kimono');
    expect(products[0]._legacy).toBe(true);
    expect(variants).toHaveLength(1);
    expect(variants[0].id).toBe('legacy-1');
  });

  it('inclui legado marcado como migrado quando ainda não tem variante vinculada', () => {
    const legacyDocs = [
      {
        $id: 'legacy-1',
        nome: 'Kimono',
        categoria: 'Vestuário',
        current_quantity: 1,
        is_active: true,
        is_for_sale: true,
        migrated: true,
      },
    ];
    const { products } = appendUnmigratedLegacyCatalog([], [], legacyDocs);
    expect(products).toHaveLength(1);
    expect(products[0].nome).toBe('Kimono');
  });

  it('não duplica quando caller já filtra legado vinculado', () => {
    const { products, variants } = appendUnmigratedLegacyCatalog([], [], []);
    expect(products).toHaveLength(0);
    expect(variants).toHaveLength(0);
  });
});
