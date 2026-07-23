import {
  PAYMENT_CATEGORY,
  normalizePaymentCategory,
  isBundleAnchorPayment,
  isBundleChildPayment,
} from './paymentCategories.js';
import {
  formatReferenceMonthLong,
  formatReferenceMonthShort,
  coverageEndMonth,
  groupStudentPaymentsForProfile,
  isHistoricalCoveragePayment,
} from './bundleCoverage.js';
import { openAmountForStudent } from './collectionOverdue.js';
import { isFreezeActive, formatFreezeDateBr } from './planFreeze.js';
import { paymentTimelineBadge } from './paymentStatus.js';
import {
  formatDiscountSummaryLabel,
  getStudentDiscountAmount,
  isExemptPlan,
  normalizeDiscountType,
  resolveStudentPlan,
  resolveStudentPlanBasePrice,
  resolveStudentPlanFinalPrice,
} from './planBilling.js';

export const TIMELINE_FILTER_TYPES = {
  ALL: 'all',
  PLAN: 'plan',
  BUNDLE: 'bundle',
  PRODUCT: 'product',
  FEE: 'fee',
};

/** Defaults da aba Pagamentos no perfil (recepção: mensalidades recentes). */
export const DEFAULT_TIMELINE_TYPE_FILTER = TIMELINE_FILTER_TYPES.PLAN;
export const DEFAULT_TIMELINE_PERIOD_FILTER = '3m';

export const PERIOD_FILTERS = {
  '3m': 3,
  '6m': 6,
  '12m': 12,
  all: null,
};

/** @param {string|Date|null} iso */
export function timelineSortKey(iso) {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function paymentSortDate(payment) {
  if (payment.paid_at) return payment.paid_at;
  if (payment.reference_month) return `${payment.reference_month}-15T12:00:00.000Z`;
  return payment.$createdAt || payment.created_at || null;
}

function paymentStatusBadge(st) {
  return paymentTimelineBadge(st);
}

/**
 * @param {Array} freezeRecords — documentos plan_freezes
 */
export function buildFreezeTimelineItems(freezeRecords) {
  return (freezeRecords || []).map((fr) => {
    const start = String(fr.start_date || '').slice(0, 10);
    const end = String(fr.end_date || '').slice(0, 10);
    const days = Number(fr.days) || 0;
    return {
      id: `freeze:${fr.$id}`,
      kind: 'freeze',
      sortDate: fr.start_date || fr.created_at || start,
      title: `Trancamento — ${formatFreezeDateBr(start)} a ${formatFreezeDateBr(end)} (${days} dias)`,
      subtitle: fr.reason ? `Motivo: ${fr.reason}` : '',
      amount: 0,
      badge: { label: 'Trancado', tone: 'frozen' },
      freeze: fr,
      days,
    };
  });
}

/**
 * @param {Array} payments
 * @param {Array} sales
 * @returns {Array<object>}
 */
export function buildFinancialTimelineItems(payments, sales, freezeRecords = []) {
  const items = [...buildFreezeTimelineItems(freezeRecords)];
  const { groups } = groupStudentPaymentsForProfile(payments || []);

  for (const g of groups) {
    if (g.type === 'bundle') {
      const { anchor, children, months, startYm, endYm } = g;
      const coverageEnd = endYm || coverageEndMonth(startYm, months);
      const historical = isHistoricalCoveragePayment(anchor);
      items.push({
        id: `bundle:${anchor.$id}`,
        kind: 'bundle',
        sortDate: paymentSortDate(anchor),
        title: historical
          ? `Cobertura histórica — ${formatReferenceMonthLong(anchor.reference_month)}`
          : `Mensalidade — ${formatReferenceMonthLong(anchor.reference_month)}`,
        subtitle: historical
          ? `Migração · cobre ${formatReferenceMonthLong(startYm)} a ${formatReferenceMonthLong(coverageEnd)}`
          : `Cobre ${formatReferenceMonthLong(startYm)} a ${formatReferenceMonthLong(coverageEnd)}`,
        amount: Number(anchor.amount ?? anchor.paid_amount ?? 0),
        badge: paymentStatusBadge(anchor.status || (historical ? 'covered' : 'paid')),
        anchor,
        payment: anchor,
        children,
        months,
        startYm,
        endYm: coverageEnd,
        historical,
      });
      continue;
    }

    const p = g.payment;
    if (!p || isBundleChildPayment(p)) continue;

    const cat = normalizePaymentCategory(p);
    if (cat === PAYMENT_CATEGORY.FEE) {
      items.push({
        id: `fee:${p.$id}`,
        kind: 'fee',
        sortDate: paymentSortDate(p),
        title: String(p.note || '').trim() || 'Taxa / avulso',
        subtitle: p.paid_at ? formatReferenceMonthShort(String(p.paid_at).slice(0, 7)) : 'Avulso',
        amount: Number(p.amount || 0),
        badge: paymentStatusBadge(p.status),
        payment: p,
      });
    } else if (cat === PAYMENT_CATEGORY.OTHER) {
      items.push({
        id: `other:${p.$id}`,
        kind: 'other',
        sortDate: paymentSortDate(p),
        title: String(p.note || '').trim() || 'Outro pagamento',
        subtitle: '',
        amount: Number(p.amount || 0),
        badge: paymentStatusBadge(p.status),
        payment: p,
      });
    } else {
      items.push({
        id: `plan:${p.$id}`,
        kind: 'plan',
        sortDate: paymentSortDate(p),
        title: `Mensalidade — ${formatReferenceMonthLong(p.reference_month)}`,
        subtitle: p.plan_name || '',
        amount: Number(p.amount || 0),
        badge: paymentStatusBadge(p.status),
        payment: p,
      });
    }
  }

  for (const sale of sales || []) {
    const st = String(sale.status || '').toLowerCase();
    items.push({
      id: `sale:${sale.id}`,
      kind: 'product',
      sortDate: sale.created_at || sale.cancelada_em,
      title: sale.items_summary || 'Venda de produtos',
      subtitle: sale.payment_label || sale.forma_pagamento || '',
      amount: Number(sale.total || 0),
      badge: {
        label: st === 'cancelada' ? 'Cancelada' : st === 'pendente' ? 'Pendente' : 'Concluída',
        tone: st === 'cancelada' ? 'muted' : st === 'pendente' ? 'warning' : 'success',
      },
      sale,
    });
  }

  items.sort((a, b) => timelineSortKey(b.sortDate) - timelineSortKey(a.sortDate));
  return items;
}

export function filterTimelineItems(items, { typeFilter = 'all', periodKey = '12m' } = {}) {
  const months = PERIOD_FILTERS[periodKey];
  let cutoffMs = null;
  if (months != null) {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    cutoffMs = d.getTime();
  }

  return (items || []).filter((item) => {
    if (typeFilter !== 'all' && item.kind !== typeFilter) return false;
    if (cutoffMs != null && timelineSortKey(item.sortDate) < cutoffMs) return false;
    return true;
  });
}

export function countTimelineHistory(payments, sales) {
  let plans = 0;
  let bundles = 0;
  let fees = 0;
  for (const p of payments || []) {
    if (isBundleChildPayment(p)) continue;
    const cat = normalizePaymentCategory(p);
    if (cat === PAYMENT_CATEGORY.PLAN) plans += 1;
    else if (cat === PAYMENT_CATEGORY.BUNDLE && isBundleAnchorPayment(p)) bundles += 1;
    else if (cat === PAYMENT_CATEGORY.FEE) fees += 1;
  }
  const products = (sales || []).filter((s) => String(s.status || '').toLowerCase() === 'concluida').length;
  return { plans, bundles, fees, products, mensalidades: plans + bundles };
}

/**
 * Resumo financeiro do aluno para o topo da aba.
 */
export function buildFinancialSummary({
  student,
  financeConfig,
  payments,
  sales,
  paymentStatus,
}) {
  const planName = String(student?.plan || '').trim();
  const match = resolveStudentPlan(student, financeConfig);
  const planPrice = resolveStudentPlanBasePrice(student, financeConfig);
  const discountAmount = getStudentDiscountAmount(student);
  const discountType = normalizeDiscountType(student);
  const finalPlanPrice = resolveStudentPlanFinalPrice(student, financeConfig);
  const planIsExempt = isExemptPlan(match);
  const planLabel = planName
    ? planIsExempt
      ? `${planName} · Isento`
      : `${planName}${Number.isFinite(planPrice) && planPrice > 0 ? ` · ${planPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}`
    : '—';
  const discountSummary =
    !planIsExempt && Number.isFinite(planPrice) && planPrice > 0 && discountAmount > 0
      ? {
          discountLabel: formatDiscountSummaryLabel(discountType, discountAmount),
          finalLabel: `Valor final: ${finalPlanPrice.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          })}`,
        }
      : {};

  const dueDay = student?.dueDay ?? student?.due_day;
  const dueLabel = dueDay ? `dia ${dueDay}` : '—';

  const counts = countTimelineHistory(payments, sales);

  const activeBundle = (payments || []).find(
    (p) => isBundleAnchorPayment(p) && String(p.status || '').toLowerCase() === 'paid'
  );

  if (activeBundle) {
    const months = Number(activeBundle.bundle_months) || 12;
    const startYm = String(activeBundle.reference_month || '');
    const endYm = coverageEndMonth(startYm, months);
    const coveredChildren = (payments || []).filter(
      (p) =>
        String(p.status || '').toLowerCase() === 'covered' &&
        String(p.bundle_origin_id || '') === String(activeBundle.$id || activeBundle.bundle_origin_id)
    );
    const totalCovered = 1 + coveredChildren.length;
    return {
      planLabel: `Anual / pacote · ${formatReferenceMonthShort(startYm)} a ${formatReferenceMonthShort(endYm)}`,
      dueLabel: `Cobre até: ${formatReferenceMonthShort(endYm)}`,
      situationLabel: `Coberto (${totalCovered}/${months} meses)`,
      situationTone: 'success',
      historyLabel: `${counts.mensalidades} mensalidades · ${counts.products} compras · ${counts.fees} taxas`,
      isBundle: true,
      ...discountSummary,
    };
  }

  if (isFreezeActive(student)) {
    const endYmd = String(student.freeze_end || '').slice(0, 10);
    return {
      planLabel: planLabel !== '—' ? planLabel : 'Plano anual',
      dueLabel: endYmd ? `Trancado até ${formatFreezeDateBr(endYmd)}` : 'Plano trancado',
      situationLabel: 'Trancamento ativo',
      situationTone: 'muted',
      historyLabel: `${counts.mensalidades} mensalidades · ${counts.products} compras · ${counts.fees} taxas`,
      isBundle: false,
      isFrozen: true,
      ...discountSummary,
    };
  }

  if (planIsExempt) {
    return {
      planLabel: planLabel !== '—' ? planLabel : 'Plano isento',
      dueLabel: 'Sem vencimento de mensalidade',
      situationLabel: 'Plano isento, sem cobrança mensal',
      situationTone: 'muted',
      historyLabel: `${counts.mensalidades} mensalidades · ${counts.products} compras · ${counts.fees} taxas`,
      isBundle: false,
    };
  }

  const st = paymentStatus?.status || 'none';
  // Default labels
  let situationLabel = 'Sem registro no mês atual';
  let situationTone = 'muted';
  // Detect any payment (plan, bundle, fee, etc.) that covers the current month
  const currentYm = new Date().toISOString().slice(0, 7);
  const currentMonthPayment = (payments || []).find((p) => {
    const month = String(p.reference_month || '').slice(0, 7);
    return month === currentYm && ['paid', 'covered', 'pending', 'partial'].includes(String(p.status || '').toLowerCase());
  });
  if (st === 'paid' || currentMonthPayment) {
    // Find the most recent paid/covered payment
    const lastPaid = (payments || [])
      .filter((p) => ['paid', 'covered'].includes(String(p.status || '').toLowerCase()))
      .sort((a, b) => String(b.reference_month || '').localeCompare(String(a.reference_month || '')))[0];
    if (lastPaid?.reference_month) {
      situationLabel = `Em dia (último: ${formatReferenceMonthShort(lastPaid.reference_month)})`;
      situationTone = 'success';
    } else if (currentMonthPayment) {
      // Current month payment exists but may not be marked paid yet
      situationLabel = `Registro no mês atual (status: ${String(currentMonthPayment.status).toLowerCase()})`;
      situationTone = String(currentMonthPayment.status).toLowerCase() === 'paid' ? 'success' : 'warning';
    } else if (st === 'paid') {
      // Status API diz pago, mas lista de pagamentos ainda não carregou (card esquerdo).
      situationLabel = 'Em dia';
      situationTone = 'success';
    }
  } else if (st === 'pending' || st === 'partial' || st === 'awaiting') {
    situationLabel = st === 'partial' ? 'Pagamento parcial — em atraso' : 'Em atraso';
    situationTone = 'danger';
  } else if (st === 'soon') {
    situationLabel = dueDay ? `A vencer (dia ${dueDay})` : 'A vencer';
    situationTone = 'warning';
  } else if (st === 'exempt') {
    situationLabel = 'Plano isento, sem cobrança mensal';
    situationTone = 'muted';
  }

  const expected = openAmountForStudent(student, null, financeConfig);

  return {
    planLabel: planLabel !== '—' ? planLabel : expected > 0 ? `Plano · ${expected.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : '—',
    dueLabel: `Vence: ${dueLabel}`,
    situationLabel,
    situationTone,
    historyLabel: `${counts.mensalidades} mensalidades · ${counts.products} compras · ${counts.fees} taxas`,
    isBundle: false,
    ...discountSummary,
  };
}

/** Badge curto + classe CSS do card esquerdo (mesma fonte que SituationHero). */
export function profilePaymentStatusChrome(summary, { loading = false } = {}) {
  if (loading || !summary) {
    return {
      title: 'Carregando...',
      subtitle: 'Status financeiro',
      badge: '…',
      toneClass: 'loading',
    };
  }
  const tone = summary.situationTone || 'muted';
  let badge = '—';
  if (summary.isFrozen) badge = 'Trancado';
  else if (summary.isBundle) badge = 'Coberto';
  else if (tone === 'success') badge = 'Em dia';
  else if (tone === 'danger') badge = 'Em atraso';
  else if (tone === 'warning') badge = 'A vencer';
  else if (/isento/i.test(String(summary.situationLabel || ''))) badge = 'Isento';
  else if (/sem registro/i.test(String(summary.situationLabel || ''))) badge = 'Sem registro';

  const toneClass =
    tone === 'success' ? 'paid' : tone === 'danger' || tone === 'warning' ? 'pending' : 'neutral';

  const subtitle = [summary.planLabel, summary.dueLabel].filter((x) => x && x !== '—').join(' · ');

  return {
    title: summary.situationLabel,
    subtitle: subtitle || 'Aba Pagamentos',
    badge,
    toneClass,
  };
}

export function filterTypeCounts(allItems) {
  const c = {
    all: allItems.length,
    plan: 0,
    bundle: 0,
    product: 0,
    fee: 0,
  };
  for (const item of allItems) {
    if (item.kind === 'plan') c.plan += 1;
    if (item.kind === 'bundle') c.bundle += 1;
    if (item.kind === 'product') c.product += 1;
    if (item.kind === 'fee') c.fee += 1;
  }
  return c;
}
