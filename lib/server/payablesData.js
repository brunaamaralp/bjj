/**
 * Leituras para contas a pagar (saídas pendentes + templates recorrentes).
 */
import { Query } from 'node-appwrite';
import { DB_ID, databases } from './academyAccess.js';
import { mapFinanceTxDoc, txDirection, isExpenseType } from './financeTxFields.js';
import { currentYmFinance } from '../../src/lib/financeForecastCore.js';

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
  return dir === 'out' || isExpenseType(type);
}

export const MAX_PENDING_OUT_TX = 300;
export const MAX_RECURRENCE_TEMPLATES = 100;
/** Instâncias settled/cancelled de recorrência — só para dedupe na fila. */
export const MAX_SETTLED_RECURRENCE_INSTANCES = 200;

function ymMonthsAgo(fromYm, monthsBack) {
  const m = String(fromYm || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1 - Math.max(0, monthsBack), 1, 12, 0, 0, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function isRecurrenceOutflowChild(row) {
  if (!row || row.is_recurrence_template === true) return false;
  if (!String(row.recurrence_origin_id || '').trim()) return false;
  const dir = txDirection(row);
  const type = String(row.type || '').toLowerCase();
  return dir === 'out' || isExpenseType(type);
}

async function collectPendingOutflows(academyId, extraQueries = []) {
  if (!FINANCIAL_TX_COL) return { rows: [], truncated: false };
  let cursor = null;
  const mapped = [];
  let truncated = false;
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
      if (mapped.length >= MAX_PENDING_OUT_TX) {
        truncated = docs.length >= 100 || page < 24;
        return { rows: mapped, truncated };
      }
    }
    if (docs.length < 100) break;
    cursor = docs[docs.length - 1]?.$id;
    if (!cursor) break;
  }
  return { rows: mapped, truncated };
}

export async function listPendingOutflowTx(academyId) {
  try {
    const { rows, truncated } = await collectPendingOutflows(academyId, [Query.equal('direction', 'out')]);
    return { rows, truncated };
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

async function listClosedStatusDocs(academyId, statuses, cursor) {
  const q = [
    Query.equal('academyId', academyId),
    Query.equal('status', statuses),
    Query.orderDesc('$updatedAt'),
    Query.limit(100),
  ];
  if (cursor) q.push(Query.cursorAfter(cursor));
  return databases.listDocuments(DB_ID, FINANCIAL_TX_COL, q);
}

/**
 * Filhos de template já liquidados/cancelados (não entram na fila, só cobrem competência).
 * Janela: competência >= ~2 meses atrás.
 */
export async function listSettledRecurrenceInstances(academyId, { minCompetenceMonth } = {}) {
  if (!FINANCIAL_TX_COL) return [];
  const minYm =
    String(minCompetenceMonth || '').trim() || ymMonthsAgo(currentYmFinance(), 2);

  let cursor = null;
  const mapped = [];
  let statusList = ['settled', 'cancelled'];

  for (let page = 0; page < 20 && mapped.length < MAX_SETTLED_RECURRENCE_INSTANCES; page += 1) {
    let res;
    try {
      res = await listClosedStatusDocs(academyId, statusList, cursor);
    } catch (e) {
      if (!isAppwriteQueryError(e) || statusList.length === 1) {
        if (isAppwriteQueryError(e)) return mapped;
        throw e;
      }
      statusList = ['settled'];
      try {
        res = await listClosedStatusDocs(academyId, statusList, cursor);
      } catch (e2) {
        if (isAppwriteQueryError(e2)) return mapped;
        throw e2;
      }
    }
    const docs = res.documents || [];
    for (const doc of docs) {
      const row = mapFinanceTxDoc(doc);
      if (!isRecurrenceOutflowChild(row)) continue;
      const cm = String(row.competence_month || '').trim() || String(row.due_date || '').slice(0, 7);
      if (minYm && cm && cm < minYm) continue;
      mapped.push(row);
      if (mapped.length >= MAX_SETTLED_RECURRENCE_INSTANCES) return mapped;
    }
    if (docs.length < 100) break;
    cursor = docs[docs.length - 1]?.$id;
    if (!cursor) break;
  }
  return mapped;
}

export async function loadPayablesInputs(academyId) {
  const [pendingResult, recurrenceTemplates, settledRecurrenceInstances] = await Promise.all([
    listPendingOutflowTx(academyId),
    listOutflowRecurrenceTemplates(academyId),
    listSettledRecurrenceInstances(academyId),
  ]);
  const pendingTransactions = pendingResult.rows || [];
  return {
    pendingTransactions,
    recurrenceTemplates,
    settledRecurrenceInstances,
    pendingTruncated: Boolean(pendingResult.truncated),
  };
}
