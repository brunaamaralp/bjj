const CACHE_TTL_MS = 5 * 60 * 1000;
/** @type {Map<string, { byLead: Record<string, string>; fetchedAt: number }>} */
const cache = new Map();

export function getFollowupDoneCache(academyId) {
    const id = String(academyId || '').trim();
    if (!id) return null;
    const entry = cache.get(id);
    if (!entry || Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
    return entry.byLead;
}

export function setFollowupDoneCache(academyId, byLead) {
    const id = String(academyId || '').trim();
    if (!id) return;
    cache.set(id, { byLead: { ...byLead }, fetchedAt: Date.now() });
}

export function patchFollowupDoneCache(academyId, leadId, atIso) {
    const id = String(academyId || '').trim();
    const lid = String(leadId || '').trim();
    if (!id || !lid) return;
    const entry = cache.get(id) || { byLead: {}, fetchedAt: Date.now() };
    entry.byLead[lid] = atIso;
    entry.fetchedAt = Date.now();
    cache.set(id, entry);
}
