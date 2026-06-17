/**
 * Helpers para a aba Visão Geral do hub Financeiro (somente agregação no cliente).
 */
import { forecast30DaysRange, todayYmdLocal } from './financeForecastCore.js';
import { PAYABLE_SOURCE } from './payablesAggregate.js';
import {
  expectedAmountForStudent,
  receivedAmountForPayment,
} from './paymentStatus.js';
import { getPaymentRowStatus, openAmountForStudent } from './collectionOverdue.js';
import { isActiveStudent } from './studentStatus.js';
import { buildClosingRows } from './monthlyClosing.js';

export function currentMonthYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function previousMonthYm(ym) {
  return shiftMonthYm(ym, -1);
}

/** Desloca YYYY-MM por `delta` meses (ex.: +1 próximo, -1 anterior). */
export function shiftMonthYm(ym, delta) {
  const ref = String(ym || currentMonthYm()).trim();
  const d = new Date(`${ref}-02T12:00:00`);
  if (Number.isNaN(d.getTime())) return ref;
  d.setMonth(d.getMonth() + delta);
  return d.toISOString().slice(0, 7);
}

export function formatMonthTitleCapitalized(ym) {
  try {
    const raw = new Date(`${ym}-02T12:00:00`).toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });
    const s = String(raw || '').trim();
    if (!s) return ym;
    return s.charAt(0).toUpperCase() + s.slice(1);
  } catch {
    return ym;
  }
}

/** Limites YYYY-MM-DD do mês civil (até hoje se for o mês corrente). */
export function monthPeriodBounds(ym) {
  const ref = String(ym || currentMonthYm()).trim();
  const m = ref.match(/^(\d{4})-(\d{2})$/);
  if (!m) return { from: '', to: '' };
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const from = `${ref}-01`;
  const lastDay = new Date(y, mo, 0).getDate();
  const monthEnd = `${ref}-${String(lastDay).padStart(2, '0')}`;
  const today = todayYmdLocal();
  const to = ref === today.slice(0, 7) ? today : monthEnd;
  return { from, to };
}

/** Último dia civil do mês YYYY-MM como YYYY-MM-DD. */
export function monthEndYmd(ym) {
  const ref = String(ym || currentMonthYm()).trim();
  const m = ref.match(/^(\d{4})-(\d{2})$/);
  if (!m) return '';
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const lastDay = new Date(y, mo, 0).getDate();
  return `${ref}-${String(lastDay).padStart(2, '0')}`;
}

export function forecastNext30Range() {
  return forecast30DaysRange();
}

export const OVERVIEW_RECEIVABLES_TOP_N = 5;
export const OVERVIEW_FORECAST_TOP_N = 5;
export const OVERVIEW_PAYABLES_TOP_N = 5;

/** Resumo enxuto de recebíveis para Visão Geral (top N por vencimento). */
export function trimReceivablesForOverview(snapshot, limit = OVERVIEW_RECEIVABLES_TOP_N) {
  if (!snapshot) return null;
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const topItems = [...items]
    .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')))
    .slice(0, limit);
  return {
    referenceMonth: snapshot.referenceMonth,
    summary: snapshot.summary,
    topItems,
    totalItems: items.length,
  };
}

/** Resumo enxuto de contas a pagar para Visão Geral. */
export function trimPayablesForOverview(snapshot, limit = OVERVIEW_PAYABLES_TOP_N) {
  if (!snapshot) return null;
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const topItems = [...items]
    .filter((it) => it.source !== PAYABLE_SOURCE.TEMPLATE)
    .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')))
    .slice(0, limit)
    .map((it) => ({
      id: it.id,
      vendor_label: it.vendor_label,
      due_date: it.due_date,
      amount: it.amount,
    }));
  return {
    summary: snapshot.summary,
    topItems,
    totalItems: items.length,
  };
}

/** Previsão enxuta para Visão Geral (total de entradas + top N itens). */
export function trimForecastForOverview(forecastBody, limit = OVERVIEW_FORECAST_TOP_N) {
  if (!forecastBody) return null;
  const allItems = flattenForecastItems(forecastBody);
  return {
    inflowTotal: sumForecastInflow(allItems),
    topItems: allItems.filter((it) => it.flow !== 'out').slice(0, limit),
  };
}

/**
 * KPIs de mensalidades do mês (mesma base da página de mensalidades).
 */
export function computeMensalidadesMonthKpis(students, payments, financeConfig, referenceMonth) {
  const active = (students || []).filter((s) => isActiveStudent(s) && String(s.plan || '').trim());
  const payByLead = {};
  for (const p of payments || []) {
    const lid = String(p.lead_id || '').trim();
    if (!lid) continue;
    payByLead[lid] = p;
  }

  let expectedTotal = 0;
  let receivedTotal = 0;
  let overdueCount = 0;
  let overdueOpen = 0;

  for (const s of active) {
    const p = payByLead[s.id];
    const exp = expectedAmountForStudent(s, financeConfig, p);
    if (Number.isFinite(exp) && exp > 0) expectedTotal += exp;
    receivedTotal += receivedAmountForPayment(p) || 0;

    const row = getPaymentRowStatus(s, p, referenceMonth);
    if (row.status === 'pending' && row.daysOverdue >= 1) {
      overdueCount += 1;
      overdueOpen += openAmountForStudent(s, p, financeConfig) || 0;
    }
  }

  return {
    activeWithPlan: active.length,
    expectedTotal: Math.round(expectedTotal * 100) / 100,
    receivedTotal: Math.round(receivedTotal * 100) / 100,
    overdueCount,
    overdueOpen: Math.round(overdueOpen * 100) / 100,
  };
}

/** Itens de previsão achatados e ordenados por data. */
export function flattenForecastItems(forecastBody) {
  const weeks = forecastBody?.weeks || [];
  const rows = [];
  for (const w of weeks) {
    for (const item of w.items || []) {
      rows.push({
        ...item,
        flow: item.flow || (item._flow === 'out' ? 'out' : 'in'),
      });
    }
  }
  rows.sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));
  return rows;
}

export function sumForecastInflow(items) {
  return items.reduce((s, it) => {
    if (it.flow === 'out') return s;
    return s + Math.abs(Number(it.amount) || 0);
  }, 0);
}

/** Linhas com situação pendente/parcial no fechamento do mês (cliente, sem alterar API). */
export function countClosingDivergences({
  payments,
  transactions,
  students,
  financeConfig,
  referenceMonth,
  regime,
}) {
  try {
    const leadById = new Map((students || []).map((s) => [String(s.id), s]));
    const rows = buildClosingRows({
      payments: payments || [],
      transactions: transactions || [],
      leadById,
      financeConfig: financeConfig || {},
      referenceMonth,
      regime,
    });
    return rows.filter((r) => r.situation === 'pendente' || r.situation === 'parcial').length;
  } catch {
    return 0;
  }
}

/**
 * Variação do saldo vs mês anterior para exibição na Visão Geral.
 * @returns {{ type: 'pct', pct: number } | { type: 'text', text: string }}
 */
export function formatBalanceDelta(current, previous) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (p === 0) {
    if (c === 0) return { type: 'text', text: 'Sem movimento no período' };
    return { type: 'text', text: 'Primeiro mês com movimento' };
  }
  const pct = Math.round(((c - p) / p) * 1000) / 10;
  return { type: 'pct', pct };
}

/** @deprecated Prefer formatBalanceDelta */
export function pctChange(current, previous) {
  const r = formatBalanceDelta(current, previous);
  if (r.type === 'text') return null;
  return r.pct;
}
