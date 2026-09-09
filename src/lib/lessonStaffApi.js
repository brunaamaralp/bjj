import { createSessionJwt } from './appwrite.js';
import { authedFetch } from './authInterceptor.js';
import { useLeadStore } from '../store/useLeadStore.js';

async function lessonStaffFetch(path, options = {}) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');
  const academyId = String(useLeadStore.getState().academyId || '').trim();
  if (!academyId) throw new Error('academy_required');
  const res = await authedFetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      'x-academy-id': academyId,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.sucesso === false) {
    throw new Error(data.erro || data.error || `error_${res.status}`);
  }
  return data;
}

/**
 * @param {object} payload
 */
export function confirmLessonStaff(payload) {
  return lessonStaffFetch('/api/leads?route=bookings&action=confirm-lesson', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * @param {{ from: string, to: string, userId?: string }} params
 */
export function fetchLessonStaffReport({ from, to, userId } = {}) {
  const q = new URLSearchParams({
    from: String(from || ''),
    to: String(to || ''),
  });
  if (userId) q.set('user_id', String(userId));
  return lessonStaffFetch(`/api/leads?route=bookings&action=lesson-staff-report&${q.toString()}`);
}
