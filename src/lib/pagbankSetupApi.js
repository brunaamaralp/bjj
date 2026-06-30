import { createSessionJwt } from './appwrite';
import { authedFetch } from './authInterceptor.js';

const BASE = '/api/agent';

function routeUrl(route) {
  return `${BASE}?route=${route}`;
}

async function pagbankFetch(route, { method = 'POST', academyId, body } = {}) {
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
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.error || 'pagbank_error'), { status: res.status, detail: err });
  }
  return res.json();
}

export function runPagbankSetup(academyId, payload) {
  return pagbankFetch('pagbank-setup', { academyId, body: payload });
}
