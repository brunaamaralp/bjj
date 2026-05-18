import { create } from 'zustand';
import { functions, SALES_CREATE_FN_ID, SALES_CANCEL_FN_ID } from '../lib/appwrite';
import { salesFetch } from '../lib/salesApi';
import { useLeadStore } from './useLeadStore';

export const useSalesStore = create((set) => ({
  creating: false,
  cancelling: false,
  lastSale: null,
  error: null,

  createSale: async ({
    aluno_id = null,
    forma_pagamento,
    canal = 'presencial',
    cliente_nome = null,
    cliente_telefone = null,
    venda_colaborador = false,
    itens,
    idempotency_key = undefined,
  }) => {
    if (!SALES_CREATE_FN_ID) {
      set({ error: 'SALES_CREATE_FN_ID not set', lastSale: null });
      return null;
    }
    set({ creating: true, error: null });
    try {
      const academyId = useLeadStore.getState().academyId || null;
      const payload = {
        aluno_id,
        forma_pagamento,
        canal,
        cliente_nome,
        cliente_telefone,
        venda_colaborador,
        itens,
        academy_id: academyId,
      };
      if (idempotency_key) payload.idempotency_key = idempotency_key;
      const exec = await functions.createExecution(SALES_CREATE_FN_ID, JSON.stringify(payload), false);
      const code = exec.responseStatusCode || 200;
      let body = {};
      try {
        body = JSON.parse(exec.responseBody || '{}');
      } catch {
        body = { raw: exec.responseBody };
      }
      if (code >= 400) {
        set({ error: body.error || `error_${code}`, creating: false, lastSale: null });
        return null;
      }
      set({ lastSale: body, creating: false });
      return body;
    } catch (e) {
      set({ error: String(e && e.message ? e.message : e), creating: false });
      return null;
    }
  },

  fetchSalesList: async ({ from, to }) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    const data = await salesFetch(qs ? `/api/sales?${qs}` : '/api/sales');
    return data.sales || [];
  },

  fetchSaleDetail: async (saleId) => {
    const data = await salesFetch(`/api/sales?id=${encodeURIComponent(saleId)}`);
    return data.sale || null;
  },

  cancelSale: async ({ venda_id, motivo }) => {
    if (!SALES_CANCEL_FN_ID) {
      set({ error: 'SALES_CANCEL_FN_ID not set' });
      return null;
    }
    if (!String(motivo || '').trim()) {
      set({ error: 'motivo_required' });
      return null;
    }
    set({ cancelling: true, error: null });
    try {
      const academyId = useLeadStore.getState().academyId || null;
      const exec = await functions.createExecution(
        SALES_CANCEL_FN_ID,
        JSON.stringify({ venda_id, motivo: String(motivo).trim(), academy_id: academyId }),
        false
      );
      const code = exec.responseStatusCode || 200;
      let body = {};
      try {
        body = JSON.parse(exec.responseBody || '{}');
      } catch {
        body = { raw: exec.responseBody };
      }
      if (code >= 400) {
        set({ error: body.error || `error_${code}`, cancelling: false });
        return null;
      }
      set({ lastSale: body, cancelling: false });
      return body;
    } catch (e) {
      set({ error: String(e && e.message ? e.message : e), cancelling: false });
      return null;
    }
  },
}));
