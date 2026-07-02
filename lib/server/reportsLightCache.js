const CACHE_TTL_MS = Number(process.env.REPORTS_LIGHT_CACHE_MS || 10 * 60 * 1000);

const store = new Map();

export function cacheKey(parts) {
  return parts.filter(Boolean).join('|');
}

export function getCached(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return null;
  }
  return hit.body;
}

export function setCached(key, body, ttlMs = CACHE_TTL_MS) {
  store.set(key, { body, expiresAt: Date.now() + ttlMs });
}

export function cacheMaxAgeSeconds() {
  return Math.floor(CACHE_TTL_MS / 1000);
}

/** Remove entradas de cache cujo key contém academyId e algum dos marcadores. */
export function invalidateCachedKeysForAcademy(academyId, markers = []) {
  const id = String(academyId || '').trim();
  if (!id) return 0;
  const needles = (markers || []).map((m) => String(m || '').trim()).filter(Boolean);
  if (!needles.length) return 0;
  let removed = 0;
  for (const key of store.keys()) {
    if (!key.split('|').includes(id)) continue;
    if (!needles.some((n) => key.includes(n))) continue;
    store.delete(key);
    removed += 1;
  }
  return removed;
}
