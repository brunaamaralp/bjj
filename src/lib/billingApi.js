import { createSessionJwt } from './appwrite';

async function billingFetch(path, { method = 'GET', body, storeId } = {}) {
  const jwt = await createSessionJwt();
  if (!jwt) {
    const err = new Error('Sessão expirada. Faça login novamente.');
    err.code = 'AUTH';
    throw err;
  }
  const url = new URL(path, window.location.origin);
  if (storeId && method === 'GET') url.searchParams.set('storeId', storeId);
  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.sucesso === false) {
    const err = new Error(data.erro || data.error || `HTTP ${res.status}`);
    err.code = data.code || (res.status === 403 ? 'FORBIDDEN' : null);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function fetchBillingStatus(storeId) {
  return billingFetch(`/api/billing/status?storeId=${encodeURIComponent(storeId)}`);
}

export function postCheckout(payload) {
  return billingFetch('/api/billing/checkout', { method: 'POST', body: payload });
}

export function fetchBillingPayments(storeId, limit = 24) {
  return billingFetch(`/api/billing/payments?storeId=${encodeURIComponent(storeId)}&limit=${limit}`);
}

export function postCancelSubscription(storeId, mode = 'end_of_period') {
  return billingFetch('/api/billing/cancel-subscription', {
    method: 'POST',
    body: { storeId, mode },
  });
}

export function postChangePlan(storeId, planSlug, when = 'now') {
  return billingFetch('/api/billing/change-plan', {
    method: 'POST',
    body: { storeId, planSlug, when },
  });
}

export function fetchPaymentMethodLink(storeId) {
  return billingFetch(`/api/billing/payment-method-link?storeId=${encodeURIComponent(storeId)}`);
}
