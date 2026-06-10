/**
 * Cálculo de saldos bancários (compartilhado entre rotas bank-balances e overview).
 */
import { Query } from 'node-appwrite';
import { DB_ID, databases } from './academyAccess.js';
import { mapFinanceTxDoc } from './financeTxFields.js';
import {
  computeBankAccountBalances,
  resolveTxBankAccount,
} from '../../src/lib/bankAccountBalances.js';
import { filterBankAccountsWithBank } from '../../src/lib/bankAccounts.js';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';

export function todayYmdLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function asOfEndIso(asOfYmd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(asOfYmd || ''))) return null;
  return new Date(`${asOfYmd}T23:59:59.999`).toISOString();
}

export async function fetchAllSettledTx(academyId, asOfYmd) {
  if (!FINANCIAL_TX_COL) return [];
  const PAGE = 100;
  const endIso = asOfEndIso(asOfYmd);
  let all = [];
  let cursor = null;
  for (let i = 0; i < 40; i += 1) {
    const queries = [
      Query.equal('academyId', academyId),
      Query.equal('status', ['settled']),
      Query.limit(PAGE),
    ];
    if (endIso) queries.push(Query.lessThanEqual('settledAt', endIso));
    if (cursor) queries.push(Query.cursorAfter(cursor));
    let res;
    try {
      res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, queries);
    } catch (e) {
      const msg = String(e?.message || '').toLowerCase();
      if (!msg.includes('unknown attribute') && !msg.includes('invalid query')) throw e;
      const fallback = [
        Query.equal('academyId', academyId),
        Query.equal('status', ['settled']),
        Query.limit(PAGE),
      ];
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

export async function computeBankBalancesPayload(academyId, asOfYmd, financeConfig) {
  const asOfRaw = String(asOfYmd || '').trim().slice(0, 10);
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw) ? asOfRaw : todayYmdLocal();
  const accounts = filterBankAccountsWithBank(financeConfig?.bankAccounts || []);
  const docs = await fetchAllSettledTx(academyId, asOf);
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

  return {
    ok: true,
    asOf: computed.asOf,
    accounts: computed.accounts,
    unallocated: computed.unallocated,
    totalBalance: computed.totalBalance,
  };
}
