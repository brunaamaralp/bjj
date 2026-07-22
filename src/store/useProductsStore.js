import { create } from 'zustand';
import { createSessionJwt } from '../lib/appwrite';
import { pickProductApiBody } from '../lib/stockProducts';
import { normalizeProductsCatalogFromApi } from '../lib/productCatalog';
import { useLeadStore } from './useLeadStore';
import { useInventoryStore } from './useInventoryStore';
import { dispatchRefreshSalesCatalog } from '../lib/salesCatalogRefresh.js';
import { friendlyError } from '../lib/errorMessages.js';

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

export const useProductsStore = create((set, get) => ({
  products: [],
  variants: [],
  catalogMode: 'legacy',
  needsMigration: false,
  loading: false,
  error: null,

  loadProducts: async () => {
    // Skeleton só no primeiro load (lista vazia). Refresh/mutação mantém a tabela montada.
    const isInitial = get().products.length === 0;
    if (isInitial) set({ loading: true, error: null });
    else set({ error: null });
    try {
      let data = await productsFetch('/api/products');
      let normalized = normalizeProductsCatalogFromApi(data);

      if (normalized.needsMigration) {
        try {
          data = await productsFetch('/api/products', {
            method: 'POST',
            body: JSON.stringify({ action: 'migrate' }),
          });
          normalized = normalizeProductsCatalogFromApi(data);
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
      if (isInitial) {
        set({ error: friendlyError(e, 'load'), loading: false, products: [], variants: [] });
      } else {
        set({ error: friendlyError(e, 'load'), loading: false });
      }
      return isInitial ? [] : get().products;
    }
  },

  createProduct: async (payload) => {
    set({ error: null });
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
      await get().loadProducts();
      return data.product;
    } catch (e) {
      set({ error: friendlyError(e, 'save') });
      return null;
    }
  },

  updateProduct: async (payload) => {
    set({ error: null });
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
            supplier: payload.supplier,
          }
        : { action: 'update', ...pickProductApiBody(payload, { isEdit: true }) };

      const data = await productsFetch('/api/products', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      await get().loadProducts();
      return data.product;
    } catch (e) {
      set({ error: friendlyError(e, 'save') });
      return null;
    }
  },

  deactivateProduct: async (item_id, { product_id } = {}) => {
    set({ error: null });
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
      if (item_id) {
        useInventoryStore.setState((state) => ({
          items: state.items.map((it) =>
            it.id === item_id ? { ...it, is_active: false } : it
          ),
        }));
      }
      return data.product;
    } catch (e) {
      set({ error: friendlyError(e, 'save') });
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
        has_stock_moves: Boolean(data.has_stock_moves),
        can_delete: Boolean(data.can_delete),
        current_quantity: Number(data.current_quantity) || 0,
      };
    } catch (e) {
      set({ error: friendlyError(e, 'action') });
      return null;
    }
  },

  saveProductVariants: async ({ product_id, variants, delete_variant_ids, unit }) => {
    set({ error: null });
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
        return {
          ok: false,
          duplicate_indexes: data.duplicate_indexes || [],
          erro: data.erro || 'Combinação já existe',
        };
      }
      await get().loadProducts();
      dispatchRefreshSalesCatalog();
      return {
        ok: true,
        saved: data.saved ?? 0,
        errors: data.errors || [],
        product: data.product,
      };
    } catch (e) {
      const err = friendlyError(e, 'save');
      set({ error: err });
      return { ok: false, erro: err };
    }
  },

  deleteProduct: async (item_id) => {
    set({ error: null });
    try {
      const data = await productsFetch('/api/products', {
        method: 'POST',
        body: JSON.stringify({ action: 'delete', item_id }),
      });
      if (data?.sucesso === false) {
        const err = friendlyError(data.erro || data.error || 'delete_failed', 'delete');
        set({ error: err });
        return { ok: false, error: err, has_sales: Boolean(data.has_sales) };
      }
      await get().loadProducts();
      useInventoryStore.setState((state) => ({
        items: state.items.filter((it) => it.id !== item_id),
      }));
      return { ok: true };
    } catch (e) {
      const err = friendlyError(e, 'delete');
      set({ error: err });
      return { ok: false, error: err };
    }
  },
}));
