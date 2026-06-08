/**
 * GET /api/finance/closing?month=YYYY-MM&regime=cash|competence
 */
import { Query, ID, Permission, Role } from 'node-appwrite';
import {
  ensureAuth,
  ensureAcademyAccess,
  ensureAcademyOwnerOrAdmin,
  ACADEMIES_COL,
  DB_ID,
  databases,
} from './academyAccess.js';
import { mergeFinanceConfigFromAcademyDoc } from '../../src/lib/financeConfigStorage.js';
import { filterActiveStudents } from '../../src/lib/studentStatus.js';
import { academyStudentsLeadById } from './listAcademyStudents.js';
import { mapFinanceTxDoc } from './financeTxFields.js';
import {
  monthDateRange,
  parseReferenceMonth,
  dateInReferenceMonth,
  buildClosingRows,
  computeClosingTotals,
} from '../../src/lib/monthlyClosing.js';
import { FINANCE_REGIME, effectiveCompetenceMonth } from '../../src/lib/financeCompetence.js';
import { roundMoney } from '../money.js';

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

if (!FINANCIAL_TX_COL) {
  console.warn('[financeClosing] FINANCIAL_TX_COL não configurado — transações financeiras estarão vazias');
}

const PAGE = 200;
const CLOSING_SNAPSHOT_TOLERANCE = 0.02;

function json(res, status, body) {
  res.status(status).json(body);
}

function round2(n) {
  return roundMoney(n);
}

export function snapshotTotalsMismatch(serverTotals, clientTotals, tolerance = CLOSING_SNAPSHOT_TOLERANCE) {
  const totals = clientTotals?.totals || clientTotals;
  if (!totals || typeof totals !== 'object') {
    return { key: 'totals', server: null, client: null };
  }
  const keys = ['expected', 'received', 'pending'];
  for (const key of keys) {
    if (totals[key] == null) continue;
    const server = round2(serverTotals[key]);
    const client = round2(totals[key]);
    if (Math.abs(server - client) > tolerance) {
      return { key, server, client };
    }
  }
  return null;
}

function isGridPayment(doc) {
  const cat = String(doc?.payment_category || 'plan').toLowerCase();
  return cat === 'plan' || cat === 'bundle' || !doc?.payment_category;
}

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

async function listFinancialTxForMonth(academyId, referenceMonth, regime = FINANCE_REGIME.CASH) {
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
        if (!txBelongsToClosingMonth(d, referenceMonth, regime)) continue;
        const mapped = mapFinanceTxDoc(d);
        if (mapped) {
          items.push({
            ...mapped,
            competence_month: d.competence_month || '',
            competenceFallback: regime === FINANCE_REGIME.COMPETENCE && !String(d.competence_month || '').trim(),
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
    await fetchBatch([Query.greaterThanEqual('settledAt', startIso), Query.lessThanEqual('settledAt', endIso)]);
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
    const regimeRaw = String(req.query.regime || FINANCE_REGIME.CASH).toLowerCase();
    const regime =
      regimeRaw === FINANCE_REGIME.COMPETENCE ? FINANCE_REGIME.COMPETENCE : FINANCE_REGIME.CASH;

    try {
      const [payments, txResult, cashClosing] = await Promise.all([
        listPaymentsForMonth(academyId, month),
        FINANCIAL_TX_COL
          ? listFinancialTxForMonth(academyId, month, regime)
          : { transactions: [], pendingInMonth: 0 },
        getCashClosing(academyId, month),
      ]);
      return json(res, 200, {
        ok: true,
        referenceMonth: month,
        regime,
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
      console.error(JSON.stringify({
        event: 'finance_closing_get_error',
        academyId,
        month,
        regime,
        FINANCIAL_TX_COL: FINANCIAL_TX_COL ? 'set' : 'MISSING',
        PAYMENTS_COL: PAYMENTS_COL ? 'set' : 'MISSING',
        CASH_CLOSING_COL: CASH_CLOSING_COL ? 'set' : 'MISSING',
        error: e?.message || String(e),
        stack: e?.stack?.slice(0, 600),
      }));
      return json(res, 500, { ok: false, error: 'load_failed', detail: e?.message });
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

    const regimeRaw = String(body.regime || FINANCE_REGIME.CASH).toLowerCase();
    const regime =
      regimeRaw === FINANCE_REGIME.COMPETENCE ? FINANCE_REGIME.COMPETENCE : FINANCE_REGIME.CASH;

    const existing = await getCashClosing(academyId, month);
    if (existing) {
      return json(res, 409, { ok: false, error: 'already_closed', cashClosing: { id: existing.$id } });
    }

    const snapshot = body.snapshot || body.totals || {};
    const clientTotals = snapshot?.totals || snapshot;

    if (FINANCIAL_TX_COL) {
      let financeConfig = {};
      if (ACADEMIES_COL) {
        try {
          const academyDoc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
          financeConfig = mergeFinanceConfigFromAcademyDoc(academyDoc);
        } catch {
          financeConfig = {};
        }
      }

      const leadByIdRaw = await academyStudentsLeadById(academyId);
      const leadById = new Map(
        filterActiveStudents([...leadByIdRaw.values()]).map((s) => [String(s.id), s])
      );

      const [payments, txResult] = await Promise.all([
        listPaymentsForMonth(academyId, month),
        listFinancialTxForMonth(academyId, month, regime),
      ]);
      const { rows } = buildClosingRows({
        payments,
        transactions: txResult.transactions,
        leadById,
        financeConfig,
        referenceMonth: month,
        regime,
      });
      const serverTotals = computeClosingTotals(rows);
      const mismatch = snapshotTotalsMismatch(serverTotals, clientTotals);
      if (mismatch) {
        return json(res, 409, {
          ok: false,
          error: 'snapshot_mismatch',
          field: mismatch.key,
          server: mismatch.server,
          client: mismatch.client,
        });
      }
    }
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
      console.error(JSON.stringify({
        event: 'finance_closing_post_error',
        academyId,
        month,
        error: e?.message || String(e),
        stack: e?.stack?.slice(0, 600),
      }));
      return json(res, 500, { ok: false, error: 'create_failed', detail: e?.message });
    }
  }

  return json(res, 405, { ok: false, error: 'method_not_allowed' });
}
