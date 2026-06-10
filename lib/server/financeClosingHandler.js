/**
 * GET /api/finance/closing?month=YYYY-MM&regime=cash|competence
 */
import { ID, Permission, Role } from 'node-appwrite';
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
import {
  getCashClosing,
  listFinancialTxForMonth,
  loadClosingGetPayload,
} from './financeClosingData.js';
import { listPaymentsForMonth } from './financeReceivablesData.js';
import {
  parseReferenceMonth,
  buildClosingRows,
  computeClosingTotals,
} from '../../src/lib/monthlyClosing.js';
import { FINANCE_REGIME } from '../../src/lib/financeCompetence.js';
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
      const payload = await loadClosingGetPayload(academyId, month, regime);
      return json(res, 200, { ok: true, ...payload });
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
      return json(res, 500, { ok: false, error: 'create_failed' });
    }
  }

  return json(res, 405, { ok: false, error: 'method_not_allowed' });
}
