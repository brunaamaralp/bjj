/**
 * GET /api/finance/summary?from=&to=&regime=cash|competence
 */
import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';
import { MAX_TX_COLLECT_PER_PERIOD } from './financeTxQuery.js';
import { FINANCE_REGIME } from '../../src/lib/financeCompetence.js';
import { loadCachedFinancePeriodSummary } from './financePeriodSummaryCache.js';
import { cacheKey, getCached, setCached, cacheMaxAgeSeconds } from './reportsLightCache.js';

function json(res, status, body, cacheHit = false) {
  res.setHeader('Cache-Control', `private, max-age=${cacheMaxAgeSeconds()}`);
  if (cacheHit) res.setHeader('X-Cache', 'HIT');
  res.status(status).json(body);
}

export default async function financeSummaryHandler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  const regimeRaw = String(req.query.regime || FINANCE_REGIME.CASH).toLowerCase();
  const regime =
    regimeRaw === FINANCE_REGIME.COMPETENCE ? FINANCE_REGIME.COMPETENCE : FINANCE_REGIME.CASH;

  const key = cacheKey(['finance-summary', academyId, from, to, regime]);
  const cached = getCached(key);
  if (cached) return json(res, 200, { ok: true, ...cached }, true);

  try {
    const summary = await loadCachedFinancePeriodSummary(academyId, from, to, regime);
    const body = {
      ok: true,
      ...summary,
      maxCollect: summary.maxCollect || MAX_TX_COLLECT_PER_PERIOD,
    };
    setCached(key, body);
    return json(res, 200, body);
  } catch (e) {
    console.error(JSON.stringify({
      event: 'finance_summary_error',
      academyId,
      from: from || null,
      to: to || null,
      regime,
      error: e?.message || String(e),
      stack: e?.stack?.slice(0, 600),
    }));
    return json(res, 500, { ok: false, error: 'summary_failed' });
  }
}
