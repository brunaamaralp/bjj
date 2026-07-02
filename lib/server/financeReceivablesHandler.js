/**
 * GET /api/finance?route=receivables&month=YYYY-MM
 * Agrega contas a receber: mensalidades, lançamentos pendentes e vendas a prazo.
 */
import { ensureAuth, ensureAcademyAccess, ACADEMIES_COL, DB_ID, databases } from './academyAccess.js';
import { mergeFinanceConfigFromAcademyDoc } from '../../src/lib/financeConfigStorage.js';
import { parseReferenceMonth } from '../../src/lib/monthlyClosing.js';
import { filterReceivablesForSection, RECEIVABLES_SECTIONS } from '../../src/lib/financeiroReceivablesSections.js';
import {
  loadReceivablesSnapshotBundle,
  parseReceivablesPagination,
} from './financeReceivablesSnapshot.js';
import { cacheMaxAgeSeconds } from './reportsLightCache.js';

function json(res, status, body, cacheHit = false) {
  res.setHeader('Cache-Control', `private, max-age=${Math.floor(cacheMaxAgeSeconds() / 2)}`);
  if (cacheHit) res.setHeader('X-Cache', 'HIT');
  res.status(status).json(body);
}

function parseSection(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (
    s === RECEIVABLES_SECTIONS.MENSALIDADES ||
    s === RECEIVABLES_SECTIONS.OUTROS ||
    s === RECEIVABLES_SECTIONS.COBRANCA ||
    s === RECEIVABLES_SECTIONS.VISAO
  ) {
    return s;
  }
  return RECEIVABLES_SECTIONS.VISAO;
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

export default async function financeReceivablesHandler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId, doc: academyDoc } = access;

  const month = parseReferenceMonth(String(req.query.month || req.query.reference_month || '').trim());
  if (!month) return json(res, 400, { ok: false, error: 'month_required' });

  const section = parseSection(req.query.section);
  const { limit, offset } = parseReceivablesPagination(req.query);
  const includeCobranca = ['1', 'true', 'yes'].includes(
    String(req.query.includeCobranca || req.query.include_cobranca || '').trim().toLowerCase()
  );
  const bypassCache = ['1', 'true', 'yes'].includes(
    String(req.query.refresh || '').trim().toLowerCase()
  );

  try {
    const financeConfig = await loadFinanceConfig(academyId, academyDoc);
    const { snapshot, cobrancaSummary, dataWarnings } = await loadReceivablesSnapshotBundle({
      academyId,
      referenceMonth: month,
      financeConfig,
      bypassCache,
      includeCobranca,
    });

    const filtered = filterReceivablesForSection(section, snapshot.items || []);
    const total = filtered.length;
    const pageItems = filtered.slice(offset, offset + limit);

    return json(res, 200, {
      ok: true,
      referenceMonth: month,
      section,
      summary: snapshot.summary,
      items: pageItems,
      pagination: {
        offset,
        limit,
        total,
        hasMore: offset + limit < total,
      },
      cobrancaSummary: cobrancaSummary ?? null,
      dataWarnings: dataWarnings || {},
    });
  } catch (e) {
    console.error(JSON.stringify({
      event: 'finance_receivables_error',
      academyId,
      month,
      error: e?.message || String(e),
    }));
    return json(res, 500, { ok: false, error: 'receivables_failed' });
  }
}
