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
