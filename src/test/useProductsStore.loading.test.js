import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/appwrite.js', () => ({
  createSessionJwt: vi.fn(),
}));

vi.mock('../store/useLeadStore.js', () => ({
  useLeadStore: {
    getState: () => ({ academyId: 'academy-1' }),
  },
}));

vi.mock('../store/useInventoryStore.js', () => ({
  useInventoryStore: {
    setState: vi.fn(),
  },
}));

vi.mock('../lib/salesCatalogRefresh.js', () => ({
  dispatchRefreshSalesCatalog: vi.fn(),
}));

import { createSessionJwt } from '../lib/appwrite.js';
import { useProductsStore } from '../store/useProductsStore.js';

function catalogResponse(overrides = {}) {
  return {
    ok: true,
    json: async () => ({
      sucesso: true,
      catalog_mode: 'parent_variant',
      needs_migration: false,
      products: [
        {
          id: 'p1',
          nome: 'Kimono',
          categoria: 'Vestuário',
          is_for_sale: true,
          is_active: true,
          lifecycle: 'ativo',
          variants: [],
        },
      ],
      variants: [],
      ...overrides,
    }),
  };
}

function resetStore() {
  useProductsStore.setState({
    products: [],
    variants: [],
    catalogMode: 'legacy',
    needsMigration: false,
    loading: false,
    error: null,
  });
}

describe('useProductsStore loading vs mutações', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    createSessionJwt.mockResolvedValue('jwt-test');
    global.fetch = vi.fn();
  });

  it('loadProducts inicial liga loading; refresh com catálogo já carregado não liga', async () => {
    global.fetch.mockResolvedValue(catalogResponse());

    const first = useProductsStore.getState().loadProducts();
    expect(useProductsStore.getState().loading).toBe(true);
    await first;
    expect(useProductsStore.getState().loading).toBe(false);
    expect(useProductsStore.getState().products).toHaveLength(1);

    const seenLoadingTrue = [];
    const unsub = useProductsStore.subscribe((s) => {
      if (s.loading) seenLoadingTrue.push(true);
    });
    await useProductsStore.getState().loadProducts();
    unsub();

    expect(seenLoadingTrue).toEqual([]);
    expect(useProductsStore.getState().loading).toBe(false);
  });

  it('createProduct não liga loading quando já há produtos na lista', async () => {
    global.fetch
      .mockResolvedValueOnce(catalogResponse())
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sucesso: true, product: { id: 'p2' } }),
      })
      .mockResolvedValueOnce(catalogResponse());

    await useProductsStore.getState().loadProducts();
    expect(useProductsStore.getState().loading).toBe(false);

    const seenLoadingTrue = [];
    const unsub = useProductsStore.subscribe((s) => {
      if (s.loading) seenLoadingTrue.push(true);
    });

    await useProductsStore.getState().createProduct({
      nome: 'Faixa',
      categoria: 'Acessórios',
      sale_price: 50,
      is_for_sale: true,
      is_active: true,
    });
    unsub();

    expect(seenLoadingTrue).toEqual([]);
    expect(useProductsStore.getState().loading).toBe(false);
  });

  it('updateProduct não liga loading quando já há produtos na lista', async () => {
    global.fetch
      .mockResolvedValueOnce(catalogResponse())
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sucesso: true, product: { id: 'p1' } }),
      })
      .mockResolvedValueOnce(catalogResponse());

    await useProductsStore.getState().loadProducts();

    const seenLoadingTrue = [];
    const unsub = useProductsStore.subscribe((s) => {
      if (s.loading) seenLoadingTrue.push(true);
    });

    await useProductsStore.getState().updateProduct({
      product_id: 'p1',
      nome: 'Kimono A1',
      categoria: 'Vestuário',
      sale_price: 199,
      is_for_sale: true,
      is_active: true,
    });
    unsub();

    expect(seenLoadingTrue).toEqual([]);
  });
});
