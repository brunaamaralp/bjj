/**
 * Materialização de cobranças mensais em student_payments (cron Fase 3).
 * Funções puras — sem I/O.
 */
import { buildFreezeBillingReferenceId } from './planFreezeProjection.js';
import { isFrozenInMonth, isAnnualPlanStudent } from './planFreezeCore.js';
import { isStudentOnExemptPlan, resolveStudentPlanFinalPrice } from '../src/lib/planBilling.js';
import { dueDateInMonth, studentDueDay } from '../src/lib/collectionOverdue.js';
import { isActiveStudent, isStudentRecord } from '../src/lib/studentStatus.js';
import { PAYMENT_CATEGORY } from '../src/lib/paymentCategories.js';

const SETTLED_STATUSES = new Set(['paid', 'covered', 'frozen', 'partial']);

export function referenceMonthSaoPaulo(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  return y && m ? `${y}-${m}` : new Date().toISOString().slice(0, 7);
}

function enrollmentMonth(student) {
  const en = String(student?.enrollmentDate || student?.enrollment_date || '').trim().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(en) ? en : '';
}

/**
 * @returns {{ skip: boolean, reason?: string }}
 */
export function shouldMaterializeStudentForMonth({ student, referenceMonth, financeConfig = null }) {
  const ym = String(referenceMonth || '').trim();
  if (!/^\d{4}-\d{2}$/.test(ym)) return { skip: true, reason: 'invalid_reference_month' };
  if (!student || !isStudentRecord(student)) return { skip: true, reason: 'not_student' };
  if (!isActiveStudent(student)) return { skip: true, reason: 'inactive' };

  const planName = String(student?.plan || '').trim();
  if (!planName) return { skip: true, reason: 'no_plan' };

  if (isStudentOnExemptPlan(student, financeConfig)) return { skip: true, reason: 'exempt_plan' };
  if (isAnnualPlanStudent(student, financeConfig)) return { skip: true, reason: 'annual_plan' };

  const enrollYm = enrollmentMonth(student);
  if (enrollYm && ym < enrollYm) return { skip: true, reason: 'before_enrollment' };

  return { skip: false };
}

/**
 * @returns {'pending'|'frozen'}
 */
export function resolveMaterializationStatus(freezes, referenceMonth) {
  return isFrozenInMonth(freezes, referenceMonth).frozen ? 'frozen' : 'pending';
}

export function computeExpectedAmountForMaterialization(student, financeConfig) {
  const amount = resolveStudentPlanFinalPrice(student, financeConfig);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100) / 100;
}

export function computeDueDateForMaterialization(student, referenceMonth) {
  const ym = String(referenceMonth || '').trim();
  if (!/^\d{4}-\d{2}$/.test(ym)) return null;
  const day = studentDueDay(student);
  if (!day) return null;
  const d = dueDateInMonth(ym, day);
  return d ? d.toISOString().slice(0, 10) : null;
}

/**
 * Campos para criar cobrança pending materializada.
 */
export function buildPendingPaymentFields({
  leadId,
  academyId,
  referenceMonth,
  planName = '',
  expectedAmount = 0,
  dueDate = null,
  existing = null,
  issuedAt = null,
}) {
  const billingRef = buildFreezeBillingReferenceId(academyId, leadId, referenceMonth);
  const fields = {
    lead_id: leadId,
    academy_id: academyId,
    reference_month: referenceMonth,
    status: 'pending',
    plan_name: planName || existing?.plan_name || '',
    amount: existing ? Number(existing.amount) || 0 : 0,
    method: existing?.method || 'pix',
    account: existing?.account || '',
    payment_category: PAYMENT_CATEGORY.PLAN,
    due_date: dueDate || existing?.due_date || null,
    paid_at: null,
    registered_by: 'system',
    registered_by_name: 'Materialização automática',
    note: existing?.note || '',
    issued_at: issuedAt || new Date().toISOString(),
  };
  if (Number.isFinite(expectedAmount) && expectedAmount >= 0) {
    fields.expected_amount = expectedAmount;
  }
  if (billingRef) fields.billing_reference_id = billingRef;
  return fields;
}

/**
 * Patch não-destrutivo para doc existente (só preenche campos ausentes).
 * @returns {object|null}
 */
export function backfillPatchForExistingPayment(existing, targetFields) {
  if (!existing?.$id && !existing?.id) return null;
  const patch = {};
  const existingStatus = String(existing.status || '').toLowerCase();

  if (SETTLED_STATUSES.has(existingStatus)) {
    if (!String(existing.billing_reference_id || '').trim() && targetFields.billing_reference_id) {
      patch.billing_reference_id = targetFields.billing_reference_id;
    }
    if (!String(existing.issued_at || '').trim() && targetFields.issued_at) {
      patch.issued_at = targetFields.issued_at;
    }
    return Object.keys(patch).length ? patch : null;
  }

  if (existingStatus === 'pending') {
    if (!String(existing.billing_reference_id || '').trim() && targetFields.billing_reference_id) {
      patch.billing_reference_id = targetFields.billing_reference_id;
    }
    if (!String(existing.issued_at || '').trim() && targetFields.issued_at) {
      patch.issued_at = targetFields.issued_at;
    }
    if (
      (existing.expected_amount == null || !Number.isFinite(Number(existing.expected_amount))) &&
      targetFields.expected_amount != null
    ) {
      patch.expected_amount = targetFields.expected_amount;
    }
    if (!String(existing.due_date || '').trim() && targetFields.due_date) {
      patch.due_date = targetFields.due_date;
    }
    if (!String(existing.plan_name || '').trim() && targetFields.plan_name) {
      patch.plan_name = targetFields.plan_name;
    }
    return Object.keys(patch).length ? patch : null;
  }

  return null;
}

export function isSettledPaymentStatus(status) {
  return SETTLED_STATUSES.has(String(status || '').toLowerCase());
}
