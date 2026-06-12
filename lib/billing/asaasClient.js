const BASE = () =>
  String(process.env.ASAAS_BASE_URL || 'https://api-sandbox.asaas.com/v3').replace(/\/$/, '');

function authHeaders() {
  const key = String(process.env.ASAAS_API_KEY || '').trim();
  if (!key) throw new Error('asaas_not_configured');
  return {
    'Content-Type': 'application/json',
    access_token: key,
  };
}

/**
 * @param {string} path
 * @param {RequestInit} [init]
 */
export async function asaasFetch(path, init = {}) {
  const url = path.startsWith('http') ? path : `${BASE()}${path.startsWith('/') ? '' : '/'}${path}`;
  const headers = { ...authHeaders(), ...init.headers };
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(data?.errors?.[0]?.description || data?.message || `Asaas HTTP ${res.status}`);
    err.status = res.status;
    err.asaas = data;
    throw err;
  }
  return data;
}

/**
 * @param {object} body
 */
export async function createAsaasCustomer(body) {
  return asaasFetch('/customers', { method: 'POST', body: JSON.stringify(body) });
}

/**
 * @param {string} customerId
 * @param {object} body
 */
export async function updateAsaasCustomer(customerId, body) {
  return asaasFetch(`/customers/${customerId}`, { method: 'POST', body: JSON.stringify(body) });
}

/**
 * @param {object} body
 */
export async function createAsaasSubscription(body) {
  return asaasFetch('/subscriptions', { method: 'POST', body: JSON.stringify(body) });
}

/**
 * @param {string} subscriptionId
 */
export async function getAsaasSubscription(subscriptionId) {
  return asaasFetch(`/subscriptions/${subscriptionId}`, { method: 'GET' });
}

/**
 * @param {string} subscriptionId
 * @param {{ limit?: number, offset?: number }} [opts]
 */
export async function listSubscriptionPayments(subscriptionId, opts = {}) {
  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 24));
  const offset = Math.max(0, Number(opts.offset) || 0);
  return asaasFetch(`/subscriptions/${subscriptionId}/payments?limit=${limit}&offset=${offset}`, { method: 'GET' });
}

/**
 * @param {string} subscriptionId
 * @param {object} body
 */
export async function updateAsaasSubscription(subscriptionId, body) {
  return asaasFetch(`/subscriptions/${subscriptionId}`, { method: 'PUT', body: JSON.stringify(body) });
}

/**
 * @param {string} subscriptionId
 */
export async function cancelAsaasSubscription(subscriptionId) {
  return asaasFetch(`/subscriptions/${subscriptionId}`, { method: 'DELETE' });
}

/**
 * @param {string} customerId
 * @param {{ limit?: number, offset?: number }} [opts]
 */
export async function listCustomerPayments(customerId, opts = {}) {
  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 24));
  const offset = Math.max(0, Number(opts.offset) || 0);
  return asaasFetch(`/payments?customer=${encodeURIComponent(customerId)}&limit=${limit}&offset=${offset}`, { method: 'GET' });
}
