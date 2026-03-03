import { create } from 'zustand';
import { functions, SALES_CREATE_FN_ID, SALES_CANCEL_FN_ID } from '../lib/appwrite';

export const useSalesStore = create((set) => ({
  creating: false,
  cancelling: false,
  lastSale: null,
  error: null,

  createSale: async ({ aluno_id = null, forma_pagamento, itens }) => {
    if (!SALES_CREATE_FN_ID) {
      set({ error: 'SALES_CREATE_FN_ID not set', lastSale: null });
      return;
    }
    set({ creating: true, error: null });
    try {
      const exec = await functions.createExecution(SALES_CREATE_FN_ID, JSON.stringify({ aluno_id, forma_pagamento, itens }), false);
      const code = exec.responseStatusCode || 200;
      let body = {};
      try { body = JSON.parse(exec.responseBody || '{}'); } catch { body = { raw: exec.responseBody }; }
      if (code >= 400) {
        set({ error: body.error || `error_${code}`, creating: false, lastSale: null });
        return;
      }
      set({ lastSale: body, creating: false });
    } catch (e) {
      set({ error: String(e && e.message ? e.message : e), creating: false });
    }
  },

  cancelSale: async (venda_id) => {
    if (!SALES_CANCEL_FN_ID) {
      set({ error: 'SALES_CANCEL_FN_ID not set' });
      return;
    }
    set({ cancelling: true, error: null });
    try {
      const exec = await functions.createExecution(SALES_CANCEL_FN_ID, JSON.stringify({ venda_id }), false);
      const code = exec.responseStatusCode || 200;
      let body = {};
      try { body = JSON.parse(exec.responseBody || '{}'); } catch { body = { raw: exec.responseBody }; }
      if (code >= 400) {
        set({ error: body.error || `error_${code}`, cancelling: false });
        return;
      }
      set({ lastSale: body, cancelling: false });
    } catch (e) {
      set({ error: String(e && e.message ? e.message : e), cancelling: false });
    }
  },
}));
