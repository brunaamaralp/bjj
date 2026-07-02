/**
 * Reconciliação pagamento (student_payments) ↔ FINANCIAL_TX.
 */
import { Query } from 'node-appwrite';
import { databases, DB_ID } from './academyAccess.js';
import { mirrorStudentPaymentToFinancialTx } from './studentPaymentFinancialTxMirror.js';
import { shouldMirrorPaymentToCaixa } from '../../src/lib/paymentStatus.js';
import { PAYMENT_CATEGORY } from '../../src/lib/paymentCategories.js';
import { isReconcilableMirrorPayment } from '../../src/lib/studentPaymentMirrorCategory.js';
import { mergeFinanceConfigFromAcademyDoc } from '../../src/lib/financeConfigStorage.js';
import { notifyAcademyOwner } from './notifyAcademy.js';
import { clearFinancialTxSyncPending } from './studentPaymentSyncPending.js';

const PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
  process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
  '';
const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';
const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';

export const STUDENT_PAYMENT_RECONCILE_LIMIT = Math.min(
  50,
  Math.max(5, Number(process.env.STUDENT_PAYMENT_RECONCILE_LIMIT || 30) || 30)
);

function filterReconcileCandidates(docs) {
  return (docs || []).filter(
    (doc) =>
      isReconcilableMirrorPayment(doc) && String(doc.status || '').toLowerCase() !== 'covered'
  );
}

/**
 * Lista candidatos à reconciliação. Query dedicada para fee/other evita que o limite
 * por $createdAt exclua taxas/avulsos quando há muitos planos recentes.
 */
async function listReconcileCandidatePayments(academyId, limit) {
  const statusFilter = ['paid', 'partial', 'pending', 'awaiting'];
  const feeOtherLimit = Math.min(15, limit);

  const [mainRes, feeOtherRes] = await Promise.all([
    databases.listDocuments(DB_ID, PAYMENTS_COL, [
      Query.equal('academy_id', academyId),
      Query.equal('status', statusFilter),
      Query.orderDesc('$createdAt'),
      Query.limit(limit),
    ]),
    databases.listDocuments(DB_ID, PAYMENTS_COL, [
      Query.equal('academy_id', academyId),
      Query.equal('payment_category', [PAYMENT_CATEGORY.FEE, PAYMENT_CATEGORY.OTHER]),
      Query.equal('status', statusFilter),
      Query.orderDesc('$createdAt'),
      Query.limit(feeOtherLimit),
    ]),
  ]);

  const byId = new Map();
  for (const doc of [
    ...filterReconcileCandidates(mainRes.documents),
    ...filterReconcileCandidates(feeOtherRes.documents),
  ]) {
    byId.set(doc.$id, doc);
  }
  return [...byId.values()];
}

async function txNeedsRepair(txId) {
  if (!txId || !FINANCIAL_TX_COL) return true;
  try {
    const doc = await databases.getDocument(DB_ID, FINANCIAL_TX_COL, String(txId));
    return String(doc.status || '').toLowerCase() === 'cancelled';
  } catch {
    return true;
  }
}

export async function paymentNeedsMirrorRepair(paymentDoc) {
  if (!paymentDoc || !isReconcilableMirrorPayment(paymentDoc)) return false;
  const st = String(paymentDoc.status || '').toLowerCase();
  if (!shouldMirrorPaymentToCaixa(st)) return false;
  const txId = String(paymentDoc.financial_tx_id || '').trim();
  if (!txId) return true;
  return txNeedsRepair(txId);
}

async function loadStudentDoc(leadId) {
  if (!leadId || !STUDENTS_COL) return null;
  try {
    return await databases.getDocument(DB_ID, STUDENTS_COL, String(leadId));
  } catch {
    return null;
  }
}

/**
 * @param {string} academyId
 * @param {object} [academyDoc]
 * @param {{ notifyOnFailure?: boolean, limit?: number }} [options]
 */
export async function reconcileStudentPaymentMirrorsForAcademy(
  academyId,
  academyDoc = null,
  options = {}
) {
  if (!PAYMENTS_COL || !DB_ID) {
    return { checked: 0, repaired: 0, failed: 0, orphans: [], skipped: 'not_configured' };
  }

  const limit = Math.min(
    STUDENT_PAYMENT_RECONCILE_LIMIT,
    Math.max(1, Number(options.limit) || STUDENT_PAYMENT_RECONCILE_LIMIT)
  );
  const financeConfig = mergeFinanceConfigFromAcademyDoc(academyDoc || {});

  let payments = [];
  try {
    payments = await listReconcileCandidatePayments(academyId, limit);
  } catch {
    return { checked: 0, repaired: 0, failed: 0, orphans: [], error: 'list_failed' };
  }

  let checked = 0;
  let repaired = 0;
  let failed = 0;
  const orphans = [];

  for (const payment of payments) {
    checked += 1;
    if (!(await paymentNeedsMirrorRepair(payment))) continue;

    orphans.push({
      id: payment.$id,
      lead_id: payment.lead_id,
      reference_month: payment.reference_month,
      amount: payment.amount,
    });

    const studentDoc = await loadStudentDoc(payment.lead_id);
    const result = await mirrorStudentPaymentToFinancialTx({
      paymentDoc: payment,
      payload: {},
      financeConfig,
      studentDoc,
      existingTxId: payment.financial_tx_id,
    });

    if (result.mirrorId && !result.warning) {
      repaired += 1;
      await clearFinancialTxSyncPending(payment.$id);
    } else {
      failed += 1;
      if (options.notifyOnFailure && failed === 1 && academyDoc) {
        try {
          await notifyAcademyOwner(academyDoc, 'payment_mirror_failed', {
            payment_id: payment.$id,
            payment_short: String(payment.$id).slice(-4).toUpperCase(),
            warnings: result.warning || 'Espelho no Caixa ausente ou inválido.',
          });
        } catch {
          void 0;
        }
      }
    }
  }

  return { checked, repaired, failed, orphans };
}
