/**
 * Mensalidades (student_payments) recebidas em um dia — relatório diário / fechamento recepção.
 */
import { Query } from 'node-appwrite';
import { databases, DB_ID } from './academyAccess.js';
import { STUDENT_PAYMENTS_COL } from './appwriteCollections.js';
import { isPaymentReceiptEligible } from '../receipts/paymentReceiptText.js';
import { paymentCategoryLabel } from '../receipts/paymentReceiptText.js';
import { normalizePaymentForma, roundMoney } from './salePayments.js';
import { mirrorGrossForPayment } from '../../src/lib/paymentStatus.js';
import {
  isBundleChildPayment,
  isMensalidadesGridPayment,
} from '../../src/lib/paymentCategories.js';
import { formatPaymentMethod } from '../../src/lib/paymentMethodLabels.js';

const MAX_PAGES = 20;
const PAGE_SIZE = 100;

function nextDayYmd(dateYmd) {
  const d = new Date(`${dateYmd}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** @param {string|null|undefined} paidAt */
export function paidAtYmd(paidAt) {
  const s = String(paidAt || '').trim();
  if (!s) return null;
  const ymd = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

/** @param {string|null|undefined} paidAt @param {string} dateYmd */
export function paidAtMatchesReportDay(paidAt, dateYmd) {
  return paidAtYmd(paidAt) === dateYmd;
}

/** @param {string|null|undefined} paidAt @param {string} fromYmd @param {string} toYmd */
export function paidAtInYmdRange(paidAt, fromYmd, toYmd) {
  const ymd = paidAtYmd(paidAt);
  if (!ymd) return false;
  if (fromYmd && ymd < fromYmd) return false;
  if (toYmd && ymd > toYmd) return false;
  return true;
}

/** @param {object} doc @param {string} fromYmd @param {string} toYmd */
export function isReceivedPaymentInPeriod(doc, fromYmd, toYmd) {
  if (!isMensalidadesGridPayment(doc)) return false;
  if (isBundleChildPayment(doc)) return false;
  if (!paidAtInYmdRange(doc?.paid_at, fromYmd, toYmd)) return false;
  const eligible = isPaymentReceiptEligible(doc);
  if (!eligible.ok) return false;
  const amount = mirrorGrossForPayment(
    doc.status,
    doc.paid_amount,
    doc.expected_amount ?? doc.amount
  );
  return amount > 0;
}

/** @param {object} doc */
export function isDailyReportEligiblePayment(doc, dateYmd) {
  if (!isMensalidadesGridPayment(doc)) return false;
  if (isBundleChildPayment(doc)) return false;
  if (!paidAtMatchesReportDay(doc?.paid_at, dateYmd)) return false;
  const eligible = isPaymentReceiptEligible(doc);
  if (!eligible.ok) return false;
  const amount = mirrorGrossForPayment(
    doc.status,
    doc.paid_amount,
    doc.expected_amount ?? doc.amount
  );
  return amount > 0;
}

/**
 * @param {object[]} paymentDocs
 * @returns {Record<string, number>}
 */
export function aggregatePaymentTotalsFromPaymentDocs(paymentDocs) {
  const totals = {};
  for (const doc of paymentDocs || []) {
    const amount = mirrorGrossForPayment(
      doc.status,
      doc.paid_amount,
      doc.expected_amount ?? doc.amount
    );
    if (amount <= 0) continue;
    const forma = normalizePaymentForma(doc.method || doc.capture_method_name || '');
    if (!forma) continue;
    totals[forma] = roundMoney((totals[forma] || 0) + amount);
  }
  return totals;
}

/**
 * @param {object} doc
 * @param {Record<string, string>} [leadNames]
 */
export function mapPaymentDocForDailyReport(doc, leadNames = {}) {
  const leadId = String(doc?.lead_id || '').trim();
  const amount = mirrorGrossForPayment(
    doc.status,
    doc.paid_amount,
    doc.expected_amount ?? doc.amount
  );
  const method = doc.method || doc.capture_method_name || '';
  return {
    id: doc.$id,
    student_id: leadId || null,
    student_name: (leadId && leadNames[leadId]) || String(doc.student_name || '').trim() || 'Aluno',
    reference_month: String(doc.reference_month || '').trim() || null,
    payment_category: doc.payment_category || 'plan',
    category_label: paymentCategoryLabel(doc.payment_category),
    amount,
    method,
    payment_label: formatPaymentMethod(method, doc.installments),
    paid_at: doc.paid_at || null,
    status: doc.status || '',
    registered_by:
      String(doc.registered_by_name || doc.registered_by || doc.created_by_name || '').trim() ||
      null,
  };
}

function mergePaymentTotals(salesTotals, paymentTotals) {
  const merged = { ...(salesTotals || {}) };
  for (const [key, val] of Object.entries(paymentTotals || {})) {
    merged[key] = roundMoney((merged[key] || 0) + Number(val || 0));
  }
  return merged;
}

export { mergePaymentTotals };

/**
 * @param {string} academyId
 * @param {string} dateYmd — YYYY-MM-DD
 */
export async function listStudentPaymentsForReportDay(academyId, dateYmd) {
  if (!DB_ID || !STUDENT_PAYMENTS_COL) {
    return { docs: [], truncated: false };
  }

  const dayEnd = nextDayYmd(dateYmd);
  const all = [];
  let truncated = false;
  let cursor = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const queries = [
      Query.equal('academy_id', academyId),
      Query.greaterThanEqual('paid_at', dateYmd),
      Query.lessThan('paid_at', dayEnd),
      Query.orderDesc('paid_at'),
      Query.limit(PAGE_SIZE),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const list = await databases.listDocuments(DB_ID, STUDENT_PAYMENTS_COL, queries);
    const docs = list.documents || [];
    all.push(...docs.filter((doc) => isDailyReportEligiblePayment(doc, dateYmd)));

    const last = docs[docs.length - 1];
    if (!last?.$id || docs.length < PAGE_SIZE) break;
    cursor = last.$id;
    if (page === MAX_PAGES - 1 && docs.length >= PAGE_SIZE) {
      truncated = true;
      console.warn(
        JSON.stringify({
          event: 'sales_daily_report_payments_truncated',
          academy_id: academyId,
          date: dateYmd,
          count: all.length,
        })
      );
    }
  }

  return { docs: all, truncated };
}

/**
 * Mensalidades recebidas em um intervalo civil (paid_at).
 * @param {string} academyId
 * @param {string} fromYmd — YYYY-MM-DD
 * @param {string} toYmd — YYYY-MM-DD
 */
export async function listStudentPaymentsReceivedInPeriod(academyId, fromYmd, toYmd) {
  if (!DB_ID || !STUDENT_PAYMENTS_COL) {
    return { docs: [], truncated: false };
  }

  const from = String(fromYmd || '').trim().slice(0, 10);
  const to = String(toYmd || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { docs: [], truncated: false };
  }

  const rangeEndExclusive = nextDayYmd(to);
  const all = [];
  let truncated = false;
  let cursor = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const queries = [
      Query.equal('academy_id', academyId),
      Query.greaterThanEqual('paid_at', from),
      Query.lessThan('paid_at', rangeEndExclusive),
      Query.orderDesc('paid_at'),
      Query.limit(PAGE_SIZE),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const list = await databases.listDocuments(DB_ID, STUDENT_PAYMENTS_COL, queries);
    const docs = list.documents || [];
    all.push(...docs.filter((doc) => isReceivedPaymentInPeriod(doc, from, to)));

    const last = docs[docs.length - 1];
    if (!last?.$id || docs.length < PAGE_SIZE) break;
    cursor = last.$id;
    if (page === MAX_PAGES - 1 && docs.length >= PAGE_SIZE) {
      truncated = true;
      console.warn(
        JSON.stringify({
          event: 'finance_overview_payments_truncated',
          academy_id: academyId,
          from,
          to,
          count: all.length,
        })
      );
    }
  }

  return { docs: all, truncated };
}
