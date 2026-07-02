import { createSessionJwt } from './appwrite.js';
import { authedFetch } from './authInterceptor.js';
import { fetchFinanceHubCached, financeHubCacheKey } from './financeHubCache.js';

async function financeHeaders(academyId) {
  const jwt = await createSessionJwt();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${jwt}`,
    'x-academy-id': academyId,
  };
}

/** Fila de cobrança acumulada (inadimplência multi-mês). */
export async function fetchCollectionQueue({ academyId }) {
  const params = new URLSearchParams({ route: 'collection-queue' });
  const res = await authedFetch(`/api/finance?${params}`, {
    headers: await financeHeaders(academyId),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Erro ao carregar fila de cobrança');
  return body;
}

export function fetchCollectionQueueCached({ academyId, force = false }) {
  const key = financeHubCacheKey(['collection-queue', academyId]);
  return fetchFinanceHubCached(
    key,
    () => fetchCollectionQueue({ academyId }),
    { force }
  );
}
