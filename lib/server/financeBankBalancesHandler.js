/**
 * GET /api/finance?route=bank-balances&asOf=YYYY-MM-DD
 */
import { ensureAuth, ensureAcademyAccess, ACADEMIES_COL, DB_ID, databases } from './academyAccess.js';
import { mergeFinanceConfigFromAcademyDoc } from '../../src/lib/financeConfigStorage.js';
import { computeBankBalancesPayload, todayYmdLocal } from './financeBankBalancesData.js';

function json(res, status, body) {
  res.status(status).json(body);
}

export default async function financeBankBalancesHandler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  const asOfRaw = String(req.query.asOf || req.query.as_of || '').trim().slice(0, 10);
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw) ? asOfRaw : todayYmdLocal();

  try {
    let financeConfig = { bankAccounts: [] };
    if (ACADEMIES_COL) {
      try {
        const academyDoc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        financeConfig = mergeFinanceConfigFromAcademyDoc(academyDoc);
      } catch {
        financeConfig = { bankAccounts: [] };
      }
    }

    const body = await computeBankBalancesPayload(academyId, asOf, financeConfig);
    return json(res, 200, body);
  } catch (e) {
    console.error(JSON.stringify({
      event: 'finance_bank_balances_error',
      academyId,
      asOf,
      error: e?.message || String(e),
    }));
    return json(res, 500, { ok: false, error: 'bank_balances_failed' });
  }
}
