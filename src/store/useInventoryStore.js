import { create } from 'zustand';
import { createSessionJwt } from '../lib/appwrite';
import { useLeadStore } from './useLeadStore';
import { friendlyError } from '../lib/errorMessages.js';

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

export const useInventoryStore = create((set, get) => ({
  items: [],
  lastResult: null,
  loading: false,
  error: null,
  moves: [],
  movesCursor: '',
  movesLoading: false,
  movesError: null,

  loadItems: async () => {
    set({ loading: true, error: null });
    try {
      const data = await inventoryFetch('/api/inventory');
      set({ items: data.items || [], loading: false });
      return data.items || [];
    } catch (e) {
      set({ error: friendlyError(e, 'load'), loading: false, items: [] });
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
      set({ error: friendlyError(e, 'action'), lastResult: null, loading: false });
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
      set({ error: friendlyError(e, 'save'), loading: false });
      return null;
    }
  },

  adjustStock: async (payload) => {
    set({ loading: true, error: null });
    try {
      const data = await inventoryFetch('/api/inventory', {
        method: 'POST',
        body: JSON.stringify({ action: 'adjust', ...payload }),
      });
      set({ loading: false });
      return data;
    } catch (e) {
      set({ error: friendlyError(e, 'save'), loading: false });
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
      set({ error: friendlyError(e, 'action'), loading: false });
      return null;
    }
  },

  listMoves: async ({ item_estoque_id, cursor, append } = {}) => {
    set({ movesLoading: true, movesError: null });
    try {
      const params = new URLSearchParams({ list_moves: '1', limit: '50' });
      const itemId = String(item_estoque_id || '').trim();
      if (itemId) params.set('item_estoque_id', itemId);
      if (cursor) params.set('cursor', String(cursor));
      const data = await inventoryFetch(`/api/inventory?${params.toString()}`);
      const batch = data.moves || [];
      set((state) => ({
        moves: append ? [...(state.moves || []), ...batch] : batch,
        movesCursor: data.cursor || '',
        movesLoading: false,
      }));
      return batch;
    } catch (e) {
      set({
        movesError: friendlyError(e, 'load'),
        movesLoading: false,
        moves: append ? get().moves : [],
      });
      return [];
    }
  },

  correctEntry: async (payload) => {
    set({ movesLoading: true, movesError: null });
    try {
      const jwt = await createSessionJwt();
      if (!jwt) throw new Error('session_required');
      const academyId = useLeadStore.getState().academyId;
      if (!academyId) throw new Error('academy_required');
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
          'x-academy-id': academyId,
        },
        body: JSON.stringify({ action: 'correct_entry', ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.erro || data.error || `error_${res.status}`);
        err.partial = Boolean(data.partial);
        throw err;
      }
      set({ movesLoading: false });
      return data;
    } catch (e) {
      const msg = String(e?.message || '');
      set({ movesError: msg, movesLoading: false });
      throw e;
    }
  },
}));
