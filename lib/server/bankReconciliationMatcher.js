/**
 * Matching automático extrato ↔ FINANCIAL_TX.
 */
import { txDirection } from './financeTxFields.js';
import { resolveTxBankAccount } from '../../src/lib/bankAccountBalances.js';
import { roundMoney } from '../money.js';
import { scorePayerNameMatch } from './bankStatementPayerName.js';

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

function normalizeBankLabel(value) {
  return String(value || '').trim().toLowerCase();
}

function txBankLabel(tx) {
  return normalizeBankLabel(tx?.bankAccount || tx?.bank_account || resolveTxBankAccount(tx));
}

function itemBankLabel(item) {
  return normalizeBankLabel(item?.bank_account || item?.bankAccount);
}

/**
 * @param {string} itemBank
 * @param {string} txBank
 * @returns {'ok'|'partial'|'mismatch'}
 */
export function bankAccountMatchLevel(itemBank, txBank) {
  const ib = normalizeBankLabel(itemBank);
  const tb = normalizeBankLabel(txBank);
  if (ib && tb && ib !== tb) return 'mismatch';
  if (ib && !tb) return 'partial';
  return 'ok';
}

/**
 * Score base (valor + data + conta) — lógica legada.
 */
export function scoreBankItemToTxBase(item, tx) {
  const naviDir = txDirection(tx);
  const bankDir = bankToNaviDirection(item.direction);
  if (naviDir !== bankDir) return 0;

  const bankLevel = bankAccountMatchLevel(itemBankLabel(item), txBankLabel(tx));
  if (bankLevel === 'mismatch') return 0;

  const itemAmt = roundMoney(item.amount);
  const { gross, net } = txAmounts(tx);
  const dayDiff = daysBetween(item.date, txDateYmd(tx));
  if (dayDiff > 3) return 0;

  let score = 0;
  const exactGross = amountsEqual(itemAmt, gross);
  const exactNet = amountsEqual(itemAmt, net);
  if (exactGross || exactNet) {
    if (dayDiff === 0) score = 100;
    else if (dayDiff === 1) score = 85;
    else score = 70;
  } else if (amountWithinPercent(itemAmt, gross) || amountWithinPercent(itemAmt, net)) {
    score = 50;
  }

  if (!score) return 0;
  if (bankLevel === 'partial' && score > 50) score = 50;
  return score;
}

/**
 * @param {{ date: string, amount: number, direction: 'credit'|'debit', bank_account?: string, description?: string }} item
 * @param {object} tx — mapFinanceTxDoc shape
 * @param {Map<string, object>|null} [payerContextByLeadId]
 */
export function scoreBankItemToTxDetailed(item, tx, payerContextByLeadId = null) {
  const base = scoreBankItemToTxBase(item, tx);
  if (!base) {
    return { score: 0, base: 0, name_bonus: 0, rank_score: 0, match_tier: null };
  }

  const leadId = String(tx.lead_id || '').trim();
  const ctx = leadId && payerContextByLeadId?.get(leadId) ? payerContextByLeadId.get(leadId) : null;
  const name_bonus =
    String(item.direction || '') === 'credit' && txDirection(tx) === 'in'
      ? scorePayerNameMatch(item.description, ctx)
      : 0;

  const rank_score = base + name_bonus;
  const score = Math.min(100, rank_score);
  const match_tier =
    name_bonus > 0 ? 'amount_date_name' : base >= 70 ? 'amount_date' : base >= 50 ? 'amount_approx' : null;

  return { score, base, name_bonus, rank_score, match_tier };
}

/**
 * @param {{ date: string, amount: number, direction: 'credit'|'debit', bank_account?: string, description?: string }} item
 * @param {object} tx
 * @param {Map<string, object>|null} [payerContextByLeadId]
 */
export function scoreBankItemToTx(item, tx, payerContextByLeadId = null) {
  return scoreBankItemToTxDetailed(item, tx, payerContextByLeadId).score;
}

/** Limiar para sugestão na UI (conciliação exige confirmação humana). */
export const BANK_MATCH_SUGGEST_SCORE = 50;

export const BANK_MATCH_AMBIGUITY_DELTA = 5;

export const BANK_MATCH_MIN_CANDIDATES = 2;

/**
 * Retorna true se um lançamento Nave é elegível para exibição nos órfãos
 * de um extrato com determinada conta bancária.
 */
export function txEligibleForStatementBank(statementBank, tx) {
  const stmt = normalizeBankLabel(statementBank);
  if (!stmt) return true;
  return bankAccountMatchLevel(stmt, txBankLabel(tx)) !== 'mismatch';
}

function resolveSuggestionFromScored(scored) {
  if (!scored.length) {
    return {
      suggested_tx_id: null,
      suggested_tx: null,
      suggested_tx_candidates: null,
      match_score: 0,
      match_tier: null,
    };
  }

  const top = scored[0];
  const ties = scored.filter((s) => top.rank_score - s.rank_score < BANK_MATCH_AMBIGUITY_DELTA);
  const distinctLeads = new Set(ties.map((s) => String(s.tx.lead_id || '').trim()).filter(Boolean));

  const ambiguous =
    ties.length >= BANK_MATCH_MIN_CANDIDATES &&
    (top.name_bonus === 0 || distinctLeads.size > 1);

  if (ambiguous) {
    return {
      suggested_tx_id: null,
      suggested_tx: null,
      suggested_tx_candidates: ties.slice(0, 5).map((s) => ({
        tx_id: s.tx.id,
        score: s.score,
        rank_score: s.rank_score,
        match_tier: s.match_tier,
        lead_name: String(s.tx.lead_name || '').trim(),
      })),
      match_score: top.score,
      match_tier: top.match_tier,
    };
  }

  return {
    suggested_tx_id: top.tx.id,
    suggested_tx: top.tx,
    suggested_tx_candidates: null,
    match_score: top.score,
    match_tier: top.match_tier,
  };
}

/**
 * @param {Array} items — extrato normalizado
 * @param {Array} transactions — FINANCIAL_TX settled, não reconciliados
 * @param {{ payerContextByLeadId?: Map<string, object>|null }} [options]
 */
export function matchBankItemsToTransactions(items, transactions, options = {}) {
  const payerContextByLeadId = options.payerContextByLeadId || null;
  const pool = (transactions || []).filter((tx) => {
    if (tx.reconciled === true) return false;
    return String(tx.status || '').toLowerCase() === 'settled';
  });

  const results = [];

  for (const item of items || []) {
    const scored = [];
    for (const tx of pool) {
      const detail = scoreBankItemToTxDetailed(item, tx, payerContextByLeadId);
      if (detail.rank_score >= BANK_MATCH_SUGGEST_SCORE) {
        scored.push({ tx, ...detail });
      }
    }

    scored.sort((a, b) => {
      if (b.rank_score !== a.rank_score) return b.rank_score - a.rank_score;
      return String(a.tx.id).localeCompare(String(b.tx.id));
    });

    const suggestion = resolveSuggestionFromScored(scored);

    results.push({
      item,
      status: 'unmatched',
      match_score: suggestion.match_score,
      match_tier: suggestion.match_tier,
      matched_tx_id: null,
      suggested_tx_id: suggestion.suggested_tx_id,
      suggested_tx: suggestion.suggested_tx,
      suggested_tx_candidates: suggestion.suggested_tx_candidates,
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
    else if (r.match_score >= BANK_MATCH_SUGGEST_SCORE && r.suggested_tx_id) suggested.push(r);
    else unmatched.push(r);
  }

  return { auto, suggested, unmatched };
}

export function matchTierLabel(tier) {
  if (tier === 'amount_date_name') return 'Alta (valor + data + nome)';
  if (tier === 'amount_date') return 'Média (valor + data)';
  if (tier === 'amount_approx') return 'Baixa (valor aproximado)';
  return '';
}
