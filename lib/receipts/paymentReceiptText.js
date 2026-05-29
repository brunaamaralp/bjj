import { stripUnusedPlaceholders } from '../../src/lib/salesReceipt.js';
import { formatBRL } from '../../src/lib/moneyBr.js';
import { paymentLabel } from '../../src/lib/salesSettings.js';
import {
  PAYMENT_CATEGORY,
  normalizePaymentCategory,
  isBundleAnchorPayment,
} from '../../src/lib/paymentCategories.js';
import {
  bundlePlanShortLabel,
  formatReferenceMonthLong,
  formatReferenceMonthShort,
  enumerateCoverageMonths,
} from '../../src/lib/bundleCoverage.js';

export const DEFAULT_PAYMENT_RECEIPT_TEMPLATE = `{academy_name}
COMPROVANTE DE PAGAMENTO

Aluno: {student_name}
Referência: {payment_id}
Categoria: {category_label}
Plano: {plan_name}
Competência: {reference_month}

Valor recebido: {amount}
Forma de pagamento: {method}
Data do pagamento: {paid_at}
Registrado por: {registered_by}

{coverage_lines}
{note_block}

{footer}`;

export function formatPaymentIdShort(id) {
  const s = String(id || '').trim();
  if (s.length < 4) return s ? `#${s.toUpperCase()}` : '—';
  return `#${s.slice(-4).toUpperCase()}`;
}

export function paymentCategoryLabel(category) {
  const cat = normalizePaymentCategory(category);
  if (cat === PAYMENT_CATEGORY.PLAN) return 'Mensalidade';
  if (cat === PAYMENT_CATEGORY.BUNDLE) return 'Plano (pacote)';
  if (cat === PAYMENT_CATEGORY.FEE) return 'Taxa / avulso';
  return 'Outro';
}

/** @returns {{ ok: boolean, reason?: string }} */
export function isPaymentReceiptEligible(payment) {
  const st = String(payment?.status || '').toLowerCase();
  if (st === 'cancelled' || st === 'pending' || st === 'covered' || st === 'frozen') {
    return { ok: false, reason: 'status_not_eligible' };
  }
  if (st !== 'paid' && st !== 'partial') {
    return { ok: false, reason: 'status_not_eligible' };
  }
  const amt =
    st === 'partial'
      ? Number(payment?.paid_amount ?? payment?.amount)
      : Number(payment?.paid_amount ?? payment?.amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return { ok: false, reason: 'no_amount' };
  }
  return { ok: true };
}

function formatPaidAtBr(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildCoverageLines(payment, bundlePayments) {
  if (!isBundleAnchorPayment(payment)) return '';
  const months = Number(payment.bundle_months) || 0;
  const startYm = String(payment.reference_month || '').trim();
  if (!months || !startYm) return '';

  const listed =
    Array.isArray(bundlePayments) && bundlePayments.length
      ? bundlePayments
          .map((p) => String(p.reference_month || '').trim())
          .filter(Boolean)
          .sort()
      : enumerateCoverageMonths(startYm, months);

  if (!listed.length) return '';
  const lines = listed.map((ym) => `  • ${formatReferenceMonthLong(ym)}`);
  return `Meses cobertos:\n${lines.join('\n')}`;
}

/**
 * @param {object} opts
 * @param {string} [opts.template]
 * @param {string} [opts.footer]
 * @param {string} opts.academyName
 * @param {string} opts.studentName
 * @param {object} opts.payment — documento student_payments
 * @param {Array<object>} [opts.bundlePayments] — meses do pacote (âncora)
 */
export function buildPaymentReceiptText({
  template = DEFAULT_PAYMENT_RECEIPT_TEMPLATE,
  footer = '',
  academyName,
  studentName,
  payment,
  bundlePayments = [],
}) {
  const eligible = isPaymentReceiptEligible(payment);
  if (!eligible.ok) {
    throw new Error(eligible.reason || 'payment_not_eligible');
  }

  const st = String(payment.status || '').toLowerCase();
  const amount =
    st === 'partial'
      ? Number(payment.paid_amount ?? payment.amount)
      : Number(payment.paid_amount ?? payment.amount);

  const refYm = String(payment.reference_month || '').trim();
  const referenceMonth = refYm ? formatReferenceMonthLong(refYm) : '—';

  const planName = String(payment.plan_name || '').trim() || '—';
  const note = String(payment.note || '').trim();
  const noteBlock = note ? `Observações:\n${note}` : '';

  const coverageLines = buildCoverageLines(payment, bundlePayments);

  const vars = {
    academy_name: String(academyName || 'Academia').trim(),
    student_name: String(studentName || 'Aluno').trim(),
    payment_id: formatPaymentIdShort(payment.$id || payment.id),
    category_label: paymentCategoryLabel(payment.payment_category),
    plan_name: planName,
    reference_month: referenceMonth,
    amount: formatBRL(amount),
    method: paymentLabel(payment.method),
    paid_at: formatPaidAtBr(payment.paid_at || payment.$createdAt),
    registered_by: String(payment.registered_by_name || payment.registered_by || '—').trim() || '—',
    coverage_lines: coverageLines,
    note_block: noteBlock,
    footer: String(footer || '').trim(),
  };

  let out = String(template || '');
  for (const [key, val] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
  }
  return stripUnusedPlaceholders(out);
}

/** Título curto para pacote no recibo. */
export function bundleReceiptPlanLine(payment) {
  const months = Number(payment?.bundle_months) || 0;
  const startYm = String(payment?.reference_month || '').trim();
  if (!months || !startYm) return '';
  const endShort = formatReferenceMonthShort(
    enumerateCoverageMonths(startYm, months).slice(-1)[0] || startYm
  );
  return `Plano ${bundlePlanShortLabel(months)} — ${formatReferenceMonthShort(startYm)} a ${endShort}`;
}
