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
  const storeId = storeRow?.storeId;
  if (!storeId) return;

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
