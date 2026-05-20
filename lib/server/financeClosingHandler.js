/**
 * GET /api/finance/closing?month=YYYY-MM — transações do mês (servidor) + pagamentos.
 * POST /api/finance/closing — registra cash_closing imutável (conferência).
 */
import { Query, ID, Permission, Role } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, ensureAcademyOwnerOrAdmin, DB_ID, databases } from './academyAccess.js';
import { mapFinanceTxDoc } from './financeTxFields.js';
import { monthDateRange, parseReferenceMonth } from '../../src/lib/monthlyClosing.js';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';
const PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
  process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
  '';
const CASH_CLOSING_COL =
  process.env.APPWRITE_CASH_CLOSING_COLLECTION_ID ||
  process.env.VITE_APPWRITE_CASH_CLOSING_COLLECTION_ID ||
  '';

const PAGE = 200;

function json(res, status, body) {
  res.status(status).json(body);
}

function isGridPayment(doc) {
  const cat = String(doc?.payment_category || 'plan').toLowerCase();
  return cat === 'plan' || cat === 'bundle' || !doc?.payment_category;
}

async function listFinancialTxForMonth(academyId, referenceMonth) {
  const { start, end } = monthDateRange(referenceMonth);
  if (!start || !end) return { transactions: [], pendingInMonth: 0 };

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
        const dateIso = d.settledAt || d.$createdAt;
        const dt = new Date(dateIso);
        if (dt < start || dt > end) continue;
        const mapped = mapFinanceTxDoc(d);
        if (mapped) items.push(mapped);
        if (String(d.status || '').toLowerCase() === 'pending') pendingInMonth += 1;
      }
      if (docs.length < PAGE) break;
      cursor = docs[docs.length - 1]?.$id;
      if (!cursor) break;
    }
  }

  await fetchBatch([Query.greaterThanEqual('settledAt', startIso), Query.lessThanEqual('settledAt', endIso)]);
  await fetchBatch([
    Query.equal('status', ['pending']),
    Query.greaterThanEqual('$createdAt', startIso),
    Query.lessThanEqual('$createdAt', endIso),
  ]);

  const byId = new Map();
  for (const t of items) byId.set(t.id, t);

  return { transactions: [...byId.values()], pendingInMonth };
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

async function getCashClosing(academyId, referenceMonth) {
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

export default async function financeClosingHandler(req, res) {
  const me = await ensureAuth(req, res);
  if (!me) return;

  if (req.method === 'GET') {
    const access = await ensureAcademyAccess(req, res, me);
    if (!access) return;
    const { academyId } = access;
    const month = parseReferenceMonth(String(req.query.month || req.query.reference_month || '').trim());
    if (!month) return json(res, 400, { ok: false, error: 'month_required' });

    try {
      const [payments, txResult, cashClosing] = await Promise.all([
        listPaymentsForMonth(academyId, month),
        FINANCIAL_TX_COL ? listFinancialTxForMonth(academyId, month) : { transactions: [], pendingInMonth: 0 },
        getCashClosing(academyId, month),
      ]);
      return json(res, 200, {
        ok: true,
        referenceMonth: month,
        payments,
        transactions: txResult.transactions,
        pendingInMonth: txResult.pendingInMonth,
        cashClosing: cashClosing
          ? {
              id: cashClosing.$id,
              closed_at: cashClosing.closed_at,
              closed_by: cashClosing.closed_by,
              snapshot_json: cashClosing.snapshot_json,
            }
          : null,
      });
    } catch (e) {
      console.error('[financeClosing GET]', e);
      return json(res, 500, { ok: false, error: 'load_failed' });
    }
  }

  if (req.method === 'POST') {
    const access = await ensureAcademyOwnerOrAdmin(req, res, me);
    if (!access) return;
    const { academyId } = access;
    if (!CASH_CLOSING_COL) return json(res, 503, { ok: false, error: 'cash_closing_not_configured' });

    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return json(res, 400, { ok: false, error: 'invalid_json' });
      }
    }

    const month = parseReferenceMonth(String(body.reference_month || body.month || '').trim());
    if (!month) return json(res, 400, { ok: false, error: 'month_required' });

    const existing = await getCashClosing(academyId, month);
    if (existing) {
      return json(res, 409, { ok: false, error: 'already_closed', cashClosing: { id: existing.$id } });
    }

    const snapshot = body.snapshot || body.totals || {};
    const now = new Date().toISOString();
    try {
      const doc = await databases.createDocument(
        DB_ID,
        CASH_CLOSING_COL,
        ID.unique(),
        {
          academy_id: academyId,
          reference_month: month,
          snapshot_json: typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot),
          closed_by: me.$id,
          closed_at: now,
        },
        [Permission.read(Role.users())]
      );
      return json(res, 200, { ok: true, cashClosing: { id: doc.$id, closed_at: now } });
    } catch (e) {
      console.error('[financeClosing POST]', e);
      return json(res, 500, { ok: false, error: 'create_failed' });
    }
  }

  return json(res, 405, { ok: false, error: 'method_not_allowed' });
}
