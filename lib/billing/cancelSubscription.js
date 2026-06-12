import {
  getBillingDatabases,
  isBillingStoreConfigured,
  findSubscriptionByStoreId,
  updateSubscriptionByStoreId,
} from './billingAppwriteStore.js';
import { cancelAsaasSubscription } from './asaasClient.js';

/**
 * @param {{ storeId: string, mode?: 'end_of_period' | 'immediate' }} input
 */
export async function cancelSubscription(input) {
  if (!isBillingStoreConfigured()) {
    const err = new Error('Billing não configurado.');
    err.code = 'BILLING_CONFIG';
    throw err;
  }
  const databases = getBillingDatabases();
  if (!databases) {
    const err = new Error('Billing DB indisponível.');
    err.code = 'BILLING_CONFIG';
    throw err;
  }

  const storeId = String(input.storeId || '').trim();
  const mode = input.mode === 'immediate' ? 'immediate' : 'end_of_period';
  const sub = await findSubscriptionByStoreId(databases, storeId);
  if (!sub) {
    const err = new Error('Assinatura não encontrada.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (sub.status === 'inactive' || sub.status === 'canceled') {
    return { canceled: true, mode, alreadyCanceled: true };
  }

  if (mode === 'immediate') {
    if (sub.asaasSubscriptionId) {
      try {
        await cancelAsaasSubscription(sub.asaasSubscriptionId);
      } catch (e) {
        if (e?.status !== 404) throw e;
      }
    }
    await updateSubscriptionByStoreId(databases, storeId, {
      status: 'canceled',
      asaasSubscriptionId: null,
      cancelAtPeriodEnd: false,
      pendingPlanSlug: null,
    });
    return { canceled: true, mode: 'immediate' };
  }

  await updateSubscriptionByStoreId(databases, storeId, { cancelAtPeriodEnd: true });
  return {
    canceled: true,
    mode: 'end_of_period',
    currentPeriodEnd: sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
  };
}

/**
 * Executa cancelamento Asaas quando período local expirou (cron/reconcile).
 * @param {import('node-appwrite').Databases} databases
 * @param {ReturnType<typeof import('./billingAppwriteStore.js').mapSubscriptionDoc>} sub
 */
export async function finalizeScheduledCancellation(databases, sub) {
  if (!sub?.cancelAtPeriodEnd || !sub.storeId) return false;
  const end = sub.currentPeriodEnd;
  if (!end || end > new Date()) return false;

  if (sub.asaasSubscriptionId) {
    try {
      await cancelAsaasSubscription(sub.asaasSubscriptionId);
    } catch (e) {
      if (e?.status !== 404) throw e;
    }
  }
  await updateSubscriptionByStoreId(databases, sub.storeId, {
    status: 'inactive',
    asaasSubscriptionId: null,
    cancelAtPeriodEnd: false,
  });
  return true;
}
