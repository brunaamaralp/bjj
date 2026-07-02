/**
 * GET /api/finance?route=dre|dfc&month=YYYY-MM
 * Demonstrativos por competência (DRE) e caixa (DFC) com comparativo ao mês anterior.
 */
import { ensureAuth, ensureAcademyAccess, ACADEMIES_COL, DB_ID, databases } from './academyAccess.js';
import { mergeFinanceConfigFromAcademyDoc } from '../../src/lib/financeConfigStorage.js';
import { parseReferenceMonth } from '../../src/lib/monthlyClosing.js';
import { monthPeriodBounds, previousMonthYm } from '../../src/lib/financeiroOverview.js';
import { computeDre } from '../../src/lib/computeDre.js';
import { computeDfc } from '../../src/lib/computeDfc.js';
import { buildDreCompareDelta, buildDfcCompareDelta } from '../../src/lib/financeStatementDelta.js';
import { FINANCE_REGIME } from '../../src/lib/financeCompetence.js';
import {
  listFinancialTxForDrePeriod,
  listFinancialTxForPeriodWithMeta,
} from './financeTxQuery.js';
import { loadAccounts } from './financeJournalServer.js';
import {
  bankBalancesFetchFromYmd,
  computeBankBalancesPayloadFromSettledDocs,
  fetchAllSettledTx,
} from './financeBankBalancesData.js';

function json(res, status, body) {
  res.status(status).json(body);
}

function parsePeriodQuery(req) {
  const month = parseReferenceMonth(
    String(req.query.month || req.query.reference_month || '').trim()
  );
  if (month) {
    const { from, to } = monthPeriodBounds(month);
    return { month, from, to };
  }
  const from = String(req.query.from || '').trim().slice(0, 10);
  const to = String(req.query.to || '').trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { month: null, from, to };
  }
  return null;
}

async function loadFinanceConfig(academyId, academyDoc) {
  if (ACADEMIES_COL && academyDoc) {
    return mergeFinanceConfigFromAcademyDoc(academyDoc);
  }
  if (ACADEMIES_COL) {
    try {
      const academy = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
      return mergeFinanceConfigFromAcademyDoc(academy);
    } catch {
      /* defaults */
    }
  }
  return { bankAccounts: [], plans: [] };
}

async function loadStatementContext(req, res) {
  const me = await ensureAuth(req, res);
  if (!me) return null;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return null;

  const period = parsePeriodQuery(req);
  if (!period) {
    json(res, 400, { ok: false, error: 'period_required' });
    return null;
  }

  const accounts = await loadAccounts(access.academyId);
  const financeConfig = await loadFinanceConfig(access.academyId, access.doc);
  return { ...access, period, accounts, financeConfig };
}

export async function financeDreHandler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });

  const ctx = await loadStatementContext(req, res);
  if (!ctx) return;

  const { academyId, period, accounts } = ctx;
  const periodArg = period.month
    ? { month: period.month }
    : { from: period.from, to: period.to };

  try {
    const { items, truncated, maxCollect, totalInPeriod } = await listFinancialTxForDrePeriod(
      academyId,
      { ...periodArg, from: period.from, to: period.to }
    );

    const statement = computeDre(periodArg, items, accounts);

    let compareMonth = null;
    let compare = null;
    let delta = null;
    if (period.month) {
      compareMonth = previousMonthYm(period.month);
      const { items: compareItems } = await listFinancialTxForDrePeriod(academyId, {
        month: compareMonth,
        ...monthPeriodBounds(compareMonth),
      });
      compare = computeDre({ month: compareMonth }, compareItems, accounts);
      delta = buildDreCompareDelta(statement, compare);
    }

    return json(res, 200, {
      ok: true,
      month: period.month,
      compareMonth,
      period: statement.period,
      statement,
      compare,
      delta,
      truncated,
      maxCollect,
      totalInPeriod,
    });
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'finance_dre_error',
        academyId,
        period,
        error: e?.message || String(e),
      })
    );
    return json(res, 500, { ok: false, error: 'dre_failed' });
  }
}

export async function financeDfcHandler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });

  const ctx = await loadStatementContext(req, res);
  if (!ctx) return;

  const { academyId, period, accounts, financeConfig } = ctx;
  const periodArg = period.month
    ? { month: period.month }
    : { from: period.from, to: period.to };

  try {
    const { items, truncated, maxCollect, totalInPeriod } =
      await listFinancialTxForPeriodWithMeta(academyId, {
        from: period.from,
        to: period.to,
        regime: FINANCE_REGIME.CASH,
      });

    const fromYmd = bankBalancesFetchFromYmd(financeConfig);
    const rawDocs = await fetchAllSettledTx(academyId, period.to, { fromYmd });
    const bankBalances = computeBankBalancesPayloadFromSettledDocs(
      rawDocs,
      period.to,
      financeConfig,
      { periodFrom: period.from, periodTo: period.to }
    );

    const statement = computeDfc(periodArg, items, accounts, bankBalances);

    let compareMonth = null;
    let compare = null;
    let delta = null;
    if (period.month) {
      compareMonth = previousMonthYm(period.month);
      const compareBounds = monthPeriodBounds(compareMonth);
      const { items: compareItems } = await listFinancialTxForPeriodWithMeta(academyId, {
        from: compareBounds.from,
        to: compareBounds.to,
        regime: FINANCE_REGIME.CASH,
      });
      const compareBankBalances = computeBankBalancesPayloadFromSettledDocs(
        rawDocs,
        compareBounds.to,
        financeConfig,
        { periodFrom: compareBounds.from, periodTo: compareBounds.to }
      );
      compare = computeDfc({ month: compareMonth }, compareItems, accounts, compareBankBalances);
      delta = buildDfcCompareDelta(statement, compare);
    }

    return json(res, 200, {
      ok: true,
      month: period.month,
      compareMonth,
      period: statement.period,
      statement,
      compare,
      delta,
      truncated,
      maxCollect,
      totalInPeriod,
    });
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'finance_dfc_error',
        academyId,
        period,
        error: e?.message || String(e),
      })
    );
    return json(res, 500, { ok: false, error: 'dfc_failed' });
  }
}
