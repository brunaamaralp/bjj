/**
 * Métricas operacionais do pipeline de conciliação (cálculo puro, testável).
 */
import { RECONCILIATION_METHOD_GATEWAY } from './bankGatewayMatch.js';
import { BANK_MATCH_SUGGEST_SCORE } from './bankReconciliationScore.js';

export const RECON_METRIC_EVENT = {
  IMPORT_SNAPSHOT: 'import_snapshot',
  MATCH_CONFIRMED: 'match_confirmed',
  STATEMENT_COMPLETED: 'statement_completed',
  STALE_ORPHAN_SCAN: 'stale_orphan_scan',
};

export const RECONCILIATION_METHOD_AI = 'ai_fallback';
export const RECONCILIATION_METHOD_SCORE_ACCEPTED = 'score_manual_accepted';
export const RECONCILIATION_METHOD_MANUAL_OVERRIDE = 'manual_override';
export const RECONCILIATION_METHOD_MANUAL = 'manual_confirm';

const AI_MATCH_TIERS = new Set(['ai_fallback', 'ai_suggest']);

function isAiSuggestedItem(item) {
  const tier = String(item?.match_tier || '').trim();
  const method = String(item?.reconciliation_method || '').trim();
  return AI_MATCH_TIERS.has(tier) || method === RECONCILIATION_METHOD_AI;
}

function isScoreSuggestedItem(item) {
  if (item?.gateway_auto_matched) return false;
  const score = Number(item?.match_score) || 0;
  const suggested = String(item?.suggested_tx_id || '').trim();
  return Boolean(suggested) && score >= BANK_MATCH_SUGGEST_SCORE && !isAiSuggestedItem(item);
}

/**
 * Classificação por item logo após import/matching.
 */
export function classifyImportLayer(item) {
  if (item?.status === 'duplicate') return 'duplicate';
  if (item?.gateway_auto_matched || item?.reconciliation_method === RECONCILIATION_METHOD_GATEWAY) {
    return 'gateway_deterministic';
  }
  if (isAiSuggestedItem(item)) return 'ai_suggested';
  if (isScoreSuggestedItem(item)) return 'score_suggested';
  return 'no_suggestion';
}

/**
 * @param {object[]} finalResults — saída do matching na importação
 * @param {{ pool_tx_count?: number, ai_calls?: number, ai_estimated_cost_usd?: number }} [options]
 */
export function buildImportMetricsSnapshot(finalResults, options = {}) {
  const layers = {
    gateway_deterministic: 0,
    score_suggested: 0,
    ai_suggested: 0,
    no_suggestion: 0,
    duplicate: 0,
  };

  for (const row of finalResults || []) {
    const key = classifyImportLayer(row);
    if (layers[key] != null) layers[key] += 1;
  }

  const itemsTotal = (finalResults || []).length;
  const eligible = itemsTotal - layers.duplicate;

  return {
    schema_version: 1,
    items_total: itemsTotal,
    items_eligible: eligible,
    layers_at_import: layers,
    resolution_at_import: {
      gateway_deterministic: layers.gateway_deterministic,
      score_suggested: layers.score_suggested,
      ai_suggested: layers.ai_suggested,
      no_suggestion: layers.no_suggestion,
    },
    pool_tx_count: Number(options.pool_tx_count) || 0,
    ai: {
      calls: Number(options.ai_calls) || 0,
      estimated_cost_usd: Number(options.ai_estimated_cost_usd) || 0,
      items_suggested: layers.ai_suggested,
    },
  };
}

/**
 * @param {object[]} items — bank_statement_items mapeados
 * @param {{ import_date?: string, completed_at?: string, statement_id?: string }} statement
 */
export function buildStatementCompletionMetrics(items, statement = {}) {
  const resolution = {
    gateway_deterministic: 0,
    score_manual_accepted: 0,
    ai_manual_accepted: 0,
    manual_without_suggestion: 0,
    still_unmatched: 0,
    ignored: 0,
    duplicate: 0,
  };

  let suggestions_shown = 0;
  let suggestions_accepted = 0;
  let suggestions_rejected = 0;

  for (const item of items || []) {
    const status = String(item.status || '').toLowerCase();
    const suggested = String(item.suggested_tx_id || '').trim();
    const matched = String(item.matched_tx_id || '').trim();
    const method = String(item.reconciliation_method || '').trim();
    const tier = String(item.match_tier || '').trim();

    if (status === 'duplicate') {
      resolution.duplicate += 1;
      continue;
    }
    if (status === 'ignored') {
      resolution.ignored += 1;
      if (suggested) {
        suggestions_shown += 1;
        suggestions_rejected += 1;
      }
      continue;
    }

    if (suggested) suggestions_shown += 1;

    if (status === 'matched' && matched) {
      if (method === RECONCILIATION_METHOD_GATEWAY) {
        resolution.gateway_deterministic += 1;
      } else if (method === RECONCILIATION_METHOD_AI || AI_MATCH_TIERS.has(tier)) {
        resolution.ai_manual_accepted += 1;
        if (suggested) {
          suggestions_accepted += suggested === matched ? 1 : 0;
          if (suggested !== matched) suggestions_rejected += 1;
        }
      } else if (suggested && suggested === matched) {
        resolution.score_manual_accepted += 1;
        suggestions_accepted += 1;
      } else if (suggested && suggested !== matched) {
        resolution.manual_without_suggestion += 1;
        suggestions_rejected += 1;
      } else {
        resolution.manual_without_suggestion += 1;
      }
      continue;
    }

    resolution.still_unmatched += 1;
    if (suggested) suggestions_rejected += 1;
  }

  const importIso = String(statement.import_date || '').trim();
  const completedIso = String(statement.completed_at || '').trim();
  let time_to_complete_ms = null;
  if (importIso && completedIso) {
    const a = new Date(importIso).getTime();
    const b = new Date(completedIso).getTime();
    if (Number.isFinite(a) && Number.isFinite(b) && b >= a) {
      time_to_complete_ms = b - a;
    }
  }

  const rejection_rate =
    suggestions_shown > 0 ? Math.round((suggestions_rejected / suggestions_shown) * 1000) / 1000 : null;

  return {
    schema_version: 1,
    statement_id: statement.statement_id || statement.id || '',
    resolution_final: resolution,
    suggestions: {
      shown: suggestions_shown,
      accepted: suggestions_accepted,
      rejected: suggestions_rejected,
      rejection_rate,
    },
    timing: {
      import_date: importIso || null,
      completed_at: completedIso || null,
      time_to_complete_ms,
      time_to_complete_hours:
        time_to_complete_ms != null
          ? Math.round((time_to_complete_ms / 3600000) * 100) / 100
          : null,
    },
  };
}

/**
 * @param {object} item — antes do patch
 * @param {string} confirmedTxId
 */
export function buildMatchConfirmedMetrics(item, confirmedTxId) {
  const suggested = String(item?.suggested_tx_id || '').trim();
  const txId = String(confirmedTxId || '').trim();
  const priorMethod = String(item?.reconciliation_method || '').trim();
  const tier = String(item?.match_tier || '').trim();

  let reconciliation_method = RECONCILIATION_METHOD_MANUAL;
  if (priorMethod === RECONCILIATION_METHOD_GATEWAY) {
    reconciliation_method = priorMethod;
  } else if (isAiSuggestedItem(item)) {
    reconciliation_method = RECONCILIATION_METHOD_AI;
  } else if (suggested && suggested === txId) {
    reconciliation_method = RECONCILIATION_METHOD_SCORE_ACCEPTED;
  } else if (suggested && suggested !== txId) {
    reconciliation_method = RECONCILIATION_METHOD_MANUAL_OVERRIDE;
  }

  return {
    schema_version: 1,
    item_id: item?.id || item?.$id || '',
    confirmed_tx_id: txId,
    suggested_tx_id: suggested || null,
    accepted_suggestion: Boolean(suggested && suggested === txId),
    match_score: Number(item?.match_score) || 0,
    match_tier: tier || null,
    reconciliation_method,
    suggestion_source: isAiSuggestedItem(item) ? 'ai' : suggested ? 'score' : 'none',
  };
}

/**
 * @param {Array<{ statement_id: string, academy_id: string, import_date: string, stale_unmatched_count: number, stale_days: number }>} rows
 */
export function buildStaleOrphanScanMetrics(rows, { staleDays = 7 } = {}) {
  const totalStaleItems = (rows || []).reduce((s, r) => s + (Number(r.stale_unmatched_count) || 0), 0);
  return {
    schema_version: 1,
    stale_days_threshold: staleDays,
    statements_with_stale_items: (rows || []).length,
    stale_unmatched_items_total: totalStaleItems,
    statements: (rows || []).slice(0, 50),
  };
}
