/**
 * Leituras compartilhadas para contas a receber e visão geral financeira.
 */
import { Query } from 'node-appwrite';
import { DB_ID, databases } from './academyAccess.js';
import { mapFinanceTxDoc, txDirection } from './financeTxFields.js';
import { listAcademyStudentsMappedCached } from './academyStudentsCache.js';

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
export const MAX_PAYMENTS_PER_MONTH = 500;

export function isGridPayment(doc) {
  const cat = String(doc?.payment_category || 'plan').toLowerCase();
  return cat === 'plan' || cat === 'bundle' || !doc?.payment_category;
}

export async function listPaymentsForMonth(academyId, referenceMonth) {
  if (!PAYMENTS_COL) return { rows: [], truncated: false };
  const list = await databases.listDocuments(DB_ID, PAYMENTS_COL, [
    Query.equal('academy_id', academyId),
    Query.equal('reference_month', referenceMonth),
    Query.limit(MAX_PAYMENTS_PER_MONTH),
    Query.orderDesc('$createdAt'),
  ]);
  const rows = (list.documents || []).filter(isGridPayment);
  const truncated = (list.documents || []).length >= MAX_PAYMENTS_PER_MONTH;
  return { rows, truncated };
}

/** Pagamentos de mensalidade da academia (janela opcional por reference_month). */
export async function listGridPaymentsForAcademy(academyId, { minReferenceMonth } = {}) {
  if (!PAYMENTS_COL) return { rows: [], truncated: false };
  const minYm = String(minReferenceMonth || '').trim().slice(0, 7);
  let cursor = null;
  const all = [];
  let truncated = false;
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
      if (all.length >= MAX_GRID_PAYMENTS_SCAN) {
        truncated = true;
        break;
      }
    }
    if (truncated || docs.length < 100) break;
    cursor = docs[docs.length - 1]?.$id;
    if (!cursor) break;
  }
  return { rows: all, truncated };
}

export async function listPendingInflowTx(academyId) {
  if (!FINANCIAL_TX_COL) return { rows: [], truncated: false };
  let cursor = null;
  const mapped = [];
  let truncated = false;
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
      if (mapped.length >= MAX_PENDING_TX) {
        truncated = docs.length >= 100 || page < 19;
        return { rows: mapped, truncated };
      }
    }
    if (docs.length < 100) break;
    cursor = docs[docs.length - 1]?.$id;
    if (!cursor) break;
  }
  return { rows: mapped, truncated };
}

export async function listDeferredSales(academyId) {
  if (!SALES_COL) return { rows: [], truncated: false };
  let docs = [];
  let truncated = false;
  try {
    const res = await databases.listDocuments(DB_ID, SALES_COL, [
      Query.equal('academyId', academyId),
      Query.equal('status', ['pendente']),
      Query.orderDesc('$createdAt'),
      Query.limit(MAX_DEFERRED_SALES),
    ]);
    docs = res.documents || [];
    truncated = docs.length >= MAX_DEFERRED_SALES;
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
      truncated = docs.length > MAX_DEFERRED_SALES;
    } catch {
      return { rows: [], truncated: false };
    }
  }
  return { rows: docs.slice(0, MAX_DEFERRED_SALES), truncated };
}

/** Carrega alunos + pagamentos + pendências em paralelo (base compartilhada). */
export async function loadReceivablesInputs(academyId, referenceMonth) {
  const ym = String(referenceMonth || '').trim().slice(0, 7);
  // Janela para âncoras de pacote anual/histórico que cobrem o mês (até 24 meses atrás).
  let minCoverageYm = '';
  if (/^\d{4}-\d{2}$/.test(ym)) {
    const d = new Date(`${ym}-02T12:00:00`);
    d.setMonth(d.getMonth() - 23);
    minCoverageYm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  const [students, paymentsResult, coverageResult, pendingResult, deferredResult] = await Promise.all([
    listAcademyStudentsMappedCached(academyId),
    listPaymentsForMonth(academyId, referenceMonth),
    listGridPaymentsForAcademy(academyId, { minReferenceMonth: minCoverageYm || undefined }),
    listPendingInflowTx(academyId),
    listDeferredSales(academyId),
  ]);
  return {
    students,
    payments: paymentsResult.rows,
    coveragePayments: coverageResult.rows,
    pendingTransactions: pendingResult.rows,
    deferredSales: deferredResult.rows,
    dataWarnings: {
      pendingInflowTruncated: Boolean(pendingResult.truncated),
      deferredSalesTruncated: Boolean(deferredResult.truncated),
      paymentsMonthTruncated: Boolean(paymentsResult.truncated),
      coveragePaymentsTruncated: Boolean(coverageResult.truncated),
    },
  };
}
