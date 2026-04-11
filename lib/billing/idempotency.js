import { createHash } from 'crypto';

const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;

/**
 * @param {string} storeId
 * @param {string} planSlug
 * @param {string} billingType
 */
export function computeIdempotencyKey(storeId, planSlug, billingType) {
  const raw = `${storeId}|${String(planSlug).trim().toLowerCase()}|${String(billingType).trim().toUpperCase()}`;
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * @param {Date} createdAt
 */
export function isIdempotencyWindowActive(createdAt) {
  return Date.now() - createdAt.getTime() < TWENTY_FOUR_H_MS;
}
