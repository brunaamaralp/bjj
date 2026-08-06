import { createSessionJwt } from './appwrite.js';
import { authedFetch } from './authInterceptor.js';
import { useLeadStore } from '../store/useLeadStore.js';

async function lessonFetch(path, options = {}, academyIdOverride = '') {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');
  const academyId = String(academyIdOverride || useLeadStore.getState().academyId || '').trim();
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
 * @param {string} academyId
 * @param {string} scheduleId
 * @param {string} dateYmd
 */
export async function fetchLessonRegister(academyId, scheduleId, dateYmd) {
  const url =
    `/api/leads?route=bookings&action=get-lesson-register` +
    `&schedule_id=${encodeURIComponent(scheduleId)}` +
    `&date=${encodeURIComponent(dateYmd)}`;
  return lessonFetch(url, {}, academyId);
}

/**
 * @param {string} academyId
 * @param {{
 *   schedule_id: string,
 *   slot_date: string,
 *   instructor_id: string,
 *   instructor_name: string,
 *   lesson_notes?: string,
 * }} body
 */
export async function saveLessonRegister(academyId, body) {
  return lessonFetch(
    '/api/leads?route=bookings&action=upsert-lesson-register',
    { method: 'POST', body: JSON.stringify(body) },
    academyId
  );
}
