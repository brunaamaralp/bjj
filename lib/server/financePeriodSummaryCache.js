/**
 * Resumo de período financeiro com cache compartilhado (overview + /summary).
 */
import { cacheKey, getCached, setCached } from './reportsLightCache.js';
import { listFinancialTxForPeriodWithMeta } from './financeTxQuery.js';
import { aggregatePeriodSummary } from './financeTxAggregate.js';
import { FINANCE_REGIME } from '../../src/lib/financeCompetence.js';

function buildPeriodSummary(from, to, regime, docs, meta = {}) {
  const summary = aggregatePeriodSummary(docs);
  return {
    from: from || null,
    to: to || null,
    regime,
    ...summary,
    count: docs.length,
    truncated: meta.truncated ?? false,
    totalInPeriod: meta.totalInPeriod ?? docs.length,
    maxCollect: meta.maxCollect,
    countPending: summary.countPending ?? 0,
  };
}

export async function loadCachedFinancePeriodSummary(academyId, from, to, regime) {
  const safeRegime =
    regime === FINANCE_REGIME.COMPETENCE ? FINANCE_REGIME.COMPETENCE : FINANCE_REGIME.CASH;
  const key = cacheKey(['finance-summary', academyId, from, to, safeRegime]);
  const hit = getCached(key);
  if (hit) return hit;

  const { items: docs, truncated, maxCollect, totalInPeriod } =
    await listFinancialTxForPeriodWithMeta(academyId, { from, to, regime: safeRegime });
  const body = buildPeriodSummary(from, to, safeRegime, docs, {
    truncated,
    maxCollect,
    totalInPeriod,
  });
  setCached(key, body);
  return body;
}
