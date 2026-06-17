import { createSessionJwt } from './appwrite.js';
import { useLeadStore } from '../store/useLeadStore.js';
import { authedFetch } from './authInterceptor.js';

/**
 * @param {{
 *   academyId?: string;
 *   turma?: string;
 *   belt?: string;
 *   lookbackDays?: number;
 *   includeAtRisk?: boolean;
 * }} [params]
 */
export async function fetchAttendanceRetention(params = {}) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');

  const aid = String(params.academyId || useLeadStore.getState().academyId || '').trim();
  if (!aid) throw new Error('academy_required');

  const qs = new URLSearchParams();
  if (params.turma) qs.set('turma', String(params.turma).trim());
  if (params.belt) qs.set('belt', String(params.belt).trim());
  if (params.lookbackDays) qs.set('lookback_days', String(params.lookbackDays));
  if (params.includeAtRisk === false) qs.set('include_at_risk', '0');

  const path = qs.toString()
    ? `/api/reports/attendance-retention?${qs}`
    : '/api/reports/attendance-retention';

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

/**
 * @param {{ student_id: string; action: 'mark_contact'|'absence_reason'|'clear_contact'; reason?: string; notes?: string; snooze_days?: number }} payload
 */
export async function postAttendanceRetentionAction(payload) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');

  const academyId = String(useLeadStore.getState().academyId || '').trim();
  if (!academyId) throw new Error('academy_required');

  const res = await authedFetch('/api/students/retention-action', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      'x-academy-id': academyId,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.sucesso === false) {
    throw new Error(data.erro || data.error || `error_${res.status}`);
  }
  return data;
}
