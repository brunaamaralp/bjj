/**
 * Dados de fechamento mensal (compartilhado entre closing e overview).
 */
import { Query } from 'node-appwrite';
import { DB_ID, databases } from './academyAccess.js';
import { mapFinanceTxDoc } from './financeTxFields.js';
import {
  monthDateRange,
  dateInReferenceMonth,
} from '../../src/lib/monthlyClosing.js';
import { FINANCE_REGIME } from '../../src/lib/financeCompetence.js';
import { listPaymentsForMonth } from './financeReceivablesData.js';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';
const CASH_CLOSING_COL =
  process.env.APPWRITE_CASH_CLOSING_COLLECTION_ID ||
  process.env.VITE_APPWRITE_CASH_CLOSING_COLLECTION_ID ||
  '';

const PAGE = 200;

function txBelongsToClosingMonth(doc, referenceMonth, regime) {
  const st = String(doc.status || '').toLowerCase();
  if (st === 'cancelled') return false;
  if (regime === FINANCE_REGIME.COMPETENCE) {
    const cm = String(doc.competence_month || '').trim();
    if (cm === referenceMonth) return true;
    if (!cm) return dateInReferenceMonth(doc.settledAt || doc.$createdAt, referenceMonth);
    return false;
  }
  if (st === 'pending') {
    return dateInReferenceMonth(doc.$createdAt, referenceMonth);
  }
  return dateInReferenceMonth(doc.settledAt || doc.$createdAt, referenceMonth);
}

export async function listFinancialTxForMonth(academyId, referenceMonth, regime = FINANCE_REGIME.CASH) {
  const { start, end } = monthDateRange(referenceMonth);
  if (!start || !end || !FINANCIAL_TX_COL) return { transactions: [], pendingInMonth: 0 };

  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const items = [];
  let pendingInMonth = 0;

  async function fetchBatch(extraQueries) {
    let cursor = null;
    for (let i = 0; i < 30; i += 1) {
      const q = [
        Query.equal('academyId', academyId),
        Query.limit(PAGE),
        Query.orderDesc('$createdAt'),
        ...extraQueries,
      ];
      if (cursor) q.push(Query.cursorAfter(cursor));
      const res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, q);
      const docs = res.documents || [];
      for (const d of docs) {
        if (!txBelongsToClosingMonth(d, referenceMonth, regime)) continue;
        const mapped = mapFinanceTxDoc(d);
        if (mapped) {
          items.push({
            ...mapped,
            competence_month: d.competence_month || '',
            competenceFallback:
              regime === FINANCE_REGIME.COMPETENCE && !String(d.competence_month || '').trim(),
          });
        }
        if (String(d.status || '').toLowerCase() === 'pending') pendingInMonth += 1;
      }
      if (docs.length < PAGE) break;
      cursor = docs[docs.length - 1]?.$id;
      if (!cursor) break;
    }
  }

  if (regime === FINANCE_REGIME.COMPETENCE) {
    try {
      await fetchBatch([
        Query.equal('competence_month', referenceMonth),
        Query.equal('status', ['settled']),
      ]);
    } catch {
      await fetchBatch([Query.equal('status', ['settled'])]);
    }
  } else {
    await fetchBatch([
      Query.greaterThanEqual('settledAt', startIso),
      Query.lessThanEqual('settledAt', endIso),
    ]);
  }

  await fetchBatch([
    Query.equal('status', ['pending']),
    Query.greaterThanEqual('$createdAt', startIso),
    Query.lessThanEqual('$createdAt', endIso),
  ]);

  const byId = new Map();
  for (const t of items) byId.set(t.id, t);

  return { transactions: [...byId.values()], pendingInMonth };
}

export async function getCashClosing(academyId, referenceMonth) {
  if (!CASH_CLOSING_COL) return null;
  try {
    const list = await databases.listDocuments(DB_ID, CASH_CLOSING_COL, [
      Query.equal('academy_id', academyId),
      Query.equal('reference_month', referenceMonth),
      Query.limit(1),
    ]);
    return list.documents?.[0] || null;
  } catch {
    return null;
  }
}

function mapCashClosingDoc(cashClosing) {
  return cashClosing
    ? {
        id: cashClosing.$id,
        closed_at: cashClosing.closed_at,
        closed_by: cashClosing.closed_by,
        snapshot_json: cashClosing.snapshot_json,
      }
    : null;
}

export function buildClosingPayload({
  referenceMonth,
  regime,
  payments,
  transactions,
  pendingInMonth,
  cashClosing,
}) {
  return {
    referenceMonth,
    regime,
    payments: payments || [],
    transactions: transactions || [],
    pendingInMonth: Number(pendingInMonth) || 0,
    cashClosing: mapCashClosingDoc(cashClosing),
  };
}

export async function loadClosingGetPayload(academyId, referenceMonth, regime, preloaded = {}) {
  const payments =
    preloaded.payments ?? (await listPaymentsForMonth(academyId, referenceMonth));
  const txResult =
    preloaded.txResult ?? (await listFinancialTxForMonth(academyId, referenceMonth, regime));
  const cashClosing =
    preloaded.cashClosing !== undefined
      ? preloaded.cashClosing
      : await getCashClosing(academyId, referenceMonth);

  return buildClosingPayload({
    referenceMonth,
    regime,
    payments,
    transactions: txResult.transactions,
    pendingInMonth: txResult.pendingInMonth,
    cashClosing,
  });
}
