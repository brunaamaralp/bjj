const CACHE_TTL_MS = 5 * 60 * 1000;

/** @type {Map<string, { data: object; fetchedAt: number }>} */
const cache = new Map();

function storageKey(academyId) {
  return String(academyId || '').trim();
}

/**
 * @typedef {object} FollowupEventsBundle
 * @property {Record<string, string>} doneByLead
 * @property {Record<string, string>} contactByLead
 * @property {Record<string, string>} snoozeUntilByLead
 */

/** @returns {FollowupEventsBundle | null} */
export function getFollowupEventsCache(academyId) {
  const id = storageKey(academyId);
  if (!id) return null;
  const entry = cache.get(id);
  if (!entry || Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
  return entry.data;
}

/** @param {FollowupEventsBundle} data */
export function setFollowupEventsCache(academyId, data) {
  const id = storageKey(academyId);
  if (!id) return;
  cache.set(id, {
    data: {
      doneByLead: { ...(data.doneByLead || {}) },
      contactByLead: { ...(data.contactByLead || {}) },
      snoozeUntilByLead: { ...(data.snoozeUntilByLead || {}) },
    },
    fetchedAt: Date.now(),
  });
}

export function patchFollowupDoneCache(academyId, leadId, atIso) {
  const id = storageKey(academyId);
  const lid = String(leadId || '').trim();
  if (!id || !lid) return;
  const entry = cache.get(id) || {
    data: { doneByLead: {}, contactByLead: {}, snoozeUntilByLead: {} },
    fetchedAt: Date.now(),
  };
  entry.data.doneByLead[lid] = atIso;
  entry.fetchedAt = Date.now();
  cache.set(id, entry);
}

export function patchFollowupContactCache(academyId, leadId, atIso) {
  const id = storageKey(academyId);
  const lid = String(leadId || '').trim();
  if (!id || !lid) return;
  const entry = cache.get(id) || {
    data: { doneByLead: {}, contactByLead: {}, snoozeUntilByLead: {} },
    fetchedAt: Date.now(),
  };
  entry.data.contactByLead[lid] = atIso;
  entry.fetchedAt = Date.now();
  cache.set(id, entry);
}

export function patchFollowupSnoozeCache(academyId, leadId, untilYmd) {
  const id = storageKey(academyId);
  const lid = String(leadId || '').trim();
  if (!id || !lid) return;
  const entry = cache.get(id) || {
    data: { doneByLead: {}, contactByLead: {}, snoozeUntilByLead: {} },
    fetchedAt: Date.now(),
  };
  entry.data.snoozeUntilByLead[lid] = untilYmd;
  entry.fetchedAt = Date.now();
  cache.set(id, entry);
}

// Back-compat com followupDoneCache.js
export function getFollowupDoneCache(academyId) {
  return getFollowupEventsCache(academyId)?.doneByLead ?? null;
}

export function setFollowupDoneCache(academyId, byLead) {
  setFollowupEventsCache(academyId, {
    doneByLead: byLead,
    contactByLead: getFollowupEventsCache(academyId)?.contactByLead || {},
    snoozeUntilByLead: getFollowupEventsCache(academyId)?.snoozeUntilByLead || {},
  });
}
