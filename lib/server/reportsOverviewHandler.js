/**
 * GET /api/reports-light?type=overview — finance + sales + inventory em uma chamada.
 */
import {
  isAcademyOwnerOrAdminUser,
  DB_ID,
  databases,
} from './academyAccess.js';
import { cacheKey, getCached, setCached } from './reportsLightCache.js';
import { FINANCE_REGIME } from '../../src/lib/financeCompetence.js';
import {
  academyHasFinanceModule,
  academyHasInventoryModule,
  academyHasSalesModule,
} from '../../src/lib/stockSettings.js';
import { financeSummary, salesSummary } from './reportsLightHandler.js';
import { buildInventoryReport } from './inventoryReportHandler.js';

const STOCK_ITEMS_COL =
  process.env.VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID || process.env.STOCK_ITEMS_COL || '';

export async function buildReportsOverview(access, me, { from, to, prevFrom, prevTo, regime }) {
  const { academyId, doc } = access;
  const hasFinance = academyHasFinanceModule(doc);
  const hasSales = academyHasSalesModule(doc);
  const hasInventory = academyHasInventoryModule(doc);
  const financePrivileged = hasFinance ? await isAcademyOwnerOrAdminUser(doc, me) : false;

  const tasks = [];

  if (hasFinance && financePrivileged) {
    tasks.push(
      financeSummary(academyId, from, to, regime).then((data) => ({ key: 'finance', data })),
      financeSummary(academyId, prevFrom, prevTo, regime).then((data) => ({ key: 'financePrev', data }))
    );
  }

  if (hasSales) {
    tasks.push(
      salesSummary(academyId, from, to).then((data) => ({ key: 'sales', data })),
      salesSummary(academyId, prevFrom, prevTo).then((data) => ({ key: 'salesPrev', data }))
    );
  }

  if (hasInventory && STOCK_ITEMS_COL && DB_ID) {
    tasks.push(
      buildInventoryReport(databases, DB_ID, STOCK_ITEMS_COL, academyId, from, to).then((data) => ({
        key: 'inventory',
        data: data?.summary || null,
      })),
      buildInventoryReport(databases, DB_ID, STOCK_ITEMS_COL, academyId, prevFrom, prevTo).then((data) => ({
        key: 'inventoryPrev',
        data: data?.summary || null,
      }))
    );
  }

  const settled = await Promise.all(tasks);
  const out = {
    finance: null,
    financePrev: null,
    sales: null,
    salesPrev: null,
    inventory: null,
    inventoryPrev: null,
    modules: { finance: hasFinance, sales: hasSales, inventory: hasInventory },
    financePrivileged,
  };
  for (const row of settled) {
    out[row.key] = row.data;
  }
  return out;
}

export async function handleReportsOverviewGet(req, res, access, me) {
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  const prevFrom = String(req.query.prevFrom || '').trim();
  const prevTo = String(req.query.prevTo || '').trim();
  const regimeRaw = String(req.query.regime || FINANCE_REGIME.CASH).toLowerCase();
  const regime =
    regimeRaw === FINANCE_REGIME.COMPETENCE ? FINANCE_REGIME.COMPETENCE : FINANCE_REGIME.CASH;

  if (!from || !to || !prevFrom || !prevTo) {
    return res.status(400).json({ ok: false, error: 'from_to_prev_required' });
  }

  const { academyId } = access;
  const key = cacheKey(['overview', academyId, from, to, prevFrom, prevTo, regime]);
  const cached = getCached(key);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cached);
  }

  try {
    const overview = await buildReportsOverview(access, me, { from, to, prevFrom, prevTo, regime });
    const body = { ok: true, type: 'overview', from, to, prevFrom, prevTo, ...overview };
    setCached(key, body);
    return res.status(200).json(body);
  } catch (e) {
    console.error('[reportsOverview]', e);
    return res.status(500).json({ ok: false, error: 'load_failed' });
  }
}
