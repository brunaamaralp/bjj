/**
 * GET /api/finance?route=payables&from=&to=&section=
 */
import { ensureAuth, ensureAcademyAccess, isAcademyOwnerOrAdminUser } from './academyAccess.js';
import { buildPayablesSnapshot } from '../../src/lib/payablesAggregate.js';
import { todayYmdLocal, addDaysYmd } from '../../src/lib/financeForecastCore.js';
import { loadPayablesInputs } from './payablesData.js';

function json(res, status, body) {
  res.status(status).json(body);
}

function parseSection(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'contas-fixas' || s === 'vencidas' || s === 'visao') return s;
  return 'visao';
}

function filterSearch(items, search) {
  const q = String(search || '').trim().toLowerCase();
  if (!q) return items;
  return items.filter((it) => {
    const hay = `${it.vendor_label || ''} ${it.category || ''}`.toLowerCase();
    return hay.includes(q);
  });
}

function filterCategory(items, category) {
  const cat = String(category || '').trim();
  if (!cat) return items;
  return items.filter((it) => String(it.category || '').trim() === cat);
}

export default async function payablesHandler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId, doc: academyDoc } = access;

  if (!(await isAcademyOwnerOrAdminUser(academyDoc, me))) {
    return json(res, 403, { ok: false, error: 'forbidden' });
  }

  const today = todayYmdLocal();
  const from = String(req.query.from || '').trim().slice(0, 10) || today;
  const to = String(req.query.to || '').trim().slice(0, 10) || addDaysYmd(today, 30);
  const section = parseSection(req.query.section);

  try {
    const { pendingTransactions, recurrenceTemplates } = await loadPayablesInputs(academyId);
    const snapshot = buildPayablesSnapshot({
      pendingTransactions,
      recurrenceTemplates,
      fromYmd: from,
      toYmd: to,
      today,
      section,
    });

    let items = snapshot.items;
    items = filterSearch(items, req.query.search || req.query.q);
    items = filterCategory(items, req.query.category);

    return json(res, 200, {
      ok: true,
      from: snapshot.from,
      to: snapshot.to,
      section,
      summary: snapshot.summary,
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
