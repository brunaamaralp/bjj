import { create } from 'zustand';
import { createSessionJwt } from '../lib/appwrite';
import { useLeadStore } from './useLeadStore';

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
        body: JSON.stringify({ action: 'create', ...payload }),
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
        body: JSON.stringify({ action: 'update', ...payload }),
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
      set({ loading: false });
      return data.product;
    } catch (e) {
      set({ error: String(e?.message || e), loading: false });
      return null;
    }
  },
}));
