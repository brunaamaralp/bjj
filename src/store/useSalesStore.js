import { create } from 'zustand';
import { functions, SALES_CANCEL_FN_ID, createSessionJwt } from '../lib/appwrite';
import { salesFetch, SalesApiError } from '../lib/salesApi';
import { useLeadStore } from './useLeadStore';
import { friendlySaleError } from '../lib/errorMessages.js';

export const useSalesStore = create((set) => ({
  creating: false,
  cancelling: false,
  lastSale: null,
  error: null,
  errorDetail: null,

  createSale: async ({
    aluno_id = null,
    forma_pagamento,
    pagamentos,
    deferred = false,
    due_date = null,
    cliente_nome = null,
    cliente_telefone = null,
    venda_colaborador = false,
    itens,
    idempotency_key = undefined,
  }) => {
    set({ creating: true, error: null, errorDetail: null });
    try {
      const academyId = useLeadStore.getState().academyId || null;
      const payload = {
        aluno_id,
        cliente_nome,
        cliente_telefone,
        venda_colaborador,
        itens,
        academy_id: academyId,
      };
      if (deferred === true) {
        payload.deferred = true;
        payload.due_date = due_date;
        payload.pagamentos = [];
      } else if (Array.isArray(pagamentos) && pagamentos.length > 0) {
        payload.pagamentos = pagamentos;
      } else {
        payload.forma_pagamento = forma_pagamento;
      }
      if (idempotency_key) payload.idempotency_key = idempotency_key;
      const body = await salesFetch('/api/sales', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      set({ lastSale: body, creating: false, error: null, errorDetail: null });
      return body;
    } catch (e) {
      const code = e instanceof SalesApiError ? e.code : String(e?.message || e);
      const detail =
        e instanceof SalesApiError ? String(e.body?.detail || e.body?.erro || '').trim() : '';
      set({ error: code, errorDetail: detail || null, creating: false, lastSale: null });
      return null;
    }
  },

  fetchSalesList: async ({ from, to, limit = 50, cursor } = {}) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    params.set('limit', String(limit));
    if (cursor) params.set('cursor', String(cursor));
    const qs = params.toString();
    const data = await salesFetch(`/api/sales?${qs}`);
    return {
      sales: data.sales || [],
      next_cursor: data.next_cursor || null,
      has_more: Boolean(data.has_more),
    };
  },

  fetchSaleDetail: async (saleId) => {
    const data = await salesFetch(`/api/sales?id=${encodeURIComponent(saleId)}`);
    return data.sale || null;
  },

  liquidateSale: async ({ venda_id, pagamentos }) => {
    set({ creating: true, error: null, errorDetail: null });
    try {
      const academyId = useLeadStore.getState().academyId || null;
      const body = await salesFetch('/api/sales', {
        method: 'PATCH',
        body: JSON.stringify({
          id: venda_id,
          action: 'liquidar',
          pagamentos,
          academy_id: academyId,
        }),
      });
      set({ creating: false, error: null, lastSale: body });
      return body;
    } catch (e) {
      const code = e instanceof SalesApiError ? e.code : String(e?.message || e);
      set({ error: code, creating: false });
      return null;
    }
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
      const jwt = await createSessionJwt();
      if (!jwt) {
        set({ error: 'session_required', cancelling: false });
        return null;
      }
      const exec = await functions.createExecution(
        SALES_CANCEL_FN_ID,
        JSON.stringify({ venda_id, motivo: String(motivo).trim(), academy_id: academyId }),
        false,
        undefined,
        undefined,
        { Authorization: `Bearer ${jwt}` }
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
      set({ error: friendlySaleError(e) || 'Não foi possível cancelar a venda.', cancelling: false });
      return null;
    }
  },
}));
