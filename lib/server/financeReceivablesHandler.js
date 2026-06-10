/**
 * GET /api/finance?route=receivables&month=YYYY-MM
 * Agrega contas a receber: mensalidades, lançamentos pendentes e vendas a prazo.
 */
import { ensureAuth, ensureAcademyAccess, ACADEMIES_COL, DB_ID, databases } from './academyAccess.js';
import { mergeFinanceConfigFromAcademyDoc } from '../../src/lib/financeConfigStorage.js';
import { parseReferenceMonth } from '../../src/lib/monthlyClosing.js';
import { buildReceivablesSnapshot } from '../../src/lib/receivablesAggregate.js';
import { loadReceivablesInputs } from './financeReceivablesData.js';

function json(res, status, body) {
  res.status(status).json(body);
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

  try {
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

    const { students, payments, pendingTransactions, deferredSales } =
      await loadReceivablesInputs(academyId, month);

    const snapshot = buildReceivablesSnapshot({
      students,
      payments,
      financeConfig,
      referenceMonth: month,
      pendingTransactions,
      deferredSales,
    });

    return json(res, 200, {
      ok: true,
      referenceMonth: month,
      ...snapshot,
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
