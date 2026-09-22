import { createSessionJwt } from './appwrite.js';
import { authedFetch } from './authInterceptor.js';

/**
 * Lembretes financeiros do hero da Recepção.
 * GET /api/finance?route=reception-reminders
 */
export async function fetchReceptionFinancialReminders(academyId, { refresh = false } = {}) {
  const aid = String(academyId || '').trim();
  if (!aid) throw new Error('academy_required');
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');

  const params = new URLSearchParams({ route: 'reception-reminders' });
  if (refresh) params.set('refresh', '1');

  const res = await authedFetch(`/api/finance?${params}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      'x-academy-id': aid,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) {
    throw new Error(body.error || 'Erro ao carregar lembretes financeiros');
  }
  return body;
}
