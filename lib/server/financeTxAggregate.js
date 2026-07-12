/**
 * Agregações de FINANCIAL_TX (evita duplicação entre summary, reports e NL).
 */
import { txDirection } from './financeTxFields.js';
import { roundMoney } from '../money.js';
import {
  isOperationalInflowTx,
  isOperationalOutflowTx,
  operationalBucketForTx,
} from '../../src/lib/financeCategories.js';
import {
  buildWeekRanges,
  findWeekIndex,
} from '../../src/lib/financeForecastCore.js';

function formatOperationalWeekLabel(weekStart, weekEnd) {
  const ws = String(weekStart || '').slice(0, 10);
  const we = String(weekEnd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ws) || !/^\d{4}-\d{2}-\d{2}$/.test(we)) return ws || '—';
  const startDay = Number(ws.slice(8, 10));
  const endDay = Number(we.slice(8, 10));
  const startMonth = new Date(Number(ws.slice(0, 4)), Number(ws.slice(5, 7)) - 1, 1).toLocaleDateString(
    'pt-BR',
    { month: 'short' }
  );
  const endMonth = new Date(Number(we.slice(0, 4)), Number(we.slice(5, 7)) - 1, 1).toLocaleDateString(
    'pt-BR',
    { month: 'short' }
  );
  const sm = startMonth.replace('.', '').trim();
  const em = endMonth.replace('.', '').trim();
  if (ws.slice(0, 7) === we.slice(0, 7)) return `${startDay}–${endDay} ${sm}`;
  return `${startDay} ${sm} – ${endDay} ${em}`;
}

/**
 * Faturamento (Σ gross) vs recebimentos (Σ net) vs taxas (Σ fee) em entradas liquidadas.
 */
export function aggregateRevenueBreakdown(docs) {
  let grossIn = 0;
  let fees = 0;
  let netIn = 0;
  let count = 0;

  for (const doc of docs || []) {
    if (String(doc.status || '').toLowerCase() !== 'settled') continue;
    if (txDirection(doc) !== 'in') continue;
    if (!isOperationalInflowTx(doc)) continue;
    const gross = Math.abs(Number(doc.gross) || 0);
    const fee = Math.abs(Number(doc.fee) || 0);
    const net = Math.abs(Number(doc.net) || gross);
    grossIn += gross;
    fees += fee;
    netIn += net;
    count += 1;
  }

  return {
    grossIn: roundMoney(grossIn),
    fees: roundMoney(fees),
    netIn: roundMoney(netIn),
    count,
  };
}

/**
 * Resumo de período: liquidado + pendente (Visão Geral / assistente NL).
 * @param {object[]} docs
 */
export function aggregatePeriodSummary(docs) {
  let settledIn = 0;
  let settledOut = 0;
  let pendingIn = 0;
  let pendingOut = 0;
  let countSettled = 0;
  let countPending = 0;

  for (const doc of docs || []) {
    const st = String(doc.status || '').toLowerCase();
    if (st === 'cancelled') continue;
    const bucket = operationalBucketForTx(doc);
    const dir = txDirection(doc);
    const gross = Math.abs(Number(doc.gross) || 0);
    const net = Math.abs(Number(doc.net) || gross);
    if (st === 'settled') {
      countSettled += 1;
      if (bucket === 'neutral') continue;
      if (dir === 'out') settledOut += gross;
      else settledIn += net;
    } else if (st === 'pending') {
      countPending += 1;
      if (bucket === 'neutral') continue;
      if (dir === 'out') pendingOut += gross;
      else pendingIn += gross;
    }
  }

  const periodBalance = roundMoney(settledIn - settledOut);

  return {
    settledIn: roundMoney(settledIn),
    settledOut: roundMoney(settledOut),
    periodBalance,
    pendingIn: roundMoney(pendingIn),
    pendingOut: roundMoney(pendingOut),
    countSettled,
    countPending,
  };
}

/**
 * Resumo operacional (Relatórios): apenas liquidado, com byMethod e refunds.
 * @param {object[]} docs
 */
export function aggregateOperationalSummary(docs) {
  let received = 0;
  let expenses = 0;
  let receivedCount = 0;
  let expenseCount = 0;
  const byMethod = {};

  for (const doc of docs || []) {
    if (String(doc.status || '').toLowerCase() !== 'settled') continue;
    const dir = txDirection(doc);
    const gross = Math.abs(Number(doc.gross) || 0);
    const netAbs = Math.abs(Number(doc.net) || gross);
    const typeLc = String(doc.type || '').toLowerCase();
    if (dir === 'out') {
      if (!isOperationalOutflowTx(doc)) continue;
      expenses += gross;
      expenseCount += 1;
    } else if (typeLc === 'refund') {
      if (!isOperationalInflowTx(doc)) continue;
      const rawNet = Number(doc.net);
      received += Number.isFinite(rawNet) && rawNet !== 0 ? rawNet : -gross;
      receivedCount += 1;
    } else {
      if (!isOperationalInflowTx(doc)) continue;
      const add = netAbs;
      received += add;
      receivedCount += 1;
      const method = String(doc.method || 'outro').toLowerCase();
      byMethod[method] = (byMethod[method] || 0) + add;
    }
  }

  return {
    received,
    expenses,
    balance: received - expenses,
    receivedCount,
    expenseCount,
    byMethod,
  };
}

/**
 * Série semanal de recebido vs despesas (liquidado operacional), alinhada ao resumo de Relatórios.
 * @param {object[]} docs
 * @param {string} fromYmd
 * @param {string} toYmd
 */
export function aggregateOperationalWeeklySeries(docs, fromYmd, toYmd) {
  const weeks = buildWeekRanges(fromYmd, toYmd).map((w) => ({
    ...w,
    received: 0,
    expenses: 0,
    label: formatOperationalWeekLabel(w.week_start, w.week_end),
  }));

  for (const doc of docs || []) {
    if (String(doc.status || '').toLowerCase() !== 'settled') continue;
    const ymd = String(doc.settledAt || doc.$createdAt || doc.createdAt || '').slice(0, 10);
    if (!ymd) continue;
    const idx = findWeekIndex(weeks, ymd);
    if (idx < 0) continue;

    const dir = txDirection(doc);
    const gross = Math.abs(Number(doc.gross) || 0);
    const netAbs = Math.abs(Number(doc.net) || gross);
    const typeLc = String(doc.type || '').toLowerCase();

    if (dir === 'out') {
      if (!isOperationalOutflowTx(doc)) continue;
      weeks[idx].expenses += gross;
    } else if (typeLc === 'refund') {
      if (!isOperationalInflowTx(doc)) continue;
      const rawNet = Number(doc.net);
      weeks[idx].received += Number.isFinite(rawNet) && rawNet !== 0 ? rawNet : -gross;
    } else {
      if (!isOperationalInflowTx(doc)) continue;
      weeks[idx].received += netAbs;
    }
  }

  return weeks.map((w) => ({
    weekStart: w.week_start,
    weekEnd: w.week_end,
    label: w.label,
    received: roundMoney(w.received),
    expenses: roundMoney(w.expenses),
  }));
}
