import { Query } from 'appwrite';
import { databases, DB_ID } from './appwrite.js';
import {
  calcFinalPrice,
  getStudentDiscountAmount,
  normalizeDiscountType,
  resolveStudentPlan,
} from './planBilling.js';
import { PAYMENT_CATEGORY, normalizePaymentCategory } from './paymentCategories.js';
import { updatePayment } from './studentPayments.js';

const PAYMENTS_COL = import.meta.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID || '';

export function didStudentDiscountChange(before = {}, after = {}) {
  const typeBefore = normalizeDiscountType(before);
  const typeAfter = normalizeDiscountType(after);
  if (typeBefore !== typeAfter) return true;
  return getStudentDiscountAmount(before) !== getStudentDiscountAmount(after);
}

function studentForBilling(student = {}) {
  return {
    plan: student.plan,
    discount_amount: student.discountAmount ?? student.discount_amount ?? 0,
    discount_type: student.discountType ?? student.discount_type,
    dueDay: student.dueDay ?? student.due_day,
  };
}

export function pendingPlanPaymentAmount(student, financeConfig) {
  const billingStudent = studentForBilling(student);
  const plan = resolveStudentPlan(billingStudent, financeConfig);
  return calcFinalPrice(plan?.price, billingStudent);
}

async function listPendingPlanPayments(studentId, academyId) {
  const col = PAYMENTS_COL || '__student_payments__';
  if (!studentId || !academyId) return [];

  const out = [];
  let cursor = null;

  for (;;) {
    const queries = [
      Query.equal('lead_id', String(studentId)),
      Query.equal('academy_id', String(academyId)),
      Query.equal('status', ['pending']),
      Query.orderDesc('reference_month'),
      Query.limit(100),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const res = await databases.listDocuments(DB_ID, col, queries);
    const batch = res.documents || [];

    for (const doc of batch) {
      if (String(doc.status || '').toLowerCase() !== 'pending') continue;
      if (normalizePaymentCategory(doc) === PAYMENT_CATEGORY.PLAN) {
        out.push(doc);
      }
    }

    if (batch.length < 100) break;
    cursor = batch[batch.length - 1]?.$id;
    if (!cursor) break;
  }

  return out;
}

/**
 * Recalcula cobranças plan/mensalidade com status pending após mudança de desconto.
 * Falhas individuais são logadas; a operação não lança erro.
 */
export async function recalcPendingPaymentsOnDiscountChange({
  studentId,
  academyId,
  student,
  financeConfig,
  previousStudent = null,
}) {
  const sid = String(studentId || '').trim();
  const aid = String(academyId || '').trim();
  if (!sid || !aid || !student) return { updated: 0, skipped: true };

  if (previousStudent && !didStudentDiscountChange(previousStudent, student)) {
    return { updated: 0, skipped: true };
  }

  let payments = [];
  try {
    payments = await listPendingPlanPayments(sid, aid);
  } catch (err) {
    console.warn('[recalcPendingPaymentsOnDiscount] list failed:', err?.message || err);
    return { updated: 0, error: err };
  }

  if (!payments.length) return { updated: 0 };

  const newAmount = pendingPlanPaymentAmount(student, financeConfig);
  if (!Number.isFinite(newAmount) || newAmount < 0) return { updated: 0 };

  let updated = 0;
  for (const payment of payments) {
    try {
      const currentAmount = Number(payment.amount ?? payment.expected_amount);
      if (Number.isFinite(currentAmount) && Math.abs(currentAmount - newAmount) < 0.005) {
        continue;
      }

      await updatePayment(payment.$id, {
        academy_id: aid,
        lead_id: sid,
        amount: newAmount,
        expected_amount: newAmount,
        status: 'pending',
        method: payment.method || 'pix',
        account: payment.account ?? '',
        plan_name: String(student.plan || payment.plan_name || '').trim(),
        payment_category: PAYMENT_CATEGORY.PLAN,
        reference_month: payment.reference_month ?? null,
        due_date: payment.due_date ?? null,
        registered_by: payment.registered_by ?? '',
        registered_by_name: payment.registered_by_name ?? '',
        note: payment.note ?? '',
      });
      updated += 1;
    } catch (err) {
      console.warn(
        '[recalcPendingPaymentsOnDiscount] update failed:',
        payment.$id,
        err?.message || err
      );
    }
  }

  return { updated };
}
