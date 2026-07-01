import { timingSafeEqual } from 'crypto';
import { ID, Query } from 'node-appwrite';
import { databases, DB_ID } from './academyAccess.js';
import { getPagbankCredentials, getPagbankAcademyDocument } from './getPagbankCredentials.js';
import { mirrorStudentPaymentToFinancialTx } from './studentPaymentFinancialTxMirror.js';
import { referenceMonthFromIso } from './pagbankWebhookHandler.js';
import { patchPagbankGatewayOnFinancialTx } from './pagbankGatewayFinancialTx.js';
import {
  parseAcademyFinanceConfig,
  syncOverdueAfterPagbankPaid,
  upsertStudentPaymentFromPagbank,
} from './upsertStudentPaymentFromPagbank.js';

const SUBSCRIPTIONS_COL =
  process.env.APPWRITE_PAGBANK_SUBSCRIPTIONS_COLLECTION_ID || 'pagbank_subscriptions';
const PAYMENTS_COL = process.env.APPWRITE_PAGBANK_PAYMENTS_COLLECTION_ID || 'pagbank_payments';

const PAGBANK_API_URL = String(
  process.env.PAGBANK_SUBSCRIPTIONS_API_URL ||
    process.env.PAGBANK_API_URL ||
    'https://sandbox.api.assinaturas.pagseguro.com'
).replace(/\/$/, '');

const SUBSCRIPTION_STATUSES_TO_CHECK = ['active', 'overdue', 'retrying'];
const INVOICE_PAGE_LIMIT = 24;

function safeCompare(a, b) {
  try {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export function validatePagbankReconcileCronAuth(req) {
  const expected = String(process.env.CRON_SECRET || '').trim();
  const auth = String(req.headers?.authorization || '');
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  return Boolean(expected) && safeCompare(token, expected);
}

export function isPagbankPaymentApproved(status) {
  const normalized = String(status || '').trim().toUpperCase();
  return normalized === 'APPROVED' || normalized === 'PAID';
}

function centsToReais(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n) / 100;
}

function paymentPaidAt(payment) {
  return (
    String(payment?.paid_at || payment?.paidAt || payment?.updated_at || payment?.created_at || '').trim() ||
    null
  );
}

export async function fetchPagbankJson(token, path) {
  const url = path.startsWith('http')
    ? path
    : `${PAGBANK_API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * PagBank não expõe GET /subscriptions/{id}/payments.
 * Fluxo documentado: faturas da assinatura → pagamentos por fatura.
 */
export async function listPaymentsForSubscription(token, subscriptionId) {
  const invoicesData = await fetchPagbankJson(
    token,
    `/subscriptions/${encodeURIComponent(subscriptionId)}/invoices?limit=${INVOICE_PAGE_LIMIT}`
  );
  const invoices = invoicesData?.invoices || invoicesData?.items || [];
  const payments = [];

  for (const invoice of invoices) {
    const invoiceId = String(invoice?.id || '').trim();
    if (!invoiceId) continue;

    const payData = await fetchPagbankJson(
      token,
      `/invoices/${encodeURIComponent(invoiceId)}/payments`
    );
    const list = payData?.payments || payData?.items || [];
    for (const payment of list) {
      payments.push({
        ...payment,
        invoice_id: invoiceId,
      });
    }
  }

  return payments;
}

export function groupSubscriptionsByAcademy(documents) {
  const byAcademy = {};
  for (const sub of documents || []) {
    const academyId = String(sub.academy_id || '').trim();
    if (!academyId) continue;
    if (!byAcademy[academyId]) byAcademy[academyId] = [];
    byAcademy[academyId].push(sub);
  }
  return byAcademy;
}

export async function listSubscriptionsToReconcile() {
  const all = [];
  let lastId = null;

  while (all.length < 500) {
    const queries = [
      Query.equal('status', SUBSCRIPTION_STATUSES_TO_CHECK),
      Query.limit(100),
      Query.orderAsc('$id'),
    ];
    if (lastId) queries.push(Query.cursorAfter(lastId));

    const page = await databases.listDocuments(DB_ID, SUBSCRIPTIONS_COL, queries);
    const docs = page.documents || [];
    all.push(...docs);
    if (docs.length < 100) break;
    lastId = docs[docs.length - 1].$id;
  }

  return all;
}

export async function reconcileSubscription(sub, token, academyId, results) {
  const payments = await listPaymentsForSubscription(token, sub.subscription_id);
  if (!payments.length) return;

  for (const p of payments) {
    if (!isPagbankPaymentApproved(p.status)) continue;

    const paymentId = String(p.id || '').trim();
    if (!paymentId) continue;

    const existing = await databases.listDocuments(DB_ID, PAYMENTS_COL, [
      Query.equal('payment_id', paymentId),
      Query.limit(1),
    ]);
    if (existing.documents?.length > 0) continue;

    const paidAt = paymentPaidAt(p);
    const referenceMonth = referenceMonthFromIso(paidAt) || referenceMonthFromIso(p.created_at);
    const amountCents = Number(p.amount?.value ?? p.invoice?.amount?.value ?? 0) || 0;
    const amountReais = centsToReais(amountCents);
    const invoiceId = String(p.invoice_id || p.invoice?.id || '').trim();

    const paymentDoc = await databases.createDocument(DB_ID, PAYMENTS_COL, ID.unique(), {
      payment_id: paymentId,
      subscription_id: sub.subscription_id,
      student_id: sub.student_id,
      academy_id: academyId,
      amount: amountCents,
      status: 'paid',
      reference_month: referenceMonth,
      paid_at: paidAt,
      invoice_id: invoiceId,
      webhook_event_id: `reconcile-${paymentId}`,
      created_at: new Date().toISOString(),
    });

    const studentDoc = await loadStudentDocForPagbank(databases, DB_ID, sub.student_id);

    const upsertResult = await upsertStudentPaymentFromPagbank({
      databases,
      dbId: DB_ID,
      academyId,
      studentId: sub.student_id,
      referenceMonth,
      amount: amountCents,
      financialTxId: null,
      paidAt: paidAt || new Date().toISOString(),
      status: 'paid',
      studentDoc,
      planName: studentDoc?.plan || '',
    });

    const studentPaymentId = String(upsertResult?.doc?.$id || '').trim();
    if (!studentPaymentId) {
      results.errors += 1;
      results.details.push({
        academyId,
        subscriptionId: sub.subscription_id,
        paymentId,
        error: 'student_payment_upsert_missing_id',
      });
      continue;
    }

    const mirrorResult = await mirrorStudentPaymentToFinancialTx({
      paymentDoc: {
        $id: studentPaymentId,
        academy_id: academyId,
        lead_id: sub.student_id,
        amount: amountReais,
        paid_amount: amountReais,
        status: 'paid',
        paid_at: paidAt || new Date().toISOString(),
        reference_month: referenceMonth,
        method: 'cartao_credito',
        payment_category: 'plan',
        financial_tx_id: upsertResult.doc?.financial_tx_id || '',
      },
      payload: {
        academy_id: academyId,
        lead_id: sub.student_id,
        status: 'paid',
        paid_amount: amountReais,
        reference_month: referenceMonth,
        paid_at: paidAt || new Date().toISOString(),
        method: 'cartao_credito',
        payment_category: 'plan',
      },
      financeConfig: null,
      studentDoc,
      existingTxId: upsertResult.doc?.financial_tx_id || null,
    });

    if (paymentDoc.$id && mirrorResult?.mirrorId) {
      await databases.updateDocument(DB_ID, PAYMENTS_COL, paymentDoc.$id, {
        financial_entry_id: mirrorResult.mirrorId,
      });
      await patchPagbankGatewayOnFinancialTx(databases, DB_ID, mirrorResult.mirrorId, {
        paymentId: paymentDoc.payment_id || '',
      });
    }

    try {
      const academyDoc = await getPagbankAcademyDocument(academyId);
      await syncOverdueAfterPagbankPaid({
        databases,
        dbId: DB_ID,
        studentDoc,
        academyId,
        studentId: sub.student_id,
        financeConfig: parseAcademyFinanceConfig(academyDoc),
        academyDoc,
      });
    } catch (e) {
      console.error('[pagbankReconcileHandler] overdue sync failed', sub.student_id, e?.message || e);
    }

    await databases.updateDocument(DB_ID, SUBSCRIPTIONS_COL, sub.$id, {
      status: 'active',
      last_payment_date: paidAt || new Date().toISOString(),
      last_payment_status: 'paid',
    });

    results.created++;
    results.details.push({
      academyId,
      subscription_id: sub.subscription_id,
      payment_id: paymentId,
      action: 'created_via_reconcile',
    });
  }
}

export async function runPagbankReconcileCron() {
  const results = { checked: 0, created: 0, errors: 0, details: [] };

  const subscriptions = await listSubscriptionsToReconcile();
  const byAcademy = groupSubscriptionsByAcademy(subscriptions);

  for (const [academyId, subs] of Object.entries(byAcademy)) {
    let token;
    try {
      const creds = await getPagbankCredentials(academyId);
      token = creds.token;
    } catch {
      results.errors++;
      results.details.push({ academyId, error: 'credentials_unavailable' });
      continue;
    }

    for (const sub of subs) {
      results.checked++;
      try {
        await reconcileSubscription(sub, token, academyId, results);
      } catch (e) {
        console.error(
          '[pagbankReconcileHandler] error academy:',
          academyId,
          'subscription:',
          sub.subscription_id,
          e?.message || e
        );
        results.errors++;
      }
    }
  }

  return results;
}

export default async function pagbankReconcileHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  if (!validatePagbankReconcileCronAuth(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const results = await runPagbankReconcileCron();
  return res.status(200).json({ ok: true, mode: 'pagbank-reconcile', ...results });
}
