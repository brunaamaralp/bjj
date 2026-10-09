import { createSessionJwt } from './appwrite.js';
import { authedFetch } from './authInterceptor.js';

/**
 * GET/POST /api/agent?route=professor-compensation
 * @param {string} [academyId]
 */
export async function fetchProfessorCompensation(academyId) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');

  /** @type {Record<string, string>} */
  const headers = { Authorization: `Bearer ${jwt}` };
  const aid = String(academyId || '').trim();
  if (aid) headers['x-academy-id'] = aid;

  const res = await authedFetch('/api/agent?route=professor-compensation', { headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) {
    throw new Error(body.error || 'Erro ao carregar remuneração');
  }
  return body.compensation;
}

/**
 * @param {object} compensation
 * @param {string} [academyId]
 */
export async function saveProfessorCompensation(compensation, academyId) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');

  /** @type {Record<string, string>} */
  const headers = {
    Authorization: `Bearer ${jwt}`,
    'Content-Type': 'application/json',
  };
  const aid = String(academyId || '').trim();
  if (aid) headers['x-academy-id'] = aid;

  const res = await authedFetch('/api/agent?route=professor-compensation', {
    method: 'POST',
    headers,
    body: JSON.stringify({ compensation }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) {
    throw new Error(body.error || body.message || 'Erro ao salvar remuneração');
  }
  return body.compensation;
}
