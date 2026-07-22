import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('listCatalog parent_variant — coalesce legacy fetch', () => {
  const prevProducts = process.env.PRODUCTS_COL;
  const prevVariants = process.env.PRODUCT_VARIANTS_COL;
  const prevViteProducts = process.env.VITE_APPWRITE_PRODUCTS_COLLECTION_ID;
  const prevViteVariants = process.env.VITE_APPWRITE_PRODUCT_VARIANTS_COLLECTION_ID;

  beforeEach(() => {
    process.env.PRODUCTS_COL = 'col_products';
    process.env.PRODUCT_VARIANTS_COL = 'col_variants';
    delete process.env.VITE_APPWRITE_PRODUCTS_COLLECTION_ID;
    delete process.env.VITE_APPWRITE_PRODUCT_VARIANTS_COLLECTION_ID;
    vi.resetModules();
  });

  afterEach(() => {
    process.env.PRODUCTS_COL = prevProducts;
    process.env.PRODUCT_VARIANTS_COL = prevVariants;
    if (prevViteProducts == null) delete process.env.VITE_APPWRITE_PRODUCTS_COLLECTION_ID;
    else process.env.VITE_APPWRITE_PRODUCTS_COLLECTION_ID = prevViteProducts;
    if (prevViteVariants == null) delete process.env.VITE_APPWRITE_PRODUCT_VARIANTS_COLLECTION_ID;
    else process.env.VITE_APPWRITE_PRODUCT_VARIANTS_COLLECTION_ID = prevViteVariants;
    vi.resetModules();
  });

  it('lista stock items legado no máximo uma vez por GET', async () => {
    const callsByCol = {};
    const databases = {
      listDocuments: vi.fn(async (_dbId, col) => {
        callsByCol[col] = (callsByCol[col] || 0) + 1;
        if (col === 'col_products') {
          return {
            documents: [
              {
                $id: 'p1',
                academy_id: 'ac1',
                name: 'Kimono',
                category: 'Vestuário',
                is_active: true,
                is_for_sale: true,
              },
            ],
          };
        }
        if (col === 'col_variants') {
          return {
            documents: [
              {
                $id: 'v1',
                academy_id: 'ac1',
                product_id: 'p1',
                size: 'M',
                current_quantity: 1,
                is_active: true,
                legacy_stock_item_id: 'leg1',
              },
            ],
          };
        }
        if (col === 'stock_items') {
          return {
            documents: [
              {
                $id: 'leg1',
                academy_id: 'ac1',
                nome: 'Kimono · M',
                migrated: true,
                image_url: 'https://cdn.example/kimono.jpg',
              },
            ],
          };
        }
        return { documents: [] };
      }),
    };

    const { listCatalog } = await import('../../lib/server/productCatalogDb.js');
    const result = await listCatalog(databases, 'db', 'stock_items', 'ac1');

    expect(result.catalog_mode).toBe('parent_variant');
    expect(callsByCol.stock_items).toBe(1);
    expect(callsByCol.col_products).toBe(1);
    expect(callsByCol.col_variants).toBe(1);
  });

  it('marca needs_migration a partir do mesmo fetch legacy', async () => {
    const databases = {
      listDocuments: vi.fn(async (_dbId, col) => {
        if (col === 'stock_items') {
          return {
            documents: [
              {
                $id: 'leg-open',
                academy_id: 'ac1',
                nome: 'Faixa',
                migrated: false,
              },
            ],
          };
        }
        return { documents: [] };
      }),
    };

    const { listCatalog } = await import('../../lib/server/productCatalogDb.js');
    const result = await listCatalog(databases, 'db', 'stock_items', 'ac1');

    expect(result.needs_migration).toBe(true);
    expect(databases.listDocuments.mock.calls.filter((c) => c[1] === 'stock_items')).toHaveLength(1);
  });
});
