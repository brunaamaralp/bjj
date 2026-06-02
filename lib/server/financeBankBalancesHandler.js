/**
 * GET /api/finance?route=bank-balances&asOf=YYYY-MM-DD
 */
import { Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, DB_ID, databases } from './academyAccess.js';
import { mapFinanceTxDoc, parseFinanceConfig } from './financeTxFields.js';
import {
  computeBankAccountBalances,
  resolveTxBankAccount,
} from '../../src/lib/bankAccountBalances.js';
import { filterBankAccountsWithBank } from '../../src/lib/bankAccounts.js';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COL_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

function json(res, status, body) {
  res.status(status).json(body);
}

function todayYmdLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function fetchAllSettledTx(academyId) {
  if (!FINANCIAL_TX_COL) return [];
  const PAGE = 100;
  let all = [];
  let cursor = null;
  for (let i = 0; i < 40; i += 1) {
    const queries = [
      Query.equal('academyId', academyId),
      Query.equal('status', ['settled']),
      Query.limit(PAGE),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    let res;
    try {
      res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, queries);
    } catch (e) {
      const msg = String(e?.message || '').toLowerCase();
      if (!msg.includes('unknown attribute') && !msg.includes('invalid query')) throw e;
      const fallback = [Query.equal('academyId', academyId), Query.limit(PAGE)];
      if (cursor) fallback.push(Query.cursorAfter(cursor));
      res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, fallback);
      const batch = (res.documents || []).filter(
        (d) => String(d.status || '').toLowerCase() === 'settled'
      );
      all = all.concat(batch);
      if ((res.documents || []).length < PAGE) break;
      cursor = res.documents[res.documents.length - 1]?.$id;
      if (!cursor) break;
      continue;
    }
    const batch = res.documents || [];
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    cursor = batch[batch.length - 1]?.$id;
    if (!cursor) break;
  }
  return all;
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
        financeConfig = parseFinanceConfig(academyDoc.financeConfig);
      } catch {
        financeConfig = { bankAccounts: [] };
      }
    }

    const accounts = filterBankAccountsWithBank(financeConfig.bankAccounts || []);
    const docs = await fetchAllSettledTx(academyId);
    const transactions = docs
      .map((d) => mapFinanceTxDoc(d))
      .filter(Boolean)
      .map((row) => ({
        ...row,
        bank_account: row.bankAccount || resolveTxBankAccount(row),
      }));

    const computed = computeBankAccountBalances({
      accounts,
      transactions,
      asOfYmd: asOf,
    });

    return json(res, 200, {
      ok: true,
      asOf: computed.asOf,
      accounts: computed.accounts,
      unallocated: computed.unallocated,
      totalBalance: computed.totalBalance,
    });
  } catch (e) {
    console.error(JSON.stringify({
      event: 'finance_bank_balances_error',
      academyId,
      asOf,
      error: e?.message || String(e),
    }));
    return json(res, 500, { ok: false, error: 'bank_balances_failed', detail: e?.message });
  }
}
