/**
 * Matching automático extrato ↔ FINANCIAL_TX.
 */
import { resolveTxBankAccount } from '../../src/lib/bankAccountBalances.js';
import { scorePayerNameMatch } from './bankStatementPayerName.js';
import { isAutoSuggestPayerRuleMatch } from './bankReconPayerRules.js';
import {
  RECONCILIATION_METHOD_GATEWAY,
  isDeterministicGatewayMatch,
  tryDeterministicGatewayMatch,
} from '../../src/lib/bankGatewayMatch.js';
import { txEligibleForBankReconciliation } from '../../src/lib/financeLedgerRegime.js';
import {
  BANK_MATCH_SUGGEST_SCORE,
  BANK_MATCH_AMBIGUITY_DELTA,
  BANK_MATCH_MIN_CANDIDATES,
  bankAccountMatchLevel,
  bankItemToNaviDirection,
  composeBankMatchScore,
  matchTierLabel,
  reconciliationItemBankLabel,
  reconciliationTxBankLabel,
  resolveBankMatchSuggestion,
  scoreBankItemToTxBase,
  txDirectionForReconciliation,
} from '../../src/lib/bankReconciliationScore.js';

export {
  BANK_MATCH_SUGGEST_SCORE,
  BANK_MATCH_AMBIGUITY_DELTA,
  BANK_MATCH_MIN_CANDIDATES,
  bankAccountMatchLevel,
  bankItemToNaviDirection,
  matchTierLabel,
  scoreBankItemToTxBase,
};

function txBankLabel(tx) {
  const fromTx = reconciliationTxBankLabel(tx);
  if (fromTx) return fromTx;
  return reconciliationTxBankLabel({ bank_account: resolveTxBankAccount(tx) });
}

function itemBankLabel(item) {
  return reconciliationItemBankLabel(item);
}

/**
 * Score base com resolução de conta bancária do servidor.
 */
export function scoreBankItemToTxBaseWithServerBank(item, tx) {
  const enrichedTx = {
    ...tx,
    bank_account: tx?.bankAccount || tx?.bank_account || resolveTxBankAccount(tx),
  };
  return scoreBankItemToTxBase(item, enrichedTx);
}

/**
 * @param {{ date: string, amount: number, direction: 'credit'|'debit', bank_account?: string, description?: string }} item
 * @param {object} tx — mapFinanceTxDoc shape
 * @param {Map<string, object>|null} [payerContextByLeadId]
 */
export function scoreBankItemToTxDetailed(item, tx, payerContextByLeadId = null) {
  if (!txEligibleForBankReconciliation(tx)) {
    return { score: 0, base: 0, name_bonus: 0, rank_score: 0, match_tier: null };
  }

  if (isDeterministicGatewayMatch(item, tx)) {
    return {
      score: 100,
      base: 100,
      name_bonus: 0,
      rank_score: 100,
      match_tier: 'gateway_charge_id',
      from_rule: false,
      gateway_deterministic: true,
    };
  }

  const base = scoreBankItemToTxBaseWithServerBank(item, tx);
  if (!base) {
    return { score: 0, base: 0, name_bonus: 0, rank_score: 0, match_tier: null };
  }

  const leadId = String(tx.lead_id || '').trim();
  const ctx = leadId && payerContextByLeadId?.get(leadId) ? payerContextByLeadId.get(leadId) : null;
  const name_bonus =
    String(item.direction || '') === 'credit' && txDirectionForReconciliation(tx) === 'in'
      ? scorePayerNameMatch(item.description, ctx)
      : 0;

  const composed = composeBankMatchScore(base, name_bonus);
  const from_rule =
    String(item.direction || '') === 'credit' && isAutoSuggestPayerRuleMatch(item.description, ctx);

  return { ...composed, from_rule };
}

/**
 * @param {{ date: string, amount: number, direction: 'credit'|'debit', bank_account?: string, description?: string }} item
 * @param {object} tx
 * @param {Map<string, object>|null} [payerContextByLeadId]
 */
export function scoreBankItemToTx(item, tx, payerContextByLeadId = null) {
  return scoreBankItemToTxDetailed(item, tx, payerContextByLeadId).score;
}

/**
 * Retorna true se um lançamento Nave é elegível para exibição nos órfãos
 * de um extrato com determinada conta bancária.
 */
export function txEligibleForStatementBank(statementBank, tx) {
  const stmt = reconciliationItemBankLabel({ bank_account: statementBank });
  if (!stmt) return true;
  return bankAccountMatchLevel(stmt, txBankLabel(tx)) !== 'mismatch';
}

/**
 * @param {Array} items — extrato normalizado
 * @param {Array} transactions — FINANCIAL_TX settled, não reconciliados
 * @param {{ payerContextByLeadId?: Map<string, object>|null }} [options]
 */
export function matchBankItemsToTransactions(items, transactions, options = {}) {
  const payerContextByLeadId = options.payerContextByLeadId || null;
  const gatewayLookup = options.gatewayLookup || {};
  const pool = (transactions || []).filter((tx) => {
    if (!txEligibleForBankReconciliation(tx)) return false;
    if (tx.reconciled === true) return false;
    return String(tx.status || '').toLowerCase() === 'settled';
  });

  const results = [];

  for (const item of items || []) {
    const gatewayResult = tryDeterministicGatewayMatch(item, pool, gatewayLookup);
    if (gatewayResult.kind === 'matched') {
      results.push({
        item,
        status: 'matched',
        match_score: 100,
        match_tier: gatewayResult.match_tier,
        reconciliation_method: gatewayResult.reconciliation_method || RECONCILIATION_METHOD_GATEWAY,
        gateway_charge_id: gatewayResult.chargeId,
        gateway_auto_matched: true,
        matched_tx_id: gatewayResult.tx.id,
        suggested_tx_id: null,
        suggested_tx: null,
        suggested_tx_candidates: null,
        from_rule: false,
      });
      continue;
    }

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

    const suggestion = resolveBankMatchSuggestion(scored);

    results.push({
      item,
      status: 'unmatched',
      match_score: suggestion.match_score,
      match_tier: suggestion.match_tier,
      from_rule: suggestion.from_rule,
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
