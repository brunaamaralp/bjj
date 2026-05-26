import { createSessionJwt } from './appwrite.js';
import { authedFetch } from './authInterceptor.js';

export async function fetchProductStockMoves(itemId, academyId) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');
  const aid = String(academyId || '').trim();
  if (!aid || !itemId) throw new Error('params_required');

  const res = await authedFetch(`/api/inventory?item_id=${encodeURIComponent(itemId)}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      'x-academy-id': aid,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.sucesso === false) {
    throw new Error(data.erro || data.error || `HTTP ${res.status}`);
  }
  return data.moves || [];
}
