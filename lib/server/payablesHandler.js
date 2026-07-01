/**
 * GET /api/finance?route=payables&from=&to=&section=
 */
import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';
import {
  buildPayablesCatalog,
  selectPayablesItems,
  filterPayablesSearch,
} from '../../src/lib/payablesAggregate.js';
import { todayYmdLocal, addDaysYmd } from '../../src/lib/financeForecastCore.js';
import { loadPayablesInputs } from './payablesData.js';
import { cacheKey, getCached, setCached } from './reportsLightCache.js';

const PAYABLES_CACHE_MS = Number(process.env.PAYABLES_CACHE_MS || 45_000);

function json(res, status, body) {
  res.status(status).json(body);
}

function parseSection(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'contas-fixas' || s === 'vencidas' || s === 'visao') return s;
  return 'visao';
}

function filterCategory(items, category) {
  const cat = String(category || '').trim();
  if (!cat) return items;
  return items.filter((it) => String(it.category || '').trim() === cat);
}

async function loadPayablesCatalogCached(academyId, from, to, today, { bypassCache = false } = {}) {
  const key = cacheKey(['payables-catalog', academyId, from, to, today]);
  if (!bypassCache) {
    const hit = getCached(key);
    if (hit) return hit;
  }

  const { pendingTransactions, recurrenceTemplates, pendingTruncated } = await loadPayablesInputs(academyId);
  const catalog = buildPayablesCatalog({
    pendingTransactions,
    recurrenceTemplates,
    fromYmd: from,
    toYmd: to,
    today,
  });
  setCached(key, { ...catalog, pendingTruncated }, PAYABLES_CACHE_MS);
  return { ...catalog, pendingTruncated };
}

export default async function payablesHandler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  const today = todayYmdLocal();
  const from = String(req.query.from || '').trim().slice(0, 10) || today;
  const to = String(req.query.to || '').trim().slice(0, 10) || addDaysYmd(today, 30);
  const section = parseSection(req.query.section);
  const bypassCache = ['1', 'true', 'yes'].includes(
    String(req.query.refresh || '').trim().toLowerCase()
  );

  try {
    const catalog = await loadPayablesCatalogCached(academyId, from, to, today, { bypassCache });

    let items = selectPayablesItems(catalog, section);
    items = filterPayablesSearch(items, req.query.search || req.query.q);
    items = filterCategory(items, req.query.category);

    return json(res, 200, {
      ok: true,
      from: catalog.from,
      to: catalog.to,
      section,
      summary: {
        ...catalog.summary,
        pendingTruncated: Boolean(catalog.pendingTruncated),
      },
      catalog: {
        pending: catalog.pending,
        templates: catalog.templates,
        projected: catalog.projected,
      },
      items,
    });
  } catch (e) {
    console.error(JSON.stringify({
      event: 'finance_payables_error',
      academyId,
      error: e?.message || String(e),
    }));
    return json(res, 500, { ok: false, error: 'payables_failed' });
  }
}
