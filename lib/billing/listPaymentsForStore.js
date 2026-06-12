import {
  getBillingDatabases,
  isBillingStoreConfigured,
  findSubscriptionByStoreId,
  listPaymentsByStoreId,
} from './billingAppwriteStore.js';
import { listSubscriptionPayments } from './asaasClient.js';

const STATUS_LABELS = {
  CONFIRMED: 'CONFIRMED',
  RECEIVED: 'CONFIRMED',
  PENDING: 'PENDING',
  OVERDUE: 'OVERDUE',
};

function normalizeAsaasPayment(p) {
  if (!p?.id) return null;
  const status = STATUS_LABELS[String(p.status || '').toUpperCase()] || String(p.status || 'PENDING').toUpperCase();
  const paidAt = p.confirmedDate || p.paymentDate || p.clientPaymentDate || null;
  return {
    id: String(p.id),
    value: String(p.value ?? ''),
    status,
    billingType: String(p.billingType || 'UNKNOWN').toUpperCase(),
    paidAt: paidAt ? new Date(paidAt).toISOString() : null,
    dueDate: p.dueDate ? String(p.dueDate).slice(0, 10) : null,
    invoiceUrl: p.invoiceUrl || p.bankSlipUrl || p.transactionReceiptUrl || p.paymentUrl || null,
  };
}

/**
 * @param {{ storeId: string, limit?: number }} input
 */
export async function listPaymentsForStore(input) {
  if (!isBillingStoreConfigured()) {
    return { payments: [] };
  }
  const databases = getBillingDatabases();
  if (!databases) return { payments: [] };

  const storeId = String(input.storeId || '').trim();
  const limit = Math.min(50, Math.max(1, Number(input.limit) || 24));
  const local = await listPaymentsByStoreId(databases, storeId, limit);
  const byId = new Map();

  for (const row of local) {
    if (!row.asaasPaymentId) continue;
    byId.set(row.asaasPaymentId, {
      id: row.asaasPaymentId,
      value: row.value,
      status: row.status,
      billingType: row.billingType,
      paidAt: row.paidAt,
      dueDate: row.dueDate,
      invoiceUrl: row.invoiceUrl,
    });
  }

  const sub = await findSubscriptionByStoreId(databases, storeId);
  if (sub?.asaasSubscriptionId) {
    try {
      const remote = await listSubscriptionPayments(sub.asaasSubscriptionId, { limit });
      const items = remote?.data || remote || [];
      for (const p of Array.isArray(items) ? items : []) {
        const norm = normalizeAsaasPayment(p);
        if (!norm) continue;
        const existing = byId.get(norm.id);
        byId.set(norm.id, { ...norm, ...existing, invoiceUrl: norm.invoiceUrl || existing?.invoiceUrl || null });
      }
    } catch (e) {
      console.warn('[listPaymentsForStore] Asaas:', e?.message);
    }
  }

  const payments = [...byId.values()].sort((a, b) => {
    const da = a.paidAt || a.dueDate || '';
    const db = b.paidAt || b.dueDate || '';
    return db.localeCompare(da);
  });

  return { payments: payments.slice(0, limit) };
}
