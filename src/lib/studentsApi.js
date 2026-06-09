import { createSessionJwt } from './appwrite.js';
import { useLeadStore } from '../store/useLeadStore.js';
import { authedFetch } from './authInterceptor.js';

async function studentsFetch(path, options = {}, academyIdOverride = '') {
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

export async function fetchStudentProfileBundle(studentId) {
  const id = encodeURIComponent(String(studentId || '').trim());
  return studentsFetch(`/api/students/${id}/profile`);
}

export async function deactivateStudentApi(payload) {
  return studentsFetch('/api/students/deactivate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function freezeStudentApi(payload) {
  return studentsFetch('/api/students/freeze', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Histórico de trancamentos via API (evita 401 no client Appwrite). */
export async function listPlanFreezesApi(leadId, { limit = 50 } = {}) {
  const id = encodeURIComponent(String(leadId || '').trim());
  const lim = Math.min(Math.max(1, limit), 100);
  const data = await studentsFetch(`/api/students/plan-freezes?student_id=${id}&limit=${lim}`);
  return data.plan_freezes || [];
}

/**
 * Busca aluno por telefone (inclui órfãos sem academyId — repara automaticamente).
 */
export async function apiFindStudentsByPhone(phone, academyId) {
  const q = encodeURIComponent(String(phone || '').trim());
  if (q.replace(/\D/g, '').length < 8) return [];

  const data = await studentsFetch(
    `/api/leads?route=students&action=find-by-phone&phone=${q}`,
    {},
    academyId
  );
  return Array.isArray(data.matches) ? data.matches : [];
}
