/**
 * Cálculo de saldos bancários (compartilhado entre rotas bank-balances e overview).
 */
import { Query } from 'node-appwrite';
import { DB_ID, databases } from './academyAccess.js';
import { mapFinanceTxDoc } from './financeTxFields.js';
import {
  computeBankAccountBalances,
  resolveTxBankAccount,
  financeTxSettledYmdFromAppwriteDoc,
} from '../../src/lib/bankAccountBalances.js';
import { filterBankAccountsWithBank } from '../../src/lib/bankAccounts.js';
import {
  endOfDayIsoFinance,
  startOfDayIsoFinance,
  todayYmdLocal,
} from '../../src/lib/financeForecastCore.js';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';

function parseYmd(value) {
  const s = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

/**
 * Data mínima para buscar TX liquidadas quando todas as contas têm openingBalanceDate.
 * Se alguma conta não tiver data, retorna null (varredura completa).
 */
export function bankBalancesFetchFromYmd(financeConfig) {
  const accounts = filterBankAccountsWithBank(financeConfig?.bankAccounts || []);
  if (!accounts.length) return null;
  let earliest = null;
  for (const acc of accounts) {
    const d = parseYmd(acc.openingBalanceDate);
    if (!d) return null;
    if (!earliest || d < earliest) earliest = d;
  }
  return earliest;
}

export { todayYmdLocal };

function asOfEndIso(asOfYmd) {
  return endOfDayIsoFinance(normalizeAsOfYmd(asOfYmd));
}

function normalizeAsOfYmd(asOfYmd) {
  const asOfRaw = String(asOfYmd || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw) ? asOfRaw : todayYmdLocal();
}

function maxYmd(a, b) {
  const left = normalizeAsOfYmd(a);
  const right = normalizeAsOfYmd(b);
  return left >= right ? left : right;
}

function filterSettledDocsAsOf(docs, asOfYmd) {
  const endIso = asOfEndIso(normalizeAsOfYmd(asOfYmd));
  if (!endIso) return docs || [];
  const endMs = new Date(endIso).getTime();
  return (docs || []).filter((d) => {
    if (String(d.status || '').toLowerCase() !== 'settled') return false;
    const ymd = financeTxSettledYmdFromAppwriteDoc(d);
    if (!ymd) return true;
    const ms = new Date(`${ymd}T23:59:59.999`).getTime();
    return Number.isFinite(ms) ? ms <= endMs : true;
  });
}

export function computeBankBalancesPayloadFromSettledDocs(rawDocs, asOfYmd, financeConfig, opts = {}) {
  const { periodFrom, periodTo } = opts;
  const asOf = normalizeAsOfYmd(asOfYmd);
  const accounts = filterBankAccountsWithBank(financeConfig?.bankAccounts || []);
  const docs = filterSettledDocsAsOf(rawDocs, asOf);
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
    periodFrom,
    periodTo,
  });

  return {
    ok: true,
    asOf: computed.asOf,
    periodFrom: computed.periodFrom,
    periodTo: computed.periodTo,
    accounts: computed.accounts,
    unallocated: computed.unallocated,
    totalBalance: computed.totalBalance,
  };
}

/** Uma leitura de TX liquidadas → saldos em duas datas (Visão Geral). */
export async function computeDualBankBalancesPayload(
  academyId,
  asOfCurrent,
  asOfCompare,
  financeConfig,
  opts = {}
) {
  const { periodFrom, periodTo } = opts;
  const currentAsOf = normalizeAsOfYmd(asOfCurrent);
  const compareAsOf = /^\d{4}-\d{2}-\d{2}$/.test(String(asOfCompare || '').trim().slice(0, 10))
    ? String(asOfCompare).trim().slice(0, 10)
    : null;
  const fetchAsOf = compareAsOf ? maxYmd(currentAsOf, compareAsOf) : currentAsOf;
  const fromYmd = bankBalancesFetchFromYmd(financeConfig);
  const rawDocs = await fetchAllSettledTx(academyId, fetchAsOf, { fromYmd });
  return {
    current: computeBankBalancesPayloadFromSettledDocs(rawDocs, currentAsOf, financeConfig, {
      periodFrom,
      periodTo,
    }),
    compare: compareAsOf
      ? computeBankBalancesPayloadFromSettledDocs(rawDocs, compareAsOf, financeConfig)
      : null,
  };
}

export async function fetchAllSettledTx(academyId, asOfYmd, opts = {}) {
  if (!FINANCIAL_TX_COL) return [];
  const PAGE = 100;
  const endIso = asOfEndIso(asOfYmd);
  const fromYmd = parseYmd(opts.fromYmd);
  const startIso = fromYmd ? startOfDayIsoFinance(fromYmd) : null;
  let all = [];
  let cursor = null;
  for (let i = 0; i < 40; i += 1) {
    const queries = [
      Query.equal('academyId', academyId),
      Query.equal('status', ['settled']),
      Query.limit(PAGE),
    ];
    if (startIso) queries.push(Query.greaterThanEqual('settledAt', startIso));
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
      const endMs = endIso ? new Date(endIso).getTime() : null;
      const startMs = startIso ? new Date(startIso).getTime() : null;
      const batch = (res.documents || []).filter((d) => {
        if (String(d.status || '').toLowerCase() !== 'settled') return false;
        const settledAt = d.settledAt || d.$updatedAt || d.$createdAt;
        if (!settledAt) return true;
        const ms = new Date(settledAt).getTime();
        if (!Number.isFinite(ms)) return true;
        if (startMs != null && ms < startMs) return false;
        if (endMs != null && ms > endMs) return false;
        return true;
      });
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
  const asOf = normalizeAsOfYmd(asOfYmd);
  const docs = await fetchAllSettledTx(academyId, asOf);
  return computeBankBalancesPayloadFromSettledDocs(docs, asOf, financeConfig);
}
