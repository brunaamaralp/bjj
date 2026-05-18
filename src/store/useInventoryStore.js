import { create } from 'zustand';
import { createSessionJwt } from '../lib/appwrite';
import { useLeadStore } from './useLeadStore';

async function inventoryFetch(path, options = {}) {
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

export const useInventoryStore = create((set) => ({
  items: [],
  lastResult: null,
  loading: false,
  error: null,

  loadItems: async () => {
    set({ loading: true, error: null });
    try {
      const data = await inventoryFetch('/api/inventory');
      set({ items: data.items || [], loading: false });
      return data.items || [];
    } catch (e) {
      set({ error: String(e?.message || e), loading: false, items: [] });
      return [];
    }
  },

  inventoryMove: async (payload) => {
    set({ loading: true, error: null });
    try {
      const data = await inventoryFetch('/api/inventory', {
        method: 'POST',
        body: JSON.stringify({ action: 'move', ...payload }),
      });
      set({ lastResult: data, loading: false });
      return data;
    } catch (e) {
      set({ error: String(e?.message || e), lastResult: null, loading: false });
      return null;
    }
  },

  updateItem: async (payload) => {
    set({ loading: true, error: null });
    try {
      const data = await inventoryFetch('/api/inventory', {
        method: 'POST',
        body: JSON.stringify({ action: 'update_item', ...payload }),
      });
      set({ loading: false });
      return data.item;
    } catch (e) {
      set({ error: String(e?.message || e), loading: false });
      return null;
    }
  },

  checkItem: async (item_estoque_id) => {
    set({ loading: true, error: null });
    try {
      const data = await inventoryFetch('/api/inventory', {
        method: 'POST',
        body: JSON.stringify({ action: 'check', item_estoque_id }),
      });
      set({ loading: false });
      return data;
    } catch (e) {
      set({ error: String(e?.message || e), loading: false });
      return null;
    }
  },
}));
