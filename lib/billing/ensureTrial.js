import { TRIAL_DAYS } from './trialConstants.js';
import { getBillingDatabases, isBillingStoreConfigured, findSubscriptionByStoreId, createSubscriptionDocument } from './billingAppwriteStore.js';

/**
 * Garante registro de assinatura em trial para uma loja (academia) nova.
 * @param {string} storeId
 */
export async function ensureTrialSubscription(storeId) {
  if (!isBillingStoreConfigured()) return null;
  const databases = getBillingDatabases();
  if (!databases) return null;
  const sid = String(storeId || '').trim();
  if (!sid) return null;
  const existing = await findSubscriptionByStoreId(databases, sid);
  if (existing) return existing;
  const end = new Date();
  end.setDate(end.getDate() + TRIAL_DAYS);
  return createSubscriptionDocument(databases, {
    storeId: sid,
    status: 'trial',
    currentPeriodEnd: end,
    cancelAtPeriodEnd: false,
  });
}
