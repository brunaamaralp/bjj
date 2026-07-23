/**
 * GET /api/finance?route=overview&month=YYYY-MM
 * Agrega dados da aba Visão Geral em uma única requisição (auth + leituras compartilhadas).
 */
import { ensureAuth, ensureAcademyAccess, isAcademyOwnerOrAdminUser, ACADEMIES_COL, DB_ID, databases } from './academyAccess.js';
import { mergeFinanceConfigFromAcademyDoc } from '../../src/lib/financeConfigStorage.js';
import { parseReferenceMonth } from '../../src/lib/monthlyClosing.js';
import { buildReceivablesSnapshot } from '../../src/lib/receivablesAggregate.js';
import { FINANCE_REGIME } from '../../src/lib/financeCompetence.js';
import { listFinancialTxForPeriodWithMeta } from './financeTxQuery.js';
import { aggregatePeriodSummary } from './financeTxAggregate.js';
import { cacheKey, getCached, setCached, cacheMaxAgeSeconds } from './reportsLightCache.js';
import { loadReceivablesInputs } from './financeReceivablesData.js';
import { computeDualBankBalancesPayload, todayYmdLocal } from './financeBankBalancesData.js';
import {
  buildClosingPayload,
  deriveClosingTxResultFromPeriodItems,
  getCashClosing,
} from './financeClosingData.js';
import { buildFinanceForecast } from './financeForecastHandler.js';
import {
  monthPeriodBounds,
  previousMonthYm,
  monthEndYmd,
  forecastNext30Range,
  computeMensalidadesMonthKpis,
  countClosingDivergences,
  trimReceivablesForOverview,
  trimForecastForOverview,
  trimPayablesForOverview,
  overviewPeriodContext,
} from '../../src/lib/financeiroOverview.js';
import { countContractsAwaitingSignature } from './financeOverviewContracts.js';
import { loadPayablesInputs } from './payablesData.js';
import { buildPayablesSnapshot } from '../../src/lib/payablesAggregate.js';
import { enrichOverviewPeriodSummary } from './financeOverviewCashInflows.js';
import { loadOverviewCashInflowExtras } from './financeOverviewCashInflowsData.js';
import { addDaysYmd, currentYmFinance } from '../../src/lib/financeForecastCore.js';

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
  const includeContracts = ['1', 'true', 'yes'].includes(
    String(req.query.includeContracts || req.query.include_contracts || '').trim().toLowerCase()
  );
  const includePayables = ['1', 'true', 'yes'].includes(
    String(req.query.includePayables || req.query.include_payables || '').trim().toLowerCase()
  );
  const canIncludePayables =
    includePayables && (await isAcademyOwnerOrAdminUser(academyDoc, me));
  const bankCompareAsOf = String(req.query.bankCompareAsOf || req.query.bank_compare_as_of || '').trim().slice(0, 10);
  const prevMonth = previousMonthYm(month);
  const periodCtx = overviewPeriodContext(month);
  const { from, to, asOf } = periodCtx;
  const prevBounds = monthPeriodBounds(prevMonth);
  const compareAsOf = /^\d{4}-\d{2}-\d{2}$/.test(bankCompareAsOf)
    ? bankCompareAsOf
    : monthEndYmd(prevMonth);

  const key = cacheKey([
    'finance-overview',
    'v5',
    academyId,
    month,
    regime,
    includeForecast ? 'forecast' : '',
    includeContracts ? 'contracts' : '',
    canIncludePayables ? 'payables' : '',
    compareAsOf,
  ]);
  const cached = getCached(key);
  if (cached) return json(res, 200, cached, true);

  try {
    const financeConfig = await loadFinanceConfig(academyId, academyDoc);
    const forecastRange = forecastNext30Range();

    const [
      receivablesInputs,
      currentPeriod,
      bankDual,
      cashClosing,
      cashInflowExtras,
    ] = await Promise.all([
      loadReceivablesInputs(academyId, month),
      listFinancialTxForPeriodWithMeta(academyId, { from, to, regime }),
      computeDualBankBalancesPayload(academyId, asOf, compareAsOf, financeConfig, {
        periodFrom: from,
        periodTo: to,
      }),
      getCashClosing(academyId, month),
      loadOverviewCashInflowExtras(academyId, from, to),
    ]);

    const summaryCurrent = enrichOverviewPeriodSummary(
      buildPeriodSummary(from, to, regime, currentPeriod.items, {
        truncated: currentPeriod.truncated,
        maxCollect: currentPeriod.maxCollect,
        totalInPeriod: currentPeriod.totalInPeriod,
      }),
      currentPeriod.items,
      cashInflowExtras
    );

    const closingTxResult = deriveClosingTxResultFromPeriodItems(
      currentPeriod.items,
      month,
      regime
    );

    const closing = buildClosingPayload({
      referenceMonth: month,
      regime,
      payments: receivablesInputs.payments,
      transactions: closingTxResult.transactions,
      pendingInMonth: closingTxResult.pendingInMonth,
      cashClosing,
    });

    const [forecastFull, contractsAwaitingCount, payablesInputs, prevPeriod, cashInflowExtrasPrev] =
      await Promise.all([
      includeForecast
        ? buildFinanceForecast(academyId, forecastRange.from, forecastRange.to, {
            financeConfig,
            preloadedStudents: receivablesInputs.students,
            preloadedOpeningBalance: bankDual.current?.totalBalance,
          })
        : Promise.resolve(null),
      includeContracts ? countContractsAwaitingSignature(academyId) : Promise.resolve(null),
      canIncludePayables
        ? loadPayablesInputs(academyId).catch((e) => {
            console.error(JSON.stringify({
              event: 'finance_overview_payables_load_error',
              academyId,
              error: e?.message || String(e),
            }));
            return null;
          })
        : Promise.resolve(null),
      listFinancialTxForPeriodWithMeta(academyId, {
        from: prevBounds.from,
        to: prevBounds.to,
        regime,
      }),
      loadOverviewCashInflowExtras(academyId, prevBounds.from, prevBounds.to),
    ]);

    const summaryPrev = enrichOverviewPeriodSummary(
      buildPeriodSummary(prevBounds.from, prevBounds.to, regime, prevPeriod.items, {
        truncated: prevPeriod.truncated,
        maxCollect: prevPeriod.maxCollect,
        totalInPeriod: prevPeriod.totalInPeriod,
      }),
      prevPeriod.items,
      cashInflowExtrasPrev
    );

    const receivablesSnapshot = buildReceivablesSnapshot({
      students: receivablesInputs.students,
      payments: receivablesInputs.payments,
      coveragePayments: receivablesInputs.coveragePayments,
      financeConfig,
      referenceMonth: month,
      pendingTransactions: receivablesInputs.pendingTransactions,
      deferredSales: receivablesInputs.deferredSales,
    });

    const mensalKpis = computeMensalidadesMonthKpis(
      receivablesInputs.students,
      receivablesInputs.payments,
      financeConfig,
      month,
      { coveragePayments: receivablesInputs.coveragePayments }
    );

    const closingDivergenceCount = countClosingDivergences({
      payments: closing.payments || [],
      transactions: closing.transactions || [],
      students: receivablesInputs.students,
      financeConfig,
      referenceMonth: month,
      regime,
    });

    let payablesPreview = null;
    if (payablesInputs) {
      const today = todayYmdLocal();
      const payablesSnapshot = buildPayablesSnapshot({
        pendingTransactions: payablesInputs.pendingTransactions,
        recurrenceTemplates: payablesInputs.recurrenceTemplates,
        fromYmd: today,
        toYmd: addDaysYmd(today, 90),
        today,
        section: 'visao',
      });
      payablesPreview = trimPayablesForOverview(payablesSnapshot);
    }

    const body = {
      ok: true,
      referenceMonth: month,
      regime,
      from,
      to,
      period: {
        from,
        to,
        asOf,
        isCurrentMonth: month === currentYmFinance(),
        regime,
      },
      summary: summaryCurrent,
      summaryPrev,
      receivables: trimReceivablesForOverview({
        referenceMonth: month,
        ...receivablesSnapshot,
      }),
      mensalKpis,
      closingDivergenceCount,
      pendingInMonth: closing.pendingInMonth,
      isMonthConferred: Boolean(closing?.cashClosing),
      contractsAwaitingCount,
      forecastPreview: includeForecast ? trimForecastForOverview(forecastFull) : null,
      payablesPreview,
      bankBalances: bankDual.current,
      bankBalancesCompare: bankDual.compare,
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
