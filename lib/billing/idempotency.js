const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;

/**
 * @param {string} storeId
 * @param {string} planSlug
 * @param {string} billingType
 */
export async function computeIdempotencyKey(storeId, planSlug, billingType) {
  const raw = `${storeId}|${String(planSlug).trim().toLowerCase()}|${String(billingType).trim().toUpperCase()}`;
  const msgUint8 = new TextEncoder().encode(raw);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {Date} createdAt
 */
export function isIdempotencyWindowActive(createdAt) {
  return Date.now() - createdAt.getTime() < TWENTY_FOUR_H_MS;
}
