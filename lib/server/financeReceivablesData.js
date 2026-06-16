/**
 * Leituras compartilhadas para contas a receber e visão geral financeira.
 */
import { Query } from 'node-appwrite';
import { DB_ID, databases } from './academyAccess.js';
import { mapFinanceTxDoc, txDirection } from './financeTxFields.js';
import { listAcademyStudentsMapped } from './listAcademyStudents.js';

const PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
  process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
  '';
const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';
const SALES_COL = process.env.SALES_COL || process.env.VITE_APPWRITE_SALES_COLLECTION_ID || '';

export const MAX_PENDING_TX = 200;
export const MAX_DEFERRED_SALES = 100;
export const MAX_GRID_PAYMENTS_SCAN = 3000;

export function isGridPayment(doc) {
  const cat = String(doc?.payment_category || 'plan').toLowerCase();
  return cat === 'plan' || cat === 'bundle' || !doc?.payment_category;
}

export async function listPaymentsForMonth(academyId, referenceMonth) {
  if (!PAYMENTS_COL) return [];
  const list = await databases.listDocuments(DB_ID, PAYMENTS_COL, [
    Query.equal('academy_id', academyId),
    Query.equal('reference_month', referenceMonth),
    Query.limit(500),
    Query.orderDesc('$createdAt'),
  ]);
  return (list.documents || []).filter(isGridPayment);
}

/** Pagamentos de mensalidade da academia (janela opcional por reference_month). */
export async function listGridPaymentsForAcademy(academyId, { minReferenceMonth } = {}) {
  if (!PAYMENTS_COL) return [];
  const minYm = String(minReferenceMonth || '').trim().slice(0, 7);
  let cursor = null;
  const all = [];
  for (let page = 0; page < 40 && all.length < MAX_GRID_PAYMENTS_SCAN; page += 1) {
    const q = [
      Query.equal('academy_id', academyId),
      Query.orderDesc('$createdAt'),
      Query.limit(100),
    ];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, PAYMENTS_COL, q);
    const docs = (res.documents || []).filter(isGridPayment);
    for (const doc of docs) {
      const ym = String(doc.reference_month || '').trim().slice(0, 7);
      if (minYm && /^\d{4}-\d{2}$/.test(ym) && ym < minYm) continue;
      all.push(doc);
      if (all.length >= MAX_GRID_PAYMENTS_SCAN) break;
    }
    if (docs.length < 100 || all.length >= MAX_GRID_PAYMENTS_SCAN) break;
    cursor = docs[docs.length - 1]?.$id;
    if (!cursor) break;
  }
  return all;
}

export async function listPendingInflowTx(academyId) {
  if (!FINANCIAL_TX_COL) return [];
  let cursor = null;
  const mapped = [];
  for (let page = 0; page < 20 && mapped.length < MAX_PENDING_TX; page += 1) {
    const q = [
      Query.equal('academyId', academyId),
      Query.equal('status', ['pending']),
      Query.orderDesc('$createdAt'),
      Query.limit(100),
    ];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, q);
    const docs = res.documents || [];
    for (const doc of docs) {
      const row = mapFinanceTxDoc(doc);
      if (!row) continue;
      const dir = txDirection(row);
      const type = String(row.type || '').toLowerCase();
      if (dir === 'out' || type === 'expense') continue;
      mapped.push(row);
      if (mapped.length >= MAX_PENDING_TX) break;
    }
    if (docs.length < 100 || mapped.length >= MAX_PENDING_TX) break;
    cursor = docs[docs.length - 1]?.$id;
    if (!cursor) break;
  }
  return mapped;
}

export async function listDeferredSales(academyId) {
  if (!SALES_COL) return [];
  let docs = [];
  try {
    const res = await databases.listDocuments(DB_ID, SALES_COL, [
      Query.equal('academyId', academyId),
      Query.equal('status', ['pendente']),
      Query.orderDesc('$createdAt'),
      Query.limit(MAX_DEFERRED_SALES),
    ]);
    docs = res.documents || [];
  } catch {
    try {
      const res = await databases.listDocuments(DB_ID, SALES_COL, [
        Query.orderDesc('$createdAt'),
        Query.limit(MAX_DEFERRED_SALES * 2),
      ]);
      docs = (res.documents || []).filter((d) => {
        if (String(d.academyId || d.academy_id || '') !== String(academyId)) return false;
        const st = String(d.status || '').toLowerCase();
        return d.deferred === true || st === 'pendente';
      });
    } catch {
      return [];
    }
  }
  return docs.slice(0, MAX_DEFERRED_SALES);
}

/** Carrega alunos + pagamentos + pendências em paralelo (base compartilhada). */
export async function loadReceivablesInputs(academyId, referenceMonth) {
  const [students, payments, pendingTransactions, deferredSales] = await Promise.all([
    listAcademyStudentsMapped(academyId),
    listPaymentsForMonth(academyId, referenceMonth),
    listPendingInflowTx(academyId),
    listDeferredSales(academyId),
  ]);
  return { students, payments, pendingTransactions, deferredSales };
}
