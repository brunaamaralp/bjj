import { createSessionJwt } from './appwrite';
import { authedFetch } from './authInterceptor.js';

export async function saveAcademySettingsApi(academyId, payload) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');

  const res = await authedFetch('/api/academy/settings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      'x-academy-id': academyId,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.sucesso) {
    throw new Error(data.erro || `HTTP ${res.status}`);
  }
  return data;
}
