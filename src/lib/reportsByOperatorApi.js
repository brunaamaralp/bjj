import { createSessionJwt } from './appwrite';
import { useLeadStore } from '../store/useLeadStore';
import { authedFetch } from './authInterceptor.js';

export async function fetchReportsByOperator({ from, to, academyId, usuario_id } = {}) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');
  const aid = academyId || useLeadStore.getState().academyId;
  if (!aid) throw new Error('academy_required');

  const params = new URLSearchParams({ route: 'by-operator' });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (usuario_id) params.set('usuario_id', usuario_id);

  const res = await authedFetch(`/api/reports/by-operator?${params}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      'x-academy-id': aid,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || data.error || `error_${res.status}`);
  return data;
}
