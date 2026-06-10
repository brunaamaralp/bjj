const CACHE_TTL_MS = Number(process.env.INBOX_LIST_STATS_CACHE_MS || 60 * 1000);

/** @type {Map<string, { stats: object, expiresAt: number }>} */
const store = new Map();

export function inboxListStatsCacheKey(academyId, archivedOnly) {
  return `${String(academyId || '').trim()}|${archivedOnly ? 'archived' : 'active'}`;
}

export function getInboxListStatsCached(academyId, archivedOnly) {
  const key = inboxListStatsCacheKey(academyId, archivedOnly);
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return null;
  }
  return hit.stats;
}

export function setInboxListStatsCached(academyId, archivedOnly, stats) {
  const key = inboxListStatsCacheKey(academyId, archivedOnly);
  store.set(key, { stats, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidateInboxListStatsCache(academyId) {
  const prefix = `${String(academyId || '').trim()}|`;
  if (!prefix || prefix === '|') return;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
