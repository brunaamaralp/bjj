import { createSessionJwt } from './appwrite.js';
import { authedFetch } from './authInterceptor.js';

/**
 * Busca aluno por telefone (inclui órfãos sem academyId — repara automaticamente).
 */
export async function apiFindStudentsByPhone(phone, academyId) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');

  const aid = String(academyId || '').trim();
  const q = encodeURIComponent(String(phone || '').trim());
  if (!aid || q.replace(/\D/g, '').length < 8) return [];

  const res = await authedFetch(`/api/leads?route=students&action=find-by-phone&phone=${q}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      'x-academy-id': aid,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.sucesso === false) {
    throw new Error(data.erro || `HTTP ${res.status}`);
  }
  return Array.isArray(data.matches) ? data.matches : [];
}
