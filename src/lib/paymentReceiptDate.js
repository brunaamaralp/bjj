/**
 * Data de recebimento vs mês de cobertura (regularizações retroativas).
 */
import { PAYMENT_CATEGORY, normalizePaymentCategory } from './paymentCategories.js';
import { formatReferenceMonthShort } from './bundleCoverage.js';

/**
 * Mês de cobertura/competência operacional do formulário de pagamento.
 * @param {object} payForm
 * @param {{ referenceMonth?: string }} [opts] — em Mensalidades (mensalidade avulsa), o mês da grade.
 */
export function coverageMonthForPaymentForm(payForm, { referenceMonth } = {}) {
  const category = normalizePaymentCategory(payForm?.payment_type ?? payForm?.payment_category);
  if (category === PAYMENT_CATEGORY.BUNDLE) {
    return String(payForm?.bundle_start_month || '').trim();
  }
  if (category === PAYMENT_CATEGORY.PLAN) {
    return String(referenceMonth || payForm?.reference_month || '').trim();
  }
  return '';
}

/**
 * Sugere YYYY-MM-DD para paid_at: hoje se cobertura = mês atual; senão dia 1 do mês de cobertura.
 * @param {{ coverageMonth?: string, now?: Date }} [opts]
 */
export function suggestPaidAtYmd({ coverageMonth, now = new Date() } = {}) {
  const ym = String(coverageMonth || '').trim();
  const todayYmd = now.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}$/.test(ym)) return todayYmd;
  if (ym === todayYmd.slice(0, 7)) return todayYmd;
  return `${ym}-01`;
}

function isPaidStatus(payForm) {
  const st = String(payForm?.status || 'paid').toLowerCase();
  return st !== 'pending' && st !== 'awaiting';
}

/**
 * true quando mês de paid_at ≠ mês de cobertura (lançamento retroativo ou antecipado).
 */
export function paidAtMonthDivergesFromCoverage(payForm, opts = {}) {
  if (!isPaidStatus(payForm)) return false;
  const category = normalizePaymentCategory(payForm?.payment_type ?? payForm?.payment_category);
  if (category !== PAYMENT_CATEGORY.PLAN && category !== PAYMENT_CATEGORY.BUNDLE) {
    return false;
  }
  const coverage = coverageMonthForPaymentForm(payForm, opts);
  const paidAt = String(payForm?.paid_at || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt) || !/^\d{4}-\d{2}$/.test(coverage)) return false;
  return paidAt.slice(0, 7) !== coverage;
}

export function paidAtCoverageDivergenceMessage(payForm, opts = {}) {
  if (!paidAtMonthDivergesFromCoverage(payForm, opts)) return '';
  const coverage = coverageMonthForPaymentForm(payForm, opts);
  const coverageLabel = formatReferenceMonthShort(coverage);
  const paidLabel = formatReferenceMonthShort(String(payForm?.paid_at || '').slice(0, 7));
  return (
    `Este pagamento cobre ${coverageLabel}, mas a data de recebimento está em ${paidLabel}. ` +
    `O caixa de ${paidLabel} será impactado com o valor integral. ` +
    'Ajuste a data se o dinheiro entrou em outro mês.'
  );
}

export function paidAtCoverageDivergenceConfirmDescription(payForm, opts = {}) {
  if (!paidAtMonthDivergesFromCoverage(payForm, opts)) return '';
  const coverage = coverageMonthForPaymentForm(payForm, opts);
  const coverageLabel = formatReferenceMonthShort(coverage);
  const paidLabel = formatReferenceMonthShort(String(payForm?.paid_at || '').slice(0, 7));
  return (
    `O pagamento cobre ${coverageLabel}, mas a data de recebimento é ${paidLabel}. ` +
    `O valor entrará no caixa de ${paidLabel}. Deseja continuar mesmo assim?`
  );
}
