import { createSessionJwt } from './appwrite';
import { authedFetch } from './authInterceptor.js';

function routeUrl(route) {
  return `/api/contracts?route=${encodeURIComponent(route)}`;
}

async function autentiqueFetch(route, { method = 'POST', academyId, body } = {}) {
  const jwt = await createSessionJwt();
  const headers = {
    Authorization: `Bearer ${jwt}`,
    'x-academy-id': academyId,
  };
  if (body != null) headers['Content-Type'] = 'application/json';

  const res = await authedFetch(routeUrl(route), {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && data?.ok !== true && data?.ok !== false) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

/** Status da integração Autentique (sem token completo). */
export async function getAutentiqueStatus(academyId) {
  const jwt = await createSessionJwt();
  const res = await authedFetch(routeUrl('autentique_get_status'), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'x-academy-id': academyId,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

export function saveAutentiqueConfig(academyId, { token, account_email, enabled } = {}) {
  return autentiqueFetch('autentique_save_config', {
    academyId,
    body: { token, account_email, enabled },
  });
}
