/**
 * Cache leve + deduplicação in-flight para leituras do hub Financeiro (P0 performance).
 * TTL alinhado ao cache servidor de payables (~45s).
 */

const DEFAULT_STALE_MS = Number(
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_FINANCE_HUB_CACHE_MS
    ? import.meta.env.VITE_FINANCE_HUB_CACHE_MS
    : 45_000
);

/** @type {Map<string, { data: unknown, expiresAt: number }>} */
const cache = new Map();

/** @type {Map<string, Promise<unknown>>} */
const inFlight = new Map();

let listenersRegistered = false;

export function financeHubCacheKey(parts) {
  return parts.filter((p) => p != null && p !== '').join('|');
}

export function peekFinanceHubCache(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

export function isFinanceHubCacheFresh(key) {
  const hit = cache.get(key);
  return Boolean(hit && Date.now() <= hit.expiresAt);
}

/**
 * @param {string} key
 * @param {string} [academyId]
 */
export function invalidateFinanceHubCache(academyId) {
  const aid = String(academyId || '').trim();
  if (!aid) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.split('|').includes(aid)) cache.delete(key);
  }
}

/**
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fetcher
 * @param {{ force?: boolean, staleMs?: number }} [opts]
 * @returns {Promise<T>}
 */
export async function fetchFinanceHubCached(key, fetcher, opts = {}) {
  const { force = false, staleMs = DEFAULT_STALE_MS } = opts;

  if (!force) {
    const fresh = peekFinanceHubCache(key);
    if (fresh != null) return /** @type {T} */ (fresh);
  }

  if (!force && inFlight.has(key)) {
    return /** @type {Promise<T>} */ (inFlight.get(key));
  }

  const promise = Promise.resolve()
    .then(fetcher)
    .then((data) => {
      cache.set(key, { data, expiresAt: Date.now() + staleMs });
      inFlight.delete(key);
      return data;
    })
    .catch((err) => {
      inFlight.delete(key);
      throw err;
    });

  inFlight.set(key, promise);
  return promise;
}

function onFinanceHubInvalidateEvent(ev) {
  const aid = String(ev?.detail?.academyId || ev?.detail?.academy_id || '').trim();
  invalidateFinanceHubCache(aid || undefined);
}

/** Invalida cache em mutações financeiras (registro único por app). */
export function registerFinanceHubCacheInvalidation() {
  if (listenersRegistered || typeof window === 'undefined') return;
  listenersRegistered = true;
  window.addEventListener('navi-student-payment-updated', onFinanceHubInvalidateEvent);
  window.addEventListener('navi-financial-tx-settled', onFinanceHubInvalidateEvent);
  window.addEventListener('navi-finance-forecast-invalidate', onFinanceHubInvalidateEvent);
}
