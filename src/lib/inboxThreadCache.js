const CACHE_TTL_MS = 60 * 1000;

/** @type {Map<string, { payload: object; fetchedAt: number }>} */
const cache = new Map();

function cacheKey(academyId, phone) {
    return `${String(academyId || '').trim()}:${String(phone || '').trim()}`;
}

export function getInboxThreadCache(academyId, phone) {
    const key = cacheKey(academyId, phone);
    if (!key.endsWith(':')) {
        const entry = cache.get(key);
        if (entry && Date.now() - entry.fetchedAt <= CACHE_TTL_MS) {
            return entry.payload;
        }
    }
    return null;
}

export function setInboxThreadCache(academyId, phone, payload) {
    const key = cacheKey(academyId, phone);
    if (!payload || key.endsWith(':')) return;
    cache.set(key, { payload, fetchedAt: Date.now() });
}

export function invalidateInboxThreadCache(academyId, phone) {
    const key = cacheKey(academyId, phone);
    if (key.endsWith(':')) return;
    cache.delete(key);
}
