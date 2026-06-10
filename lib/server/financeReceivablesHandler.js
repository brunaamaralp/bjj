/**
 * GET /api/finance?route=receivables&month=YYYY-MM
 * Agrega contas a receber: mensalidades, lançamentos pendentes e vendas a prazo.
 */
import { Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, ACADEMIES_COL, DB_ID, databases } from './academyAccess.js';
import { mergeFinanceConfigFromAcademyDoc } from '../../src/lib/financeConfigStorage.js';
import { parseReferenceMonth } from '../../src/lib/monthlyClosing.js';
import { buildReceivablesSnapshot } from '../../src/lib/receivablesAggregate.js';
import { mapFinanceTxDoc, txDirection } from './financeTxFields.js';
import { listAcademyStudentsMapped } from './listAcademyStudents.js';

const PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
  process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
  '';
const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';
const SALES_COL = process.env.SALES_COL || process.env.VITE_APPWRITE_SALES_COLLECTION_ID || '';

const MAX_PENDING_TX = 200;
const MAX_DEFERRED_SALES = 100;

function json(res, status, body) {
  res.status(status).json(body);
}

function isGridPayment(doc) {
  const cat = String(doc?.payment_category || 'plan').toLowerCase();
  return cat === 'plan' || cat === 'bundle' || !doc?.payment_category;
}

async function listPaymentsForMonth(academyId, referenceMonth) {
  if (!PAYMENTS_COL) return [];
  const list = await databases.listDocuments(DB_ID, PAYMENTS_COL, [
    Query.equal('academy_id', academyId),
    Query.equal('reference_month', referenceMonth),
    Query.limit(500),
    Query.orderDesc('$createdAt'),
  ]);
  return (list.documents || []).filter(isGridPayment);
}

async function listPendingInflowTx(academyId) {
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

async function listDeferredSales(academyId) {
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

export default async function financeReceivablesHandler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId, doc: academyDoc } = access;

  const month = parseReferenceMonth(String(req.query.month || req.query.reference_month || '').trim());
  if (!month) return json(res, 400, { ok: false, error: 'month_required' });

  try {
    let financeConfig = { bankAccounts: [], plans: [] };
    if (ACADEMIES_COL && academyDoc) {
      financeConfig = mergeFinanceConfigFromAcademyDoc(academyDoc);
    } else if (ACADEMIES_COL) {
      try {
        const academy = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        financeConfig = mergeFinanceConfigFromAcademyDoc(academy);
      } catch {
        /* defaults */
      }
    }

    const [students, payments, pendingTransactions, deferredSales] = await Promise.all([
      listAcademyStudentsMapped(academyId),
      listPaymentsForMonth(academyId, month),
      listPendingInflowTx(academyId),
      listDeferredSales(academyId),
    ]);

    const snapshot = buildReceivablesSnapshot({
      students,
      payments,
      financeConfig,
      referenceMonth: month,
      pendingTransactions,
      deferredSales,
    });

    return json(res, 200, {
      ok: true,
      referenceMonth: month,
      ...snapshot,
    });
  } catch (e) {
    console.error(JSON.stringify({
      event: 'finance_receivables_error',
      academyId,
      month,
      error: e?.message || String(e),
    }));
    return json(res, 500, { ok: false, error: 'receivables_failed' });
  }
}
