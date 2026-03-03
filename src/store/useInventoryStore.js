import { create } from 'zustand';
import { functions, INVENTORY_MOVE_FN_ID } from '../lib/appwrite';

export const useInventoryStore = create((set) => ({
  lastResult: null,
  loading: false,
  error: null,

  inventoryMove: async (payload) => {
    if (!INVENTORY_MOVE_FN_ID) {
      set({ error: 'INVENTORY_MOVE_FN_ID not set', lastResult: null });
      return;
    }
    set({ loading: true, error: null });
    try {
      const exec = await functions.createExecution(INVENTORY_MOVE_FN_ID, JSON.stringify(payload), false);
      const code = exec.responseStatusCode || 200;
      let body = {};
      try { body = JSON.parse(exec.responseBody || '{}'); } catch { body = { raw: exec.responseBody }; }
      if (code >= 400) {
        set({ error: body.error || `error_${code}`, lastResult: null, loading: false });
        return;
      }
      set({ lastResult: body, loading: false });
    } catch (e) {
      set({ error: String(e && e.message ? e.message : e), loading: false });
    }
  },
}));
