/**
 * GET /api/finance?route=overview&month=YYYY-MM
 * Agrega dados da aba Visão Geral em uma única requisição (auth + leituras compartilhadas).
 */
import { ensureAuth, ensureAcademyAccess, ACADEMIES_COL, DB_ID, databases } from './academyAccess.js';
import { mergeFinanceConfigFromAcademyDoc } from '../../src/lib/financeConfigStorage.js';
import { parseReferenceMonth } from '../../src/lib/monthlyClosing.js';
import { buildReceivablesSnapshot } from '../../src/lib/receivablesAggregate.js';
import { FINANCE_REGIME } from '../../src/lib/financeCompetence.js';
import { listFinancialTxForPeriodWithMeta } from './financeTxQuery.js';
import { aggregatePeriodSummary } from './financeTxAggregate.js';
import { cacheKey, getCached, setCached, cacheMaxAgeSeconds } from './reportsLightCache.js';
import { loadReceivablesInputs } from './financeReceivablesData.js';
import { computeBankBalancesPayload } from './financeBankBalancesData.js';
import { loadClosingGetPayload } from './financeClosingData.js';
import { buildFinanceForecast } from './financeForecastHandler.js';
import {
  monthPeriodBounds,
  previousMonthYm,
  monthEndYmd,
  forecastNext30Range,
} from '../../src/lib/financeiroOverview.js';

function json(res, status, body, cacheHit = false) {
  res.setHeader('Cache-Control', `private, max-age=${cacheMaxAgeSeconds()}`);
  if (cacheHit) res.setHeader('X-Cache', 'HIT');
  res.status(status).json(body);
}

async function loadFinanceConfig(academyId, academyDoc) {
  let financeConfig = { bankAccounts: [], plans: [] };
  if (ACADEMIES_COL && academyDoc) {
    financeConfig = mergeFinanceConfigFromAcademyDoc(academyDoc);
  } else if (ACADEMIES_COL) {
    try {
      const academy = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
      financeConfig = mergeFinanceConfigFromAcademyDoc(academy);
    } catch {
      /* defaults */
    }
  }
  return financeConfig;
}

async function loadPeriodSummary(academyId, from, to, regime) {
  const { items: docs, truncated, maxCollect, totalInPeriod } =
    await listFinancialTxForPeriodWithMeta(academyId, { from, to, regime });
  const summary = aggregatePeriodSummary(docs);
  return {
    from: from || null,
    to: to || null,
    regime,
    ...summary,
    count: docs.length,
    truncated,
    totalInPeriod,
    maxCollect,
    countPending: summary.countPending ?? 0,
  };
}

export default async function financeOverviewHandler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId, doc: academyDoc } = access;

  const month = parseReferenceMonth(String(req.query.month || req.query.reference_month || '').trim());
  if (!month) return json(res, 400, { ok: false, error: 'month_required' });

  const regimeRaw = String(req.query.regime || FINANCE_REGIME.CASH).toLowerCase();
  const regime =
    regimeRaw === FINANCE_REGIME.COMPETENCE ? FINANCE_REGIME.COMPETENCE : FINANCE_REGIME.CASH;
  const includeForecast = ['1', 'true', 'yes'].includes(
    String(req.query.includeForecast || req.query.include_forecast || '').trim().toLowerCase()
  );
  const bankCompareAsOf = String(req.query.bankCompareAsOf || req.query.bank_compare_as_of || '').trim().slice(0, 10);
  const prevMonth = previousMonthYm(month);
  const { from, to } = monthPeriodBounds(month);
  const prevBounds = monthPeriodBounds(prevMonth);
  const compareAsOf = /^\d{4}-\d{2}-\d{2}$/.test(bankCompareAsOf)
    ? bankCompareAsOf
    : monthEndYmd(prevMonth);

  const key = cacheKey([
    'finance-overview',
    academyId,
    month,
    regime,
    includeForecast ? 'forecast' : '',
    compareAsOf,
  ]);
  const cached = getCached(key);
  if (cached) return json(res, 200, cached, true);

  try {
    const financeConfig = await loadFinanceConfig(academyId, academyDoc);
    const forecastRange = forecastNext30Range();

    const [
      receivablesInputs,
      summaryCurrent,
      summaryPrev,
      closing,
      bankCurrent,
      bankCompare,
      forecast,
    ] = await Promise.all([
      loadReceivablesInputs(academyId, month),
      loadPeriodSummary(academyId, from, to, regime),
      loadPeriodSummary(academyId, prevBounds.from, prevBounds.to, regime),
      loadClosingGetPayload(academyId, month, regime),
      computeBankBalancesPayload(academyId, null, financeConfig),
      compareAsOf
        ? computeBankBalancesPayload(academyId, compareAsOf, financeConfig)
        : Promise.resolve(null),
      includeForecast
        ? buildFinanceForecast(academyId, forecastRange.from, forecastRange.to, { financeConfig })
        : Promise.resolve(null),
    ]);

    const receivablesSnapshot = buildReceivablesSnapshot({
      students: receivablesInputs.students,
      payments: receivablesInputs.payments,
      financeConfig,
      referenceMonth: month,
      pendingTransactions: receivablesInputs.pendingTransactions,
      deferredSales: receivablesInputs.deferredSales,
    });

    const body = {
      ok: true,
      referenceMonth: month,
      regime,
      from,
      to,
      summary: summaryCurrent,
      summaryPrev,
      receivables: {
        referenceMonth: month,
        ...receivablesSnapshot,
      },
      payments: receivablesInputs.payments,
      closing,
      bankBalances: bankCurrent,
      bankBalancesCompare: bankCompare,
      forecast,
    };

    setCached(key, body);
    return json(res, 200, body);
  } catch (e) {
    console.error(JSON.stringify({
      event: 'finance_overview_error',
      academyId,
      month,
      regime,
      error: e?.message || String(e),
      stack: e?.stack?.slice(0, 600),
    }));
    return json(res, 500, { ok: false, error: 'overview_failed' });
  }
}
