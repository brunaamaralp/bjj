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
 */
export async function listSubscriptionPayments(subscriptionId) {
  return asaasFetch(`/subscriptions/${subscriptionId}/payments?limit=5`, { method: 'GET' });
}
