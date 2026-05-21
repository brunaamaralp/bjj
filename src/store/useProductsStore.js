import { create } from 'zustand';
import { createSessionJwt } from '../lib/appwrite';
import { pickProductApiBody } from '../lib/stockProducts';
import { legacyStockItemsAsParents } from '../lib/productCatalog';
import { useLeadStore } from './useLeadStore';
import { useInventoryStore } from './useInventoryStore';

async function productsFetch(path, options = {}) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');
  const academyId = useLeadStore.getState().academyId;
  if (!academyId) throw new Error('academy_required');

  const res = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      'x-academy-id': academyId,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.erro || data.error || `error_${res.status}`);
  }
  return data;
}

function normalizeCatalogResponse(data) {
  const catalogMode = data.catalog_mode || 'legacy';
  const variants = data.variants || data.products || [];
  let parentProducts = data.products || [];

  if (catalogMode === 'legacy' && parentProducts.length && !parentProducts[0]?.variants) {
    parentProducts = legacyStockItemsAsParents(parentProducts);
  }

  return {
    catalogMode,
    parentProducts,
    variants,
    needsMigration: Boolean(data.needs_migration),
  };
}

export const useProductsStore = create((set, get) => ({
  products: [],
  variants: [],
  catalogMode: 'legacy',
  needsMigration: false,
  loading: false,
  error: null,

  loadProducts: async () => {
    set({ loading: true, error: null });
    try {
      let data = await productsFetch('/api/products');
      let normalized = normalizeCatalogResponse(data);

      if (normalized.needsMigration) {
        try {
          data = await productsFetch('/api/products', {
            method: 'POST',
            body: JSON.stringify({ action: 'migrate' }),
          });
          normalized = normalizeCatalogResponse(data);
        } catch (migrateErr) {
          console.warn('[products] migrate:', migrateErr?.message || migrateErr);
        }
      }

      set({
        products: normalized.parentProducts,
        variants: normalized.variants,
        catalogMode: normalized.catalogMode,
        needsMigration: normalized.needsMigration,
        loading: false,
      });
      return normalized.parentProducts;
    } catch (e) {
      set({ error: String(e?.message || e), loading: false, products: [], variants: [] });
      return [];
    }
  },

  createProduct: async (payload) => {
    set({ loading: true, error: null });
    try {
      const body =
        Array.isArray(payload.variants) && payload.variants.length
          ? {
              action: 'create',
              name: payload.nome,
              description: payload.descricao,
              category: payload.categoria,
              sale_price: payload.sale_price,
              cost_price: payload.cost_price,
              type: payload.type || (payload.is_for_sale === false ? 'supply' : 'sale'),
              is_for_sale: payload.is_for_sale,
              is_active: payload.is_active,
              image_url: payload.image_url,
              unit: payload.unit,
              variants: payload.variants,
            }
          : { action: 'create', ...pickProductApiBody(payload) };

      const data = await productsFetch('/api/products', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      set({ loading: false });
      await get().loadProducts();
      return data.product;
    } catch (e) {
      set({ error: String(e?.message || e), loading: false });
      return null;
    }
  },

  updateProduct: async (payload) => {
    set({ loading: true, error: null });
    try {
      const isParent = Boolean(payload.product_id);
      const body = isParent
        ? {
            action: 'update',
            product_id: payload.product_id,
            name: payload.nome,
            description: payload.descricao,
            category: payload.categoria,
            sale_price: payload.sale_price,
            cost_price: payload.cost_price,
            type: payload.type,
            is_for_sale: payload.is_for_sale,
            is_active: payload.is_active,
            image_url: payload.image_url,
          }
        : { action: 'update', ...pickProductApiBody(payload, { isEdit: true }) };

      const data = await productsFetch('/api/products', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      set({ loading: false });
      await get().loadProducts();
      return data.product;
    } catch (e) {
      set({ error: String(e?.message || e), loading: false });
      return null;
    }
  },

  deactivateProduct: async (item_id, { product_id } = {}) => {
    set({ loading: true, error: null });
    try {
      const data = await productsFetch('/api/products', {
        method: 'POST',
        body: JSON.stringify({
          action: 'deactivate',
          item_id,
          product_id: product_id || undefined,
        }),
      });
      await get().loadProducts();
      set({ loading: false });
      if (item_id) {
        useInventoryStore.setState((state) => ({
          items: state.items.map((it) =>
            it.id === item_id ? { ...it, is_active: false } : it
          ),
        }));
      }
      return data.product;
    } catch (e) {
      set({ error: String(e?.message || e), loading: false });
      return null;
    }
  },

  checkDeleteProduct: async (item_id) => {
    try {
      const data = await productsFetch('/api/products', {
        method: 'POST',
        body: JSON.stringify({ action: 'check_delete', item_id }),
      });
      return {
        has_sales: Boolean(data.has_sales),
        can_delete: Boolean(data.can_delete),
        current_quantity: Number(data.current_quantity) || 0,
      };
    } catch (e) {
      set({ error: String(e?.message || e) });
      return null;
    }
  },

  saveProductVariants: async ({ product_id, variants, delete_variant_ids, unit }) => {
    set({ loading: true, error: null });
    try {
      const data = await productsFetch('/api/products', {
        method: 'POST',
        body: JSON.stringify({
          action: 'save_variants',
          product_id,
          variants: variants || [],
          delete_variant_ids: delete_variant_ids || [],
          unit: unit || 'unidade',
        }),
      });
      if (data.code === 'duplicate_combo') {
        set({ loading: false });
        return {
          ok: false,
          duplicate_indexes: data.duplicate_indexes || [],
          erro: data.erro || 'Combinação já existe',
        };
      }
      await get().loadProducts();
      set({ loading: false });
      return {
        ok: true,
        saved: data.saved ?? 0,
        errors: data.errors || [],
        product: data.product,
      };
    } catch (e) {
      const err = String(e?.message || e);
      set({ error: err, loading: false });
      return { ok: false, erro: err };
    }
  },

  deleteProduct: async (item_id) => {
    set({ loading: true, error: null });
    try {
      const data = await productsFetch('/api/products', {
        method: 'POST',
        body: JSON.stringify({ action: 'delete', item_id }),
      });
      if (data?.sucesso === false) {
        const err = String(data.erro || data.error || 'Erro ao excluir produto');
        set({ error: err, loading: false });
        return { ok: false, error: err, has_sales: Boolean(data.has_sales) };
      }
      await get().loadProducts();
      set({ loading: false });
      useInventoryStore.setState((state) => ({
        items: state.items.filter((it) => it.id !== item_id),
      }));
      return { ok: true };
    } catch (e) {
      const err = String(e?.message || e);
      set({ error: err, loading: false });
      return { ok: false, error: err };
    }
  },
}));
