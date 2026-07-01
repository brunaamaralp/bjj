/**
 * Cálculo unificado de score extrato ↔ FINANCIAL_TX (0–100).
 * Isomórfico: usado no matcher server (import) e no matcher client (UI).
 */
import { roundMoney } from '../../lib/money.js';
import {
  isDeterministicGatewayMatch,
} from './bankGatewayMatch.js';

/** Limiar mínimo para sugestão na UI (conciliação exige confirmação humana). */
export const BANK_MATCH_SUGGEST_SCORE = 50;

export const BANK_MATCH_AMBIGUITY_DELTA = 5;

export const BANK_MATCH_MIN_CANDIDATES = 2;

/** Janela máxima de dias entre data do extrato e liquidação do lançamento. */
export const BANK_MATCH_MAX_DATE_DAYS = 3;

export const BANK_MATCH_AMOUNT_TOLERANCE = 0.02;

export const BANK_MATCH_AMOUNT_APPROX_PCT = 0.05;

const OUTFLOW_TX_TYPES = new Set([
  'expense',
  'expense_operational',
  'expense_financial',
  'card_fee',
  'stock_purchase',
  'loan_repayment',
  'balance_sheet_out',
]);

export function txDirectionForReconciliation(tx) {
  const dir = String(tx?.direction || '').toLowerCase();
  if (dir === 'out' || dir === 'in') return dir;
  const type = String(tx?.type || '').toLowerCase();
  if (OUTFLOW_TX_TYPES.has(type)) return 'out';
  if (type === 'refund') return 'in';
  return 'in';
}

export function parseReconciliationYmd(s) {
  const raw = String(s || '').trim().slice(0, 10);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

export function reconciliationDaysBetween(aYmd, bYmd) {
  const a = parseReconciliationYmd(aYmd);
  const b = parseReconciliationYmd(bYmd);
  if (!a || !b) return 999;
  return Math.abs(Math.round((a.getTime() - b.getTime()) / 86400000));
}

export function reconciliationAmountsEqual(a, b) {
  return Math.abs(roundMoney(a) - roundMoney(b)) < BANK_MATCH_AMOUNT_TOLERANCE;
}

export function reconciliationAmountWithinPercent(a, b, pct = BANK_MATCH_AMOUNT_APPROX_PCT) {
  const x = roundMoney(a);
  const y = roundMoney(b);
  if (x < 0.01) return false;
  return Math.abs(x - y) / x <= pct;
}

export function reconciliationTxDateYmd(tx) {
  const settled = String(tx?.settledAt || tx?.settled_at || '').slice(0, 10);
  if (settled) return settled;
  return String(tx?.createdAt || tx?.$createdAt || '').slice(0, 10);
}

export function reconciliationTxAmounts(tx) {
  const gross = roundMoney(Math.abs(Number(tx?.gross) || 0));
  const net = roundMoney(Math.abs(Number(tx?.net) || gross));
  return { gross, net };
}

export function bankItemToNaviDirection(bankDirection) {
  return String(bankDirection || '').toLowerCase() === 'credit' ? 'in' : 'out';
}

function normalizeBankLabel(value) {
  return String(value || '').trim().toLowerCase();
}

export function reconciliationTxBankLabel(tx) {
  const explicit = normalizeBankLabel(tx?.bankAccount || tx?.bank_account);
  if (explicit) return explicit;
  return normalizeBankLabel(tx?.bank_account_resolved || '');
}

export function reconciliationItemBankLabel(item) {
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
 * Score base (valor + data + conta + direção) — escala 0–100.
 * @param {{ date: string, amount: number, direction: 'credit'|'debit', bank_account?: string }} item
 * @param {object} tx
 */
export function scoreBankItemToTxBase(item, tx) {
  if (isDeterministicGatewayMatch(item, tx)) return 100;

  const naviDir = txDirectionForReconciliation(tx);
  const bankDir = bankItemToNaviDirection(item?.direction);
  if (naviDir !== bankDir) return 0;

  const bankLevel = bankAccountMatchLevel(
    reconciliationItemBankLabel(item),
    reconciliationTxBankLabel(tx)
  );
  if (bankLevel === 'mismatch') return 0;

  const itemAmt = roundMoney(Math.abs(Number(item?.amount) || 0));
  const { gross, net } = reconciliationTxAmounts(tx);
  const dayDiff = reconciliationDaysBetween(item?.date, reconciliationTxDateYmd(tx));
  if (dayDiff > BANK_MATCH_MAX_DATE_DAYS) return 0;

  let score = 0;
  const exactGross = reconciliationAmountsEqual(itemAmt, gross);
  const exactNet = reconciliationAmountsEqual(itemAmt, net);
  if (exactGross || exactNet) {
    if (dayDiff === 0) score = 100;
    else if (dayDiff === 1) score = 85;
    else score = 70;
  } else if (
    reconciliationAmountWithinPercent(itemAmt, gross) ||
    reconciliationAmountWithinPercent(itemAmt, net)
  ) {
    score = BANK_MATCH_SUGGEST_SCORE;
  }

  if (!score) return 0;
  if (bankLevel === 'partial' && score > BANK_MATCH_SUGGEST_SCORE) {
    score = BANK_MATCH_SUGGEST_SCORE;
  }
  return score;
}

/**
 * @param {number} base
 * @param {number} [nameBonus]
 */
export function composeBankMatchScore(base, nameBonus = 0) {
  if (!base) {
    return { score: 0, base: 0, name_bonus: 0, rank_score: 0, match_tier: null };
  }
  const bonus = Math.max(0, Number(nameBonus) || 0);
  const rank_score = base + bonus;
  const score = Math.min(100, rank_score);
  const match_tier =
    bonus > 0
      ? 'amount_date_name'
      : base >= 70
        ? 'amount_date'
        : base >= BANK_MATCH_SUGGEST_SCORE
          ? 'amount_approx'
          : null;

  return { score, base, name_bonus: bonus, rank_score, match_tier };
}

/**
 * @param {Array<{ tx: object, score: number, rank_score: number, name_bonus?: number, match_tier?: string|null, from_rule?: boolean }>} scored
 */
export function resolveBankMatchSuggestion(scored) {
  if (!scored?.length) {
    return {
      suggested_tx_id: null,
      suggested_tx: null,
      suggested_tx_candidates: null,
      match_score: 0,
      match_tier: null,
      from_rule: false,
    };
  }

  const top = scored[0];
  const ties = scored.filter((s) => top.rank_score - s.rank_score < BANK_MATCH_AMBIGUITY_DELTA);
  const distinctLeads = new Set(ties.map((s) => String(s.tx?.lead_id || '').trim()).filter(Boolean));

  const ambiguous =
    ties.length >= BANK_MATCH_MIN_CANDIDATES &&
    (top.name_bonus === 0 || distinctLeads.size > 1);

  if (ambiguous) {
    return {
      suggested_tx_id: null,
      suggested_tx: null,
      suggested_tx_candidates: ties.slice(0, 5).map((s) => ({
        tx_id: s.tx?.id || s.tx?.$id,
        score: s.score,
        rank_score: s.rank_score,
        match_tier: s.match_tier,
        lead_name: String(s.tx?.lead_name || '').trim(),
        from_rule: Boolean(s.from_rule),
      })),
      match_score: top.score,
      match_tier: top.match_tier,
      from_rule: Boolean(top.from_rule),
    };
  }

  return {
    suggested_tx_id: top.tx?.id || top.tx?.$id || null,
    suggested_tx: top.tx || null,
    suggested_tx_candidates: null,
    match_score: top.score,
    match_tier: top.match_tier,
    from_rule: Boolean(top.from_rule),
  };
}

export function matchTierLabel(tier) {
  if (tier === 'amount_date_name') return 'Alta (valor + data + nome)';
  if (tier === 'amount_date') return 'Média (valor + data)';
  if (tier === 'amount_approx') return 'Baixa (valor aproximado)';
  if (tier === 'client_match') return 'Sugestão automática';
  if (tier === 'client_match_multi') return 'Múltiplas sugestões';
  return '';
}

/**
 * Converte resultado de resolveBankMatchSuggestion para o formato da UI client-side.
 */
export function bankMatchSuggestionToClientView(suggestion, txById = new Map()) {
  if (suggestion.suggested_tx_candidates?.length >= BANK_MATCH_MIN_CANDIDATES) {
    return {
      displayMode: 'multi',
      suggestedTxId: null,
      candidates: suggestion.suggested_tx_candidates.map((c) => ({
        txId: c.tx_id,
        score: c.score,
        rank_score: c.rank_score,
        match_tier: c.match_tier,
        tx: txById.get(c.tx_id) || null,
      })),
    };
  }

  if (suggestion.suggested_tx_id) {
    const tx = suggestion.suggested_tx || txById.get(suggestion.suggested_tx_id) || null;
    return {
      displayMode: 'single',
      suggestedTxId: suggestion.suggested_tx_id,
      candidates: [
        {
          txId: suggestion.suggested_tx_id,
          score: suggestion.match_score,
          rank_score: suggestion.match_score,
          match_tier: suggestion.match_tier,
          tx,
        },
      ],
    };
  }

  return { displayMode: 'none', suggestedTxId: null, candidates: [] };
}
