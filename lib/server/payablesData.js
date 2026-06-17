/**
 * Leituras para contas a pagar (saídas pendentes + templates recorrentes).
 */
import { Query } from 'node-appwrite';
import { DB_ID, databases } from './academyAccess.js';
import { mapFinanceTxDoc, txDirection } from './financeTxFields.js';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';

function isAppwriteQueryError(e) {
  const msg = String(e?.message || '').toLowerCase();
  return (
    msg.includes('unknown attribute') ||
    msg.includes('invalid query') ||
    msg.includes('attribute not found') ||
    msg.includes('not available') ||
    (msg.includes('index') && msg.includes('not found'))
  );
}

function isPendingOutflowRow(row) {
  if (!row) return false;
  if (row.is_recurrence_template === true) return false;
  const dir = txDirection(row);
  const type = String(row.type || '').toLowerCase();
  return (
    dir === 'out' ||
    type === 'expense' ||
    type === 'expense_operational' ||
    type === 'expense_financial'
  );
}

export const MAX_PENDING_OUT_TX = 300;
export const MAX_RECURRENCE_TEMPLATES = 100;

async function collectPendingOutflows(academyId, extraQueries = []) {
  if (!FINANCIAL_TX_COL) return [];
  let cursor = null;
  const mapped = [];
  for (let page = 0; page < 25 && mapped.length < MAX_PENDING_OUT_TX; page += 1) {
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
    } catch (e) {
      if (extraQueries.length && isAppwriteQueryError(e)) throw e;
      break;
    }
    const docs = res.documents || [];
    for (const doc of docs) {
      const row = mapFinanceTxDoc(doc);
      if (!isPendingOutflowRow(row)) continue;
      mapped.push(row);
      if (mapped.length >= MAX_PENDING_OUT_TX) return mapped;
    }
    if (docs.length < 100) break;
    cursor = docs[docs.length - 1]?.$id;
    if (!cursor) break;
  }
  return mapped;
}

export async function listPendingOutflowTx(academyId) {
  try {
    return await collectPendingOutflows(academyId, [Query.equal('direction', 'out')]);
  } catch (e) {
    if (!isAppwriteQueryError(e)) throw e;
  }
  return collectPendingOutflows(academyId, []);
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
      if (isAppwriteQueryError(e)) return [];
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
