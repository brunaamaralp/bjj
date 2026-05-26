import { createSessionJwt } from './appwrite';
import { useLeadStore } from '../store/useLeadStore';

export async function fetchInventoryMovements({
  from,
  to,
  academyId,
  product_id,
  lead_id,
  sale_id,
  movement_kind,
  usuario_id,
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
  if (cursor) params.set('cursor', cursor);

  const res = await fetch(`/api/inventory/movements?${params}`, {
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
