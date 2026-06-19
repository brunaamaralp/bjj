import {
  getBillingDatabases,
  isBillingStoreConfigured,
  findSubscriptionByStoreId,
  updateSubscriptionByStoreId,
} from './billingAppwriteStore.js';
import {
  cancelAsaasSubscription,
  getAsaasSubscription,
  updateAsaasSubscription,
} from './asaasClient.js';
import { resetAcademyPlanToDefault } from './resetAcademyPlan.js';

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
    await resetAcademyPlanToDefault(databases, storeId);
    return { canceled: true, mode: 'immediate' };
  }

  if (sub.asaasSubscriptionId) {
    try {
      await updateAsaasSubscription(sub.asaasSubscriptionId, { status: 'INACTIVE' });
    } catch (e) {
      console.warn('[cancelSubscription] Asaas INACTIVE falhou (prosseguindo com flag local):', {
        storeId,
        asaasSubscriptionId: sub.asaasSubscriptionId,
        error: e?.message,
      });
    }
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
    let remoteInactive = false;
    try {
      const remote = await getAsaasSubscription(sub.asaasSubscriptionId);
      remoteInactive = String(remote?.status || '').toUpperCase() === 'INACTIVE';
    } catch (e) {
      if (e?.status !== 404) {
        console.warn('[finalizeScheduledCancellation] get Asaas subscription:', e?.message);
      }
    }

    try {
      await cancelAsaasSubscription(sub.asaasSubscriptionId);
    } catch (e) {
      if (e?.status === 404) {
        /* assinatura já removida */
      } else if (remoteInactive) {
        /* cleanup esperado após INACTIVE no cancelamento agendado */
      } else {
        throw e;
      }
    }
  }
  await updateSubscriptionByStoreId(databases, sub.storeId, {
    status: 'inactive',
    asaasSubscriptionId: null,
    cancelAtPeriodEnd: false,
  });
  await resetAcademyPlanToDefault(databases, sub.storeId);
  return true;
}
