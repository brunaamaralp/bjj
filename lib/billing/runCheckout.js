import {
  getBillingDatabases,
  isBillingStoreConfigured,
  findIdempotencyByKey,
  deleteIdempotencyDocument,
  findOtherStoreWithTaxDocument,
  findSubscriptionByStoreId,
  createSubscriptionDocument,
  updateSubscriptionByStoreId,
  createIdempotencyDocument,
  upsertSubscriptionPaymentDocument,
} from './billingAppwriteStore.js';
import {
  createAsaasCustomer,
  updateAsaasCustomer,
  createAsaasSubscription,
  asaasFetch,
} from './asaasClient.js';
import { computeIdempotencyKey, isIdempotencyWindowActive } from './idempotency.js';
import { resolvePlan } from './plans.js';
import { ensureTrialSubscription } from './ensureTrial.js';
import { TRIAL_DAYS } from './trialConstants.js';

const BILLING_TYPES = new Set(['PIX', 'BOLETO', 'CREDIT_CARD']);

/**
 * @param {{ storeId: string, planSlug: string, billingType: string, customer: object }} input
 */
export async function runCheckout(input) {
  if (!isBillingStoreConfigured()) {
    const err = new Error('Billing Appwrite não configurado (collections de assinatura).');
    err.code = 'BILLING_CONFIG';
    throw err;
  }
  const databases = getBillingDatabases();
  if (!databases) {
    const err = new Error('Billing Appwrite não configurado.');
    err.code = 'BILLING_CONFIG';
    throw err;
  }

  const storeId = String(input.storeId || '').trim();
  const plan = resolvePlan(input.planSlug);
  const bType = String(input.billingType || '').trim().toUpperCase();

  if (!storeId) {
    const err = new Error('storeId obrigatório');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!plan) {
    const err = new Error('Plano inválido');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!BILLING_TYPES.has(bType)) {
    const err = new Error('Tipo de cobrança inválido (use PIX, BOLETO ou CREDIT_CARD)');
    err.code = 'VALIDATION';
    throw err;
  }

  const idemKey = computeIdempotencyKey(storeId, plan.slug, bType);
  const existing = await findIdempotencyByKey(databases, idemKey);
  if (existing && isIdempotencyWindowActive(existing.createdAt) && existing.paymentLinkUrl) {
    return {
      paymentUrl: existing.paymentLinkUrl,
      reused: true,
      idempotencyKey: idemKey,
      subscriptionId: existing.asaasSubscriptionId || null,
    };
  }
  if (existing && !isIdempotencyWindowActive(existing.createdAt)) {
    try {
      await deleteIdempotencyDocument(databases, existing.$id);
    } catch {
      void 0;
    }
  }

  const digits = String(input.customer?.cpfCnpj || '').replace(/\D/g, '');
  const conflict = await findOtherStoreWithTaxDocument(databases, digits, storeId);
  if (conflict) {
    const err = new Error('Este CPF/CNPJ já está vinculado a outra academia.');
    err.code = 'TAX_IN_USE';
    throw err;
  }

  await ensureTrialSubscription(storeId);
  let subRow = await findSubscriptionByStoreId(databases, storeId);
  if (!subRow) {
    subRow = await createSubscriptionDocument(databases, {
      storeId,
      status: 'trial',
      currentPeriodEnd: new Date(Date.now() + TRIAL_DAYS * 86400000),
      cancelAtPeriodEnd: false,
    });
  }

  const c = input.customer;
  const customerPayload = {
    name: c.name,
    email: c.email,
    cpfCnpj: digits,
    postalCode: c.postalCode,
    address: c.address,
    addressNumber: c.addressNumber,
    province: c.province,
    city: c.city,
    externalReference: storeId,
  };
  if (c.complement) customerPayload.addressComplement = c.complement;
  if (c.phone) {
    customerPayload.mobilePhone = c.phone;
    customerPayload.phone = c.phone;
  }

  let customerId = subRow.asaasCustomerId || null;
  if (customerId) {
    await updateAsaasCustomer(customerId, customerPayload);
    await updateSubscriptionByStoreId(databases, storeId, { taxDocumentDigits: digits });
  } else {
    const created = await createAsaasCustomer(customerPayload);
    customerId = created.id;
    await updateSubscriptionByStoreId(databases, storeId, {
      asaasCustomerId: customerId,
      taxDocumentDigits: digits,
    });
  }

  const nextDue = new Date();
  nextDue.setDate(nextDue.getDate() + 1);
  const nextDueDate = nextDue.toISOString().slice(0, 10);

  const subscription = await createAsaasSubscription({
    customer: customerId,
    billingType: bType,
    cycle: plan.cycle,
    value: plan.value,
    description: plan.label,
    nextDueDate,
    externalReference: `nave:${storeId}:${plan.slug}`,
  });

  const subId = subscription.id;
  let paymentUrl =
    subscription.invoiceUrl ||
    subscription.bankSlipUrl ||
    subscription.paymentUrl ||
    subscription.link ||
    null;

  if (!paymentUrl && subId) {
    try {
      const payList = await asaasFetch(`/subscriptions/${subId}/payments?limit=5`, { method: 'GET' });
      const list = payList?.data || payList || [];
      const first = Array.isArray(list) ? list[0] : null;
      if (first) {
        paymentUrl = first.invoiceUrl || first.bankSlipUrl || first.paymentUrl || first.link || null;
      }
    } catch {
      /* noop */
    }
  }

  if (!paymentUrl) {
    paymentUrl = '';
  }

  await createIdempotencyDocument(databases, {
    key: idemKey,
    storeId,
    planSlug: plan.slug,
    billingType: bType,
    paymentLinkUrl: paymentUrl || null,
    asaasCustomerId: customerId,
    asaasSubscriptionId: subId,
  });

  await updateSubscriptionByStoreId(databases, storeId, {
    asaasSubscriptionId: subId,
    taxDocumentDigits: digits,
  });

  return {
    paymentUrl,
    reused: false,
    idempotencyKey: idemKey,
    subscriptionId: subId,
  };
}

/**
 * Registra pagamento local (webhook Asaas).
 * @param {object} p
 */
export async function upsertSubscriptionPaymentRecord(p) {
  if (!isBillingStoreConfigured()) return;
  const databases = getBillingDatabases();
  if (!databases) return;
  await upsertSubscriptionPaymentDocument(databases, p);
}
