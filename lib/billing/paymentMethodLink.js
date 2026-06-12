import {
  getBillingDatabases,
  isBillingStoreConfigured,
  findSubscriptionByStoreId,
} from './billingAppwriteStore.js';
import { listSubscriptionPayments } from './asaasClient.js';

/**
 * @param {{ storeId: string }} input
 */
export async function getPaymentMethodLink(input) {
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
  const sub = await findSubscriptionByStoreId(databases, storeId);
  if (!sub?.asaasSubscriptionId) {
    const err = new Error('Nenhuma assinatura ativa encontrada.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const remote = await listSubscriptionPayments(sub.asaasSubscriptionId, { limit: 12 });
  const items = remote?.data || remote || [];
  const pending = (Array.isArray(items) ? items : []).find((p) => {
    const st = String(p?.status || '').toUpperCase();
    return st === 'PENDING' || st === 'OVERDUE';
  });

  const url =
    pending?.invoiceUrl ||
    pending?.bankSlipUrl ||
    pending?.paymentUrl ||
    null;

  if (!url) {
    const err = new Error('Nenhuma cobrança pendente com link disponível. Tente novamente após a próxima fatura.');
    err.code = 'NO_LINK';
    throw err;
  }

  return { url };
}
