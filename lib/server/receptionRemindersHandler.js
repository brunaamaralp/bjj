/**
 * GET /api/finance?route=reception-reminders
 * Lembretes do hero da Recepção (contas sem valor; alunos com valor).
 */
import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';
import { loadPayablesInputs } from './payablesData.js';
import { buildPayablesCatalog, selectPayablesItems } from '../../src/lib/payablesAggregate.js';
import { todayYmdLocal, addDaysYmd } from '../../src/lib/financeForecastCore.js';
import { listPaymentsForMonth } from './financeReceivablesData.js';
import { listAcademyStudentsMappedCached } from './academyStudentsCache.js';
import { Query } from 'node-appwrite';
import { DB_ID, databases } from './academyAccess.js';
import {
  buildReceptionFinancialReminders,
  sanitizePayablesForReception,
} from '../../src/lib/receptionFinancialReminders.js';
import { isBundleAnchorPayment } from '../../src/lib/paymentCategories.js';
import { cacheKey, getCached, setCached } from './reportsLightCache.js';

const PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
  process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
  '';
const CACHE_MS = Number(process.env.RECEPTION_REMINDERS_CACHE_MS || 45_000);

function json(res, status, body) {
  res.status(status).json(body);
}

async function listPaidBundleAnchors(academyId) {
  if (!PAYMENTS_COL || !DB_ID) return [];
  const out = [];
  let cursor = null;
  for (let page = 0; page < 10 && out.length < 200; page += 1) {
    const q = [
      Query.equal('academy_id', academyId),
      Query.equal('payment_category', 'bundle'),
      Query.equal('status', 'paid'),
      Query.orderDesc('$createdAt'),
      Query.limit(100),
    ];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, PAYMENTS_COL, q);
    const docs = res.documents || [];
    for (const doc of docs) {
      if (isBundleAnchorPayment(doc)) out.push(doc);
    }
    if (docs.length < 100) break;
    cursor = docs[docs.length - 1]?.$id;
    if (!cursor) break;
  }
  return out;
}

export default async function receptionRemindersHandler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  const todayYmd = todayYmdLocal();
  const currentMonth = todayYmd.slice(0, 7);
  const bypass = ['1', 'true', 'yes'].includes(String(req.query.refresh || '').trim().toLowerCase());
  const key = cacheKey(['reception-reminders', academyId, todayYmd]);

  try {
    if (!bypass) {
      const hit = getCached(key);
      if (hit) return json(res, 200, hit);
    }

    const from = addDaysYmd(todayYmd, -60);
    const to = addDaysYmd(todayYmd, 7);

    const [{ pendingTransactions, recurrenceTemplates }, monthPayments, anchors, students] =
      await Promise.all([
        loadPayablesInputs(academyId),
        listPaymentsForMonth(academyId, currentMonth),
        listPaidBundleAnchors(academyId),
        listAcademyStudentsMappedCached(academyId),
      ]);

    const catalog = buildPayablesCatalog({
      pendingTransactions,
      recurrenceTemplates,
      fromYmd: from,
      toYmd: to,
      today: todayYmd,
    });

    const upcoming = selectPayablesItems(catalog, 'visao');
    const overdue = selectPayablesItems(catalog, 'vencidas');
    const payableMerged = [...overdue, ...upcoming];
    const payableItems = sanitizePayablesForReception(payableMerged, { todayYmd });

    const paymentDocs = [...(monthPayments.rows || []), ...anchors];
    const seen = new Set();
    const payments = [];
    for (const p of paymentDocs) {
      const id = String(p.$id || p.id || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      payments.push(p);
    }

    const { filterActiveStudents } = await import('../../src/lib/studentStatus.js');
    const activeStudents = filterActiveStudents(students || []);

    const paymentsByLead = {};
    for (const p of monthPayments.rows || []) {
      const lid = String(p.lead_id || p.student_id || '').trim();
      if (lid) paymentsByLead[lid] = p;
    }

    const built = buildReceptionFinancialReminders({
      payableItems,
      students: activeStudents,
      payments,
      paymentsByLead,
      todayYmd,
      currentMonth,
      today: new Date(`${todayYmd}T12:00:00`),
      financeConfig: null,
    });

    const body = {
      ok: true,
      today: todayYmd,
      sections: built.sections,
      empty: built.empty,
    };
    setCached(key, body, CACHE_MS);
    return json(res, 200, body);
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'reception_reminders_error',
        academyId,
        error: e?.message || String(e),
      })
    );
    return json(res, 500, { ok: false, error: 'reception_reminders_failed' });
  }
}
