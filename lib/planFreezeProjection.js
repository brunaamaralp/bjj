/**
 * Projeção materializada de trancamento em student_payments (campos + reversão).
 */
import { referenceMonthsInRange } from './planFreezeCore.js';

const BILLING_PREFIX = 'nave';
const BILLING_VERSION = '1';

export function buildFreezeBillingReferenceId(academyId, studentId, referenceMonth) {
  const aid = String(academyId || '').trim();
  const sid = String(studentId || '').trim();
  const ym = String(referenceMonth || '').trim();
  if (!aid || !sid || !/^\d{4}-\d{2}$/.test(ym)) return '';
  return `${BILLING_PREFIX}:${BILLING_VERSION}:${aid}:student:${sid}:${ym}`;
}

/**
 * Campos para materializar status frozen em student_payments.
 */
export function buildFrozenPaymentFields({
  leadId,
  academyId,
  referenceMonth,
  planName = '',
  existing = null,
  issuedAt = null,
}) {
  const billingRef = buildFreezeBillingReferenceId(academyId, leadId, referenceMonth);
  const fields = {
    lead_id: leadId,
    academy_id: academyId,
    reference_month: referenceMonth,
    status: 'frozen',
    covered_reason: 'freeze',
    plan_name: planName || existing?.plan_name || '',
    amount: existing ? Number(existing.amount) || 0 : 0,
    note: existing?.note || `Trancamento — ${referenceMonth}`,
    payment_category: existing?.payment_category || 'plan',
    issued_at: issuedAt || new Date().toISOString(),
  };
  if (billingRef) fields.billing_reference_id = billingRef;
  const expected = existing?.expected_amount;
  if (expected != null && Number.isFinite(Number(expected))) {
    fields.expected_amount = Number(expected);
  }
  return fields;
}

/** Meses frozen que voltam a pending após destrancamento (posteriores ao mês do unfreeze). */
export function monthsToRevertOnUnfreeze(unfreezeYmd, freezeStartYmd, freezeEndYmd) {
  const unfreezeMonth = String(unfreezeYmd || '').trim().slice(0, 7);
  const start = String(freezeStartYmd || '').trim().slice(0, 10);
  const end = String(freezeEndYmd || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}$/.test(unfreezeMonth) || !start || !end) return [];
  return referenceMonthsInRange(start, end).filter((ym) => ym > unfreezeMonth);
}
