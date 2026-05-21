import { create } from 'zustand';
import { createSessionJwt } from '../lib/appwrite';
import { pickProductApiBody } from '../lib/stockProducts';
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

export const useProductsStore = create((set) => ({
  products: [],
  loading: false,
  error: null,

  loadProducts: async () => {
    set({ loading: true, error: null });
    try {
      const data = await productsFetch('/api/products');
      set({ products: data.products || [], loading: false });
      return data.products || [];
    } catch (e) {
      set({ error: String(e?.message || e), loading: false, products: [] });
      return [];
    }
  },

  createProduct: async (payload) => {
    set({ loading: true, error: null });
    try {
      const data = await productsFetch('/api/products', {
        method: 'POST',
        body: JSON.stringify({ action: 'create', ...pickProductApiBody(payload) }),
      });
      set({ loading: false });
      return data.product;
    } catch (e) {
      set({ error: String(e?.message || e), loading: false });
      return null;
    }
  },

  updateProduct: async (payload) => {
    set({ loading: true, error: null });
    try {
      const data = await productsFetch('/api/products', {
        method: 'POST',
        body: JSON.stringify({ action: 'update', ...pickProductApiBody(payload, { isEdit: true }) }),
      });
      set({ loading: false });
      return data.product;
    } catch (e) {
      set({ error: String(e?.message || e), loading: false });
      return null;
    }
  },

  deactivateProduct: async (item_id) => {
    set({ loading: true, error: null });
    try {
      const data = await productsFetch('/api/products', {
        method: 'POST',
        body: JSON.stringify({ action: 'deactivate', item_id }),
      });
      set((state) => ({
        loading: false,
        products: state.products.map((p) => (p.id === item_id ? data.product : p)),
      }));
      useInventoryStore.setState((state) => ({
        items: state.items.map((it) => (it.id === item_id ? { ...it, is_active: false } : it)),
      }));
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
      set((state) => ({
        loading: false,
        products: state.products.filter((p) => p.id !== item_id),
      }));
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
