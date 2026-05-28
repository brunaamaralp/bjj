/**
 * Helpers para a aba Visão Geral do hub Financeiro (somente agregação no cliente).
 */
import { forecast30DaysRange, todayYmdLocal } from './financeForecastCore.js';
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
  const ref = String(ym || currentMonthYm()).trim();
  const m = ref.match(/^(\d{4})-(\d{2})$/);
  if (!m) return ref;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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

export function forecastNext30Range() {
  return forecast30DaysRange();
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
