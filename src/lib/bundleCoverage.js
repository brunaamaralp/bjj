import {
  PAYMENT_CATEGORY,
  enumerateCoverageMonths,
  isBundleAnchorPayment,
} from './paymentCategories.js';

export { enumerateCoverageMonths } from './paymentCategories.js';

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

/** @param {number} months */
export function bundlePlanShortLabel(months) {
  const n = Number(months);
  if (n === 3) return 'trimestral';
  if (n === 6) return 'semestral';
  if (n === 12) return 'anual';
  return `${n} meses`;
}

/** @param {string} ym YYYY-MM */
export function formatReferenceMonthShort(ym) {
  const s = String(ym || '').trim();
  if (!/^\d{4}-\d{2}$/.test(s)) return s;
  const [y, m] = s.split('-').map(Number);
  const d = new Date(y, m - 1, 1, 12, 0, 0, 0);
  const label = d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
  return label.replace(/\./g, '').replace(/\s+de\s+/i, '/');
}

/** @param {string} ym YYYY-MM */
export function formatReferenceMonthLong(ym) {
  const s = String(ym || '').trim();
  if (!/^\d{4}-\d{2}$/.test(s)) return s;
  const [y, m] = s.split('-').map(Number);
  const d = new Date(y, m - 1, 1, 12, 0, 0, 0);
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

/**
 * Ação ao aplicar cobertura num mês que já tem registro.
 * @returns {'create'|'upsert'|'skip'}
 */
export function resolveBundleMonthAction(existing) {
  if (!existing) return 'create';
  const st = String(existing.status || '').toLowerCase();
  if (st === 'paid' || st === 'partial') return 'skip';
  return 'upsert';
}

/** Motivo de cobertura sem recebimento (migração / pagamento pré-sistema). */
export const HISTORICAL_COVERED_REASON = 'historical';

export const HISTORICAL_COVERAGE_DEFAULT_NOTE = 'Cobertura histórica — migração';

export const HISTORICAL_COVERAGE_MIN_MONTHS = 1;
export const HISTORICAL_COVERAGE_MAX_MONTHS = 24;

/** @param {unknown} doc */
export function isHistoricalCoveragePayment(doc) {
  return String(doc?.covered_reason || '').trim().toLowerCase() === HISTORICAL_COVERED_REASON;
}

/**
 * Specs de cobertura histórica: todos os meses `covered`, amount 0, sem Caixa.
 * `bundle_months` na âncora é atribuído na create (primeiro mês escrito).
 * @param {{ startYm: string, bundleMonths: number, note?: string }} opts
 */
export function buildHistoricalCoverageMonthSpecs({ startYm, bundleMonths, note }) {
  const months = Math.trunc(Number(bundleMonths));
  if (
    !Number.isFinite(months) ||
    months < HISTORICAL_COVERAGE_MIN_MONTHS ||
    months > HISTORICAL_COVERAGE_MAX_MONTHS
  ) {
    return [];
  }
  const coverage = enumerateCoverageMonths(startYm, months);
  if (coverage.length === 0) return [];

  const userNote = String(note || '').trim();
  const baseNote = userNote
    ? `${HISTORICAL_COVERAGE_DEFAULT_NOTE}. ${userNote}`.slice(0, 500)
    : HISTORICAL_COVERAGE_DEFAULT_NOTE;

  return coverage.map((reference_month) => ({
    reference_month,
    amount: 0,
    payment_category: PAYMENT_CATEGORY.BUNDLE,
    bundle_months: null,
    status: 'covered',
    paid_at: null,
    covered_reason: HISTORICAL_COVERED_REASON,
    note: baseNote,
  }));
}

/**
 * Preview de ações por mês (create/upsert vs skip paid/partial).
 * @param {{ specs: Array<{ reference_month: string }>, existingByMonth: Map<string, unknown>|Record<string, unknown> }} opts
 */
export function previewHistoricalCoverage({ specs, existingByMonth }) {
  const list = Array.isArray(specs) ? specs : [];
  let monthsToWrite = 0;
  let monthsSkipped = 0;
  for (const spec of list) {
    const ym = String(spec?.reference_month || '');
    const existing =
      existingByMonth instanceof Map
        ? existingByMonth.get(ym)
        : existingByMonth?.[ym];
    if (resolveBundleMonthAction(existing) === 'skip') monthsSkipped += 1;
    else monthsToWrite += 1;
  }
  return { monthsToWrite, monthsSkipped, total: list.length };
}

/**
 * Especificações de cada mês do pacote (âncora + cobertos).
 * @param {{ startYm: string, bundleMonths: number, totalAmount: number, base: Record<string, unknown> }} opts
 */
export function buildCoverageMonthSpecs({ startYm, bundleMonths, totalAmount, base }) {
  const months = Number(bundleMonths);
  const coverage = enumerateCoverageMonths(startYm, months);
  if (coverage.length === 0) return [];

  const valorPorMes = roundMoney(totalAmount / months);
  const planLabel = bundlePlanShortLabel(months);
  const startLabel = formatReferenceMonthShort(startYm);

  return coverage.map((reference_month, i) => ({
    ...base,
    reference_month,
    amount: i === 0 ? roundMoney(totalAmount) : valorPorMes,
    paid_amount: i === 0 ? roundMoney(totalAmount) : undefined,
    payment_category: PAYMENT_CATEGORY.BUNDLE,
    bundle_months: i === 0 ? months : null,
    status: i === 0 ? 'paid' : 'covered',
    paid_at: i === 0 ? base.paid_at : null,
    note:
      i === 0
        ? String(base.note || '').trim() || `Plano ${planLabel}`
        : `Coberto por plano ${planLabel} — pagamento de ${startLabel}`,
  }));
}

/** Compara YYYY-MM. */
export function compareReferenceMonths(a, b) {
  return String(a || '').localeCompare(String(b || ''));
}

/** Último mês da cobertura (início + N-1). */
export function coverageEndMonth(startYm, bundleMonths) {
  const list = enumerateCoverageMonths(startYm, bundleMonths);
  return list[list.length - 1] || startYm;
}

/**
 * Agrupa pagamentos do aluno para exibição no perfil.
 * @param {Array<Record<string, unknown>>} payments
 */
export function groupStudentPaymentsForProfile(payments) {
  const list = [...(payments || [])];
  const byId = new Map(list.map((p) => [String(p.$id), p]));
  const used = new Set();
  const groups = [];

  for (const p of list) {
    const id = String(p.$id || '');
    if (!id || used.has(id)) continue;
    if (!isBundleAnchorPayment(p)) continue;

    const anchorId = String(p.bundle_origin_id || p.$id);
    const children = list.filter((c) => {
      const oid = String(c.bundle_origin_id || '').trim();
      return oid === anchorId && String(c.$id) !== id;
    });
    for (const c of children) used.add(String(c.$id));
    used.add(id);

    const months = Number(p.bundle_months) || children.length + 1;
    const startYm = String(p.reference_month || '');
    groups.push({
      type: 'bundle',
      anchor: p,
      children: children.sort((a, b) =>
        compareReferenceMonths(a.reference_month, b.reference_month)
      ),
      months,
      startYm,
      endYm: coverageEndMonth(startYm, months),
    });
  }

  const singles = list
    .filter((p) => !used.has(String(p.$id)))
    .sort((a, b) => compareReferenceMonths(b.reference_month, a.reference_month));

  for (const p of singles) {
    groups.push({ type: 'single', payment: p });
  }

  groups.sort((a, b) => {
    const ma = a.type === 'bundle' ? a.startYm : a.payment?.reference_month;
    const mb = b.type === 'bundle' ? b.startYm : b.payment?.reference_month;
    return compareReferenceMonths(mb, ma);
  });

  return { groups, byId };
}

/** Meses futuros cobertos canceláveis a partir de `fromYm`. */
export function listCancellableCoveredMonths(anchorId, payments, fromYm) {
  const aid = String(anchorId || '').trim();
  if (!aid) return [];
  return (payments || []).filter((p) => {
    const st = String(p.status || '').toLowerCase();
    if (st !== 'covered') return false;
    const oid = String(p.bundle_origin_id || '').trim();
    if (oid !== aid && String(p.$id) !== aid) return false;
    return compareReferenceMonths(p.reference_month, fromYm) >= 0;
  });
}

export function findAnchorPayment(payment, paymentsById) {
  if (!payment) return null;
  if (isBundleAnchorPayment(payment)) return payment;
  const oid = String(payment.bundle_origin_id || '').trim();
  if (!oid) return null;
  return paymentsById?.get?.(oid) || null;
}

function resolvePaidBundleAnchorMonths(payment) {
  const st = String(payment?.status || '').toLowerCase();
  const historical =
    String(payment?.covered_reason || '').trim().toLowerCase() === HISTORICAL_COVERED_REASON;
  const isAnchor = isBundleAnchorPayment(payment) || Number(payment?.bundle_months) >= 2;
  // Pacote pago clássico OU âncora de cobertura histórica (todos covered).
  if (st === 'paid') {
    /* ok */
  } else if (st === 'covered' && isAnchor && (historical || Number(payment?.bundle_months) >= 1)) {
    /* ok */
  } else {
    return null;
  }

  const startYm = String(payment?.reference_month || '').trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(startYm)) return null;

  let months = Number(payment?.bundle_months);
  if (!Number.isFinite(months) || months < 1) {
    if (isBundleAnchorPayment(payment)) months = 12;
    else return null;
  }

  return { startYm, months: Math.trunc(months) };
}

/**
 * Meses cobertos por âncoras pagas (plano anual/trimestral), mesmo sem registros `covered`.
 * @returns {Map<string, Set<string>>} leadId → Set<YYYY-MM>
 */
export function buildPaidBundleCoveredMonthsByLead(payments = []) {
  const byLead = new Map();

  for (const raw of payments) {
    const lid = String(raw?.lead_id || raw?.leadId || '').trim();
    if (!lid) continue;

    const anchor =
      isBundleAnchorPayment(raw) || Number(raw?.bundle_months) >= 2
        ? raw
        : null;
    if (!anchor) continue;

    const spec = resolvePaidBundleAnchorMonths(anchor);
    if (!spec) continue;

    if (!byLead.has(lid)) byLead.set(lid, new Set());
    const covered = byLead.get(lid);
    for (const ym of enumerateCoverageMonths(spec.startYm, spec.months)) {
      covered.add(ym);
    }
  }

  return byLead;
}

/** @param {Set<string>|undefined} coveredMonths */
export function isMonthCoveredByPaidBundle(ym, coveredMonths) {
  const month = String(ym || '').trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return false;
  return coveredMonths?.has(month) === true;
}
