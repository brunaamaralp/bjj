/**
 * Leituras para contas a pagar (saídas pendentes + templates recorrentes).
 */
import { Query } from 'node-appwrite';
import { DB_ID, databases } from './academyAccess.js';
import { mapFinanceTxDoc, txDirection } from './financeTxFields.js';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';

export const MAX_PENDING_OUT_TX = 300;
export const MAX_RECURRENCE_TEMPLATES = 100;

async function fetchPendingPages(academyId, extraQueries = []) {
  if (!FINANCIAL_TX_COL) return [];
  let cursor = null;
  const all = [];
  for (let page = 0; page < 25 && all.length < MAX_PENDING_OUT_TX; page += 1) {
    const q = [
      Query.equal('academyId', academyId),
      Query.equal('status', ['pending']),
      Query.orderDesc('$createdAt'),
      Query.limit(100),
      ...extraQueries,
    ];
    if (cursor) q.push(Query.cursorAfter(cursor));
    let res;
    try {
      res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, q);
    } catch {
      break;
    }
    const docs = res.documents || [];
    all.push(...docs);
    if (docs.length < 100 || all.length >= MAX_PENDING_OUT_TX) break;
    cursor = docs[docs.length - 1]?.$id;
    if (!cursor) break;
  }
  return all.slice(0, MAX_PENDING_OUT_TX);
}

export async function listPendingOutflowTx(academyId) {
  const docs = await fetchPendingPages(academyId);
  const mapped = [];
  for (const doc of docs) {
    const row = mapFinanceTxDoc(doc);
    if (!row) continue;
    if (row.is_recurrence_template === true) continue;
    const dir = txDirection(row);
    const type = String(row.type || '').toLowerCase();
    if (dir !== 'out' && type !== 'expense' && type !== 'expense_operational' && type !== 'expense_financial') {
      continue;
    }
    mapped.push(row);
  }
  return mapped;
}

export async function listOutflowRecurrenceTemplates(academyId) {
  if (!FINANCIAL_TX_COL) return [];
  let cursor = null;
  const all = [];
  for (let page = 0; page < 15 && all.length < MAX_RECURRENCE_TEMPLATES; page += 1) {
    const q = [
      Query.equal('academyId', academyId),
      Query.equal('is_recurrence_template', true),
      Query.limit(100),
    ];
    if (cursor) q.push(Query.cursorAfter(cursor));
    let res;
    try {
      res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, q);
    } catch (e) {
      if (String(e?.message || '').includes('Unknown attribute')) return [];
      throw e;
    }
    const docs = res.documents || [];
    for (const doc of docs) {
      const row = mapFinanceTxDoc(doc);
      if (!row) continue;
      if (txDirection(row) !== 'out') continue;
      const type = String(row.recurrence_type || '').toLowerCase();
      if (type === 'none' || !type) continue;
      all.push(row);
      if (all.length >= MAX_RECURRENCE_TEMPLATES) break;
    }
    if (docs.length < 100 || all.length >= MAX_RECURRENCE_TEMPLATES) break;
    cursor = docs[docs.length - 1]?.$id;
    if (!cursor) break;
  }
  return all;
}

export async function loadPayablesInputs(academyId) {
  const [pendingTransactions, recurrenceTemplates] = await Promise.all([
    listPendingOutflowTx(academyId),
    listOutflowRecurrenceTemplates(academyId),
  ]);
  return { pendingTransactions, recurrenceTemplates };
}
