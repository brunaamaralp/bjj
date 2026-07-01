/**
 * Espelha cobranças PagBank Recorrente em student_payments (grade Mensalidades).
 * Usa Appwrite direto — não importa createPayment/updatePayment do client.
 */
import { ID } from 'node-appwrite';
import { PAYMENT_CATEGORY } from '../../src/lib/paymentCategories.js';
import { dueDateInMonth, studentDueDay } from '../../src/lib/collectionOverdue.js';
import { syncStudentOverdueAfterPayment } from './studentOverdueSync.js';
import { scheduleControlIdOverdueReconcile } from './controlidOverdueAccess.js';
import { findStudentPaymentForMonth } from './studentPaymentLookup.js';

const SETTLED_STUDENT_PAYMENT_STATUSES = new Set(['paid', 'covered', 'frozen', 'partial']);

function studentPaymentsCol() {
  return (
    process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
    process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
    ''
  );
}

function studentsCol() {
  return (
    process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID ||
    process.env.APPWRITE_STUDENTS_COLLECTION_ID ||
    ''
  );
}

export function centsToReais(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n) / 100;
}

export function parseAcademyFinanceConfig(academyDoc) {
  try {
    const raw = academyDoc?.financeConfig ?? academyDoc?.finance_config;
    return typeof raw === 'string' ? JSON.parse(raw) : raw || {};
  } catch {
    return {};
  }
}

export function resolveDueDateForReferenceMonth(studentDoc, referenceMonth) {
  const ym = String(referenceMonth || '').trim();
  if (!/^\d{4}-\d{2}$/.test(ym)) return null;
  const day = studentDueDay(studentDoc);
  if (!day) return null;
  const d = dueDateInMonth(ym, day);
  return d ? d.toISOString().slice(0, 10) : null;
}

function buildStudentPaymentPayload({
  studentId,
  academyId,
  referenceMonth,
  amountReais,
  financialTxId,
  paidAt,
  status,
  studentDoc,
  planName,
}) {
  const st = String(status || 'pending').toLowerCase();
  const payload = {
    lead_id: studentId,
    academy_id: academyId,
    amount: amountReais,
    expected_amount: amountReais,
    method: 'pagbank',
    account: 'pagbank',
    plan_name: String(planName || studentDoc?.plan || studentDoc?.plan_name || '').trim(),
    status: st,
    reference_month: referenceMonth,
    payment_category: PAYMENT_CATEGORY.PLAN,
    registered_by: 'pagbank',
    registered_by_name: 'PagBank',
    note: 'Cobrança PagBank Recorrente',
  };

  if (st === 'paid') {
    payload.paid_amount = amountReais;
    payload.paid_at = paidAt || new Date().toISOString();
    payload.due_date = null;
    if (financialTxId) payload.financial_tx_id = financialTxId;
  } else if (st === 'pending') {
    payload.paid_at = null;
    payload.due_date = resolveDueDateForReferenceMonth(studentDoc, referenceMonth);
  }

  return payload;
}

async function writeStudentPayment(databases, dbId, existingId, payload) {
  const col = studentPaymentsCol();
  if (!col) {
    throw new Error('student_payments_not_configured');
  }
  if (existingId) {
    return databases.updateDocument(dbId, col, existingId, payload);
  }
  return databases.createDocument(dbId, col, ID.unique(), payload);
}

/**
 * @param {object} p
 * @param {number} p.amount — centavos PagBank
 */
export async function upsertStudentPaymentFromPagbank({
  databases,
  dbId,
  academyId,
  studentId,
  referenceMonth,
  amount,
  financialTxId,
  paidAt,
  status,
  studentDoc = null,
  planName = '',
}) {
  if (!studentPaymentsCol() || !dbId || !studentId || !academyId || !referenceMonth) {
    return { skipped: true, reason: 'not_configured' };
  }

  const amountReais = centsToReais(amount);
  const st = String(status || 'pending').toLowerCase();
  const existing = await findStudentPaymentForMonth(databases, dbId, {
    studentId,
    academyId,
    referenceMonth,
  });

  if (st === 'pending' && existing) {
    const current = String(existing.status || '').toLowerCase();
    if (SETTLED_STUDENT_PAYMENT_STATUSES.has(current)) {
      return { skipped: true, reason: 'already_settled', doc: existing };
    }
  }

  const docForDue = studentDoc || {};
  const payload = buildStudentPaymentPayload({
    studentId,
    academyId,
    referenceMonth,
    amountReais,
    financialTxId,
    paidAt,
    status: st,
    studentDoc: docForDue,
    planName,
  });

  const doc = await writeStudentPayment(databases, dbId, existing?.$id || null, payload);
  return { skipped: false, created: !existing, doc };
}

export async function loadStudentDocForPagbank(databases, dbId, studentId) {
  const col = studentsCol();
  if (!col || !studentId) return { $id: studentId };
  try {
    return await databases.getDocument(dbId, col, studentId);
  } catch {
    return { $id: studentId };
  }
}

/** Replica maybeSyncOverdueAfterSettlement do studentPaymentsHandler (liquidação). */
export async function syncOverdueAfterPagbankPaid({
  databases,
  dbId,
  studentDoc,
  academyId,
  studentId,
  financeConfig,
  academyDoc,
}) {
  if (!studentsCol()) return { updated: false, reason: 'not_configured' };
  try {
    const result = await syncStudentOverdueAfterPayment(databases, dbId, studentDoc, {
      academyId,
      leadId: studentId,
      financeConfig,
      peopleCol: studentsCol(),
    });
    if (result?.updated && academyDoc) {
      scheduleControlIdOverdueReconcile({ academyId, academyDoc, studentId });
    }
    return result;
  } catch (e) {
    console.error('[upsertStudentPaymentFromPagbank] overdue sync failed', studentId, e?.message || e);
    return { updated: false, error: e?.message || 'sync_failed' };
  }
}
