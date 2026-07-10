import { createSessionJwt } from './appwrite';
import { useLeadStore } from '../store/useLeadStore';
import { authedFetch } from './authInterceptor.js';

export async function fetchInventoryMovements({
  from,
  to,
  academyId,
  product_id,
  lead_id,
  sale_id,
  movement_kind,
  usuario_id,
  cliente_q,
  limit = 50,
  cursor,
}) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');
  const aid = academyId || useLeadStore.getState().academyId;
  if (!aid) throw new Error('academy_required');

  const params = new URLSearchParams({ movements: '1', from, to, limit: String(limit) });
  if (product_id) params.set('product_id', product_id);
  if (lead_id) params.set('lead_id', lead_id);
  if (sale_id) params.set('sale_id', sale_id);
  if (movement_kind) params.set('movement_kind', movement_kind);
  if (usuario_id) params.set('usuario_id', usuario_id);
  if (cliente_q) params.set('cliente_q', cliente_q);
  if (cursor) params.set('cursor', cursor);

  const res = await authedFetch(`/api/inventory/movements?${params}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      'x-academy-id': aid,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.erro || data.error || `error_${res.status}`);
  }
  return data;
}

export async function fetchStockMovesConciliation({
  from,
  to,
  academyId,
  status_filter = 'divergent',
}) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');
  const aid = academyId || useLeadStore.getState().academyId;
  if (!aid) throw new Error('academy_required');

  const params = new URLSearchParams({ conciliation: '1', from, to, status_filter });
  const res = await authedFetch(`/api/inventory/movements/conciliation?${params}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      'x-academy-id': aid,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.erro || data.error || `error_${res.status}`);
  }
  return data;
}
