import {
  PAYMENT_CATEGORY,
  enumerateCoverageMonths,
  isBundleAnchorPayment,
} from './paymentCategories.js';

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
