/**
 * billing_reference_id determinístico para cobranças de aluno (cron + PagBank).
 * Formato: nave:1:{academyId}:student:{studentId}:{YYYY-MM}
 */
import {
  findStudentPaymentByBillingReference,
  findStudentPaymentForMonth,
} from './studentPaymentLookup.js';

const BILLING_PREFIX = 'nave';
const BILLING_VERSION = '1';

export function referenceMonthFromIso(iso) {
  const s = String(iso || '').trim();
  const m = s.match(/^(\d{4}-\d{2})/);
  return m ? m[1] : '';
}

export function buildStudentBillingReferenceId(academyId, studentId, referenceMonth) {
  const aid = String(academyId || '').trim();
  const sid = String(studentId || '').trim();
  const ym = String(referenceMonth || '').trim();
  if (!aid || !sid || !/^\d{4}-\d{2}$/.test(ym)) return '';
  return `${BILLING_PREFIX}:${BILLING_VERSION}:${aid}:student:${sid}:${ym}`;
}

/**
 * @returns {{ academyId: string, studentId: string, referenceMonth: string } | null}
 */
export function parseStudentBillingReferenceId(ref) {
  const parts = String(ref || '').trim().split(':');
  if (parts.length < 6) return null;
  if (parts[0] !== BILLING_PREFIX || parts[1] !== BILLING_VERSION) return null;
  if (parts[3] !== 'student') return null;
  const academyId = String(parts[2] || '').trim();
  const studentId = String(parts[4] || '').trim();
  const referenceMonth = String(parts[5] || '').trim();
  if (!academyId || !studentId || !/^\d{4}-\d{2}$/.test(referenceMonth)) return null;
  return { academyId, studentId, referenceMonth };
}

/** Extrai reference_id de payloads PagBank (webhook, reconcile API). */
export function extractPagbankReferenceId(body = {}, payment = {}) {
  const invoice =
    body?.data?.invoice ||
    body?.resource?.invoice ||
    body?.data?.payment?.invoice ||
    payment?.invoice ||
    {};
  const candidates = [
    payment?.reference_id,
    body?.data?.subscription?.reference_id,
    body?.data?.invoice?.reference_id,
    body?.data?.payment?.reference_id,
    body?.resource?.reference_id,
    body?.resource?.invoice?.reference_id,
    body?.resource?.payment?.reference_id,
    invoice?.reference_id,
    body?.data?.reference_id,
  ];
  for (const raw of candidates) {
    const s = String(raw || '').trim();
    if (s) return s;
  }
  return '';
}

/**
 * Resolve mês de cobrança e doc existente (reference-first, fallback heurístico).
 */
export async function resolvePagbankBillingContext({
  databases,
  dbId,
  academyId,
  studentId,
  paidAt,
  body = {},
  payment = {},
}) {
  const aid = String(academyId || '').trim();
  const sid = String(studentId || '').trim();
  const refId = extractPagbankReferenceId(body, payment);
  const parsed = parseStudentBillingReferenceId(refId);

  if (parsed && parsed.academyId === aid && parsed.studentId === sid) {
    const existingDoc = await findStudentPaymentByBillingReference(databases, dbId, refId);
    return {
      referenceMonth: parsed.referenceMonth,
      billingReferenceId: refId,
      resolutionMethod: 'billing_reference',
      existingDoc,
    };
  }

  const referenceMonth = referenceMonthFromIso(paidAt) || referenceMonthFromIso(payment?.created_at);
  const billingReferenceId = buildStudentBillingReferenceId(aid, sid, referenceMonth);
  const existingDoc = referenceMonth
    ? await findStudentPaymentForMonth(databases, dbId, {
        studentId: sid,
        academyId: aid,
        referenceMonth,
      })
    : null;

  return {
    referenceMonth,
    billingReferenceId,
    resolutionMethod: 'heuristic_fallback',
    existingDoc,
  };
}
