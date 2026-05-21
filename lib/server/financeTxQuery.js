/**
 * Consulta FINANCIAL_TX com regra temporal única:
 * settled → settledAt; pending → $createdAt.
 */
import { Query } from 'node-appwrite';
import { DB_ID, databases } from './academyAccess.js';
import { mapFinanceTxDoc } from './financeTxFields.js';
import {
  FINANCE_REGIME,
  txInPeriod,
} from '../../src/lib/financeCompetence.js';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';

const PAGE = 200;
const MAX_PAGES = 30;

function rangeBounds(from, to) {
  const startIso = from ? new Date(`${from}T00:00:00`).toISOString() : null;
  let endIso = null;
  if (to) {
    const d = new Date(`${to}T23:59:59.999`);
    endIso = d.toISOString();
  }
  return { startIso, endIso };
}

async function fetchPages(academyId, extraQueries) {
  const all = [];
  let cursor = null;
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const q = [
      Query.equal('academyId', academyId),
      Query.limit(PAGE),
      Query.orderDesc('$createdAt'),
      ...extraQueries,
    ];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, q);
    const docs = res.documents || [];
    all.push(...docs);
    if (docs.length < PAGE) break;
    cursor = docs[docs.length - 1]?.$id;
    if (!cursor) break;
  }
  return all;
}

/**
 * @param {string} academyId
 * @param {{ from?: string, to?: string, regime?: string }} opts
 */
export async function listFinancialTxForPeriod(academyId, opts = {}) {
  if (!FINANCIAL_TX_COL || !DB_ID) return [];
  const { from = '', to = '', regime = FINANCE_REGIME.CASH } = opts;
  const { startIso, endIso } = rangeBounds(from, to);

  const byId = new Map();

  if (startIso && endIso) {
    const settledQs = [
      Query.equal('status', ['settled']),
      Query.greaterThanEqual('settledAt', startIso),
      Query.lessThanEqual('settledAt', endIso),
    ];
    for (const doc of await fetchPages(academyId, settledQs)) {
      byId.set(doc.$id, doc);
    }

    const pendingQs = [
      Query.equal('status', ['pending']),
      Query.greaterThanEqual('$createdAt', startIso),
      Query.lessThanEqual('$createdAt', endIso),
    ];
    for (const doc of await fetchPages(academyId, pendingQs)) {
      byId.set(doc.$id, doc);
    }
  } else {
    for (const doc of await fetchPages(academyId, [])) {
      byId.set(doc.$id, doc);
    }
  }

  const mapped = [...byId.values()]
    .map((d) => {
      const row = mapFinanceTxDoc(d);
      if (!row) return null;
      return {
        ...row,
        competence_month: d.competence_month || '',
        category: d.category || '',
        $createdAt: d.$createdAt,
      };
    })
    .filter(Boolean);

  if (regime === FINANCE_REGIME.COMPETENCE && (from || to)) {
    return mapped.filter((tx) => txInPeriod(tx, { from, to, regime }));
  }

  if (from || to) {
    return mapped.filter((tx) => txInPeriod(tx, { from, to, regime: FINANCE_REGIME.CASH }));
  }

  return mapped;
}
