import { createSessionJwt } from './appwrite.js';
import { authedFetch } from './authInterceptor.js';

/**
 * Hub mensal de fechamento de professores.
 * GET /api/finance?route=professor-closing&month=YYYY-MM
 * @param {string} month YYYY-MM
 * @param {string} [academyId]
 */
export async function fetchProfessorClosingMonth(month, academyId) {
  const ym = String(month || '').trim();
  if (!ym) throw new Error('month_required');

  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');

  const params = new URLSearchParams({
    route: 'professor-closing',
    month: ym,
  });

  /** @type {Record<string, string>} */
  const headers = {
    Authorization: `Bearer ${jwt}`,
  };
  const aid = String(academyId || '').trim();
  if (aid) headers['x-academy-id'] = aid;

  const res = await authedFetch(`/api/finance?${params}`, { headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) {
    throw new Error(body.error || 'Erro ao carregar fechamento de professores');
  }
  return body;
}
