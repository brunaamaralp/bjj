import { createSessionJwt } from './appwrite.js';
import { useLeadStore } from '../store/useLeadStore.js';
import { authedFetch } from './authInterceptor.js';

/**
 * @param {{
 *   academyId?: string;
 *   turma?: string;
 *   belt?: string;
 *   lookbackDays?: number;
 *   from?: string;
 *   to?: string;
 * }} [params]
 */
export async function fetchAttendanceFrequency(params = {}) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');

  const aid = String(params.academyId || useLeadStore.getState().academyId || '').trim();
  if (!aid) throw new Error('academy_required');

  const qs = new URLSearchParams();
  if (params.turma) qs.set('turma', String(params.turma).trim());
  if (params.belt) qs.set('belt', String(params.belt).trim());
  if (params.lookbackDays) qs.set('lookback_days', String(params.lookbackDays));
  if (params.from) qs.set('from', String(params.from).trim().slice(0, 10));
  if (params.to) qs.set('to', String(params.to).trim().slice(0, 10));

  const path = qs.toString()
    ? `/api/reports/attendance-frequency?${qs}`
    : '/api/reports/attendance-frequency';

  const res = await authedFetch(path, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      'x-academy-id': aid,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.erro || data.error || `error_${res.status}`);
  }
  return data;
}
