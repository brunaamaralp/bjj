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

export async function unfreezeStudentApi(payload) {
  return studentsFetch('/api/students/unfreeze', {
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

/**
 * Listagem paginada de alunos (campos mínimos para a lista).
 */
export async function fetchStudentsList(opts = {}) {
  const academyId = String(opts.academyId || useLeadStore.getState().academyId || '').trim();
  if (!academyId) throw new Error('academy_required');

  const params = new URLSearchParams();
  if (opts.search) params.set('search', String(opts.search).trim());
  if (opts.plan) params.set('plan', String(opts.plan).trim());
  if (opts.turma) params.set('turma', String(opts.turma).trim());
  if (opts.turmaEmpty) params.set('turma_empty', '1');
  if (opts.origin) params.set('origin', String(opts.origin).trim());
  if (opts.studentStatus) params.set('student_status', String(opts.studentStatus).trim());
  if (opts.cursor) params.set('cursor', String(opts.cursor).trim());
  if (opts.offset != null && Number(opts.offset) > 0) {
    params.set('offset', String(Math.trunc(Number(opts.offset))));
  }
  if (opts.limit) params.set('limit', String(opts.limit));

  const qs = params.toString();
  const path = qs ? `/api/students/list?${qs}` : '/api/students/list';
  const data = await studentsFetch(path, { signal: opts.signal }, academyId);

  return {
    items: Array.isArray(data.items) ? data.items : [],
    next_cursor: data.next_cursor ? String(data.next_cursor) : null,
    total: typeof data.total === 'number' ? data.total : null,
  };
}

/** Busca alunos por nome ou telefone para checkout de vendas (via API, evita 401 no client). */
export async function searchStudentsForSaleApi(query, academyId, { limit = 8 } = {}) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const lim = Math.min(Math.max(1, limit), 20);
  const data = await studentsFetch(
    `/api/leads?route=students&action=search&q=${encodeURIComponent(q)}&limit=${lim}`,
    {},
    academyId
  );
  return Array.isArray(data.students) ? data.students : [];
}
