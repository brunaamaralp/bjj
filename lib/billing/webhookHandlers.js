import { addMonths } from 'date-fns';
import {
  getBillingDatabases,
  isBillingStoreConfigured,
  findSubscriptionByAsaasSubscriptionId,
  findSubscriptionByAsaasCustomerId,
  updateSubscriptionByStoreId,
} from './billingAppwriteStore.js';
import { getAsaasSubscription } from './asaasClient.js';
import { upsertSubscriptionPaymentRecord } from './runCheckout.js';
import { getPlanByExternalReference, getPlanByAsaasValue, getStoreIdFromExternalReference, getPlanConfig } from '../../src/lib/planConfig.js';

const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

/** Atualiza plano + limite de IA no documento da academia. */
async function syncAcademyPlan(databases, storeId, planKey) {
  if (!DB_ID || !ACADEMIES_COL || !storeId || !planKey) return;
  const cfg = getPlanConfig(planKey);
  try {
    await databases.updateDocument(DB_ID, ACADEMIES_COL, storeId, {
      plan: planKey,
      ai_threads_limit: cfg.threads,
      plan_updated_at: new Date().toISOString(),
    });
    console.log('[webhook] academia atualizada com plano:', { storeId, planKey, threads: cfg.threads });
  } catch (e) {
    console.error('[webhook] syncAcademyPlan falhou:', { storeId, planKey, error: e?.message });
  }
}

/**
 * @param {unknown} body
 */
export async function processAsaasWebhookPayload(body) {
  if (!isBillingStoreConfigured()) return;
  const databases = getBillingDatabases();
  if (!databases) return;

  const event = String(body?.event || '').trim();
  if (!event) return;

  if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
    const payment = body?.payment;
    if (!payment?.id) return;
    await handlePaymentConfirmed(databases, payment);
    return;
  }
  if (event === 'PAYMENT_OVERDUE') {
    const payment = body?.payment;
    if (payment) await handlePaymentOverdue(databases, payment);
    return;
  }
  if (event === 'SUBSCRIPTION_DELETED') {
    const sub = body?.subscription;
    await handleSubscriptionDeleted(databases, sub);
  }
}

/** @param {import('node-appwrite').Databases} databases */
async function handlePaymentConfirmed(databases, payment) {
  const subId = payment.subscription ? String(payment.subscription) : '';
  let storeRow = null;
  if (subId) {
    storeRow = await findSubscriptionByAsaasSubscriptionId(databases, subId);
  }
  if (!storeRow && payment.customer) {
    storeRow = await findSubscriptionByAsaasCustomerId(databases, String(payment.customer));
  }

  // Tentar extrair storeId do externalReference se não encontrou no billing store
  const extRef = payment.externalReference || payment.subscription?.externalReference || '';
  const storeId = storeRow?.storeId || getStoreIdFromExternalReference(extRef) || null;
  if (!storeId) {
    console.error('[webhook] storeId não encontrado no pagamento:', payment.id);
    return;
  }

  const paidAt = payment.confirmedDate
    ? new Date(payment.confirmedDate)
    : payment.paymentDate
      ? new Date(payment.paymentDate)
      : new Date();

  await upsertSubscriptionPaymentRecord({
    asaasPaymentId: String(payment.id),
    storeId,
    value: payment.value,
    billingType: payment.billingType,
    paidAt,
    asaasSubscriptionId: subId || null,
  });

  let nextEnd = null;
  if (subId) {
    try {
      const remote = await getAsaasSubscription(subId);
      if (remote?.nextDueDate) {
        nextEnd = new Date(remote.nextDueDate);
      }
    } catch {
      void 0;
    }
  }
  if (!nextEnd) {
    nextEnd = addMonths(new Date(), 1);
  }

  await updateSubscriptionByStoreId(databases, storeId, {
    status: 'active',
    currentPeriodEnd: nextEnd,
    cancelAtPeriodEnd: false,
  });

  // Identificar plano: externalReference (primário) → valor da cobrança (fallback)
  const planKey =
    getPlanByExternalReference(extRef) ??
    getPlanByAsaasValue(payment.value);

  if (planKey) {
    await syncAcademyPlan(databases, storeId, planKey);
  } else {
    console.warn('[webhook] plano não identificado — limite de IA não atualizado:', {
      paymentId: payment.id,
      value: payment.value,
      extRef,
    });
  }
}

/** @param {import('node-appwrite').Databases} databases */
async function handlePaymentOverdue(databases, payment) {
  const subId = payment?.subscription ? String(payment.subscription) : '';
  if (!subId) return;
  const row = await findSubscriptionByAsaasSubscriptionId(databases, subId);
  if (!row) return;
  await updateSubscriptionByStoreId(databases, row.storeId, { status: 'past_due' });
}

/** @param {import('node-appwrite').Databases} databases */
async function handleSubscriptionDeleted(databases, sub) {
  const subId = typeof sub === 'object' && sub?.id ? String(sub.id) : String(sub || '');
  if (!subId) return;
  const row = await findSubscriptionByAsaasSubscriptionId(databases, subId);
  if (!row) return;
  await updateSubscriptionByStoreId(databases, row.storeId, {
    status: 'inactive',
    asaasSubscriptionId: null,
    cancelAtPeriodEnd: false,
  });
}
