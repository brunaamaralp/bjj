/**
 * Matching automático extrato ↔ FINANCIAL_TX.
 */
import { txDirection } from './financeTxFields.js';

function parseYmd(s) {
  const raw = String(s || '').trim().slice(0, 10);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

function daysBetween(aYmd, bYmd) {
  const a = parseYmd(aYmd);
  const b = parseYmd(bYmd);
  if (!a || !b) return 999;
  return Math.abs(Math.round((a.getTime() - b.getTime()) / 86400000));
}

function roundMoney(n) {
  return Math.round(Math.abs(Number(n) || 0) * 100) / 100;
}

function amountsEqual(a, b) {
  return Math.abs(roundMoney(a) - roundMoney(b)) < 0.02;
}

function amountWithinPercent(a, b, pct = 0.05) {
  const x = roundMoney(a);
  const y = roundMoney(b);
  if (x < 0.01) return false;
  return Math.abs(x - y) / x <= pct;
}

function txDateYmd(tx) {
  const settled = String(tx.settledAt || tx.settled_at || '').slice(0, 10);
  if (settled) return settled;
  return String(tx.createdAt || tx.$createdAt || '').slice(0, 10);
}

function txAmounts(tx) {
  const gross = roundMoney(tx.gross);
  const net = roundMoney(Math.abs(Number(tx.net) || gross));
  return { gross, net };
}

function bankToNaviDirection(bankDirection) {
  return String(bankDirection || '').toLowerCase() === 'credit' ? 'in' : 'out';
}

/**
 * @param {{ date: string, amount: number, direction: 'credit'|'debit' }} item
 * @param {object} tx — mapFinanceTxDoc shape
 */
export function scoreBankItemToTx(item, tx) {
  const naviDir = txDirection(tx);
  const bankDir = bankToNaviDirection(item.direction);
  if (naviDir !== bankDir) return 0;

  const itemAmt = roundMoney(item.amount);
  const { gross, net } = txAmounts(tx);
  const dayDiff = daysBetween(item.date, txDateYmd(tx));
  if (dayDiff > 3) return 0;

  const exactGross = amountsEqual(itemAmt, gross);
  const exactNet = amountsEqual(itemAmt, net);
  if (exactGross || exactNet) {
    if (dayDiff === 0) return 100;
    if (dayDiff === 1) return 85;
    return 70;
  }

  if (amountWithinPercent(itemAmt, gross) || amountWithinPercent(itemAmt, net)) {
    return 50;
  }

  return 0;
}

/**
 * @param {Array} items — extrato normalizado
 * @param {Array} transactions — FINANCIAL_TX settled, não reconciliados
 */
export function matchBankItemsToTransactions(items, transactions) {
  const pool = (transactions || []).filter((tx) => {
    if (tx.reconciled === true) return false;
    return String(tx.status || '').toLowerCase() === 'settled';
  });

  const usedTx = new Set();
  const results = [];

  for (const item of items || []) {
    let best = null;
    let bestScore = 0;

    for (const tx of pool) {
      if (usedTx.has(tx.id)) continue;
      const score = scoreBankItemToTx(item, tx);
      if (score > bestScore) {
        bestScore = score;
        best = tx;
      }
    }

    let status = 'unmatched';
    let matched_tx_id = null;
    let suggested_tx_id = null;

    if (bestScore >= 85 && best) {
      status = 'matched';
      matched_tx_id = best.id;
      usedTx.add(best.id);
    } else if (bestScore >= 50 && best) {
      status = 'unmatched';
      suggested_tx_id = best.id;
    }

    results.push({
      item,
      status,
      match_score: bestScore,
      matched_tx_id,
      suggested_tx_id,
      suggested_tx: bestScore >= 50 && best ? best : null,
    });
  }

  return results;
}

export function partitionMatchResults(results) {
  const auto = [];
  const suggested = [];
  const unmatched = [];

  for (const r of results || []) {
    if (r.status === 'matched') auto.push(r);
    else if (r.match_score >= 50 && r.suggested_tx_id) suggested.push(r);
    else unmatched.push(r);
  }

  return { auto, suggested, unmatched };
}
