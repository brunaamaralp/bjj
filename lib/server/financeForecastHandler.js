/**
 * GET /api/finance/forecast?from=&to=&academy_id=
 * Cache em memória: 5 min por academy + período.
 */
import { Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, DB_ID, databases } from './academyAccess.js';
import { mapFinanceTxDoc, txDirection } from './financeTxFields.js';
import { expectedAmountForStudent } from '../../src/lib/paymentStatus.js';
import { dueDateInMonth, studentDueDay } from '../../src/lib/collectionOverdue.js';
import {
  buildWeekRanges,
  finalizeWeeks,
  pushForecastItem,
  projectRecurrenceOccurrences,
  roundMoney,
  sumForecastFlows,
  todayYmdLocal,
  formatYmd,
} from '../../src/lib/financeForecastCore.js';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';
const PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
  process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
  '';
const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';

const CACHE_TTL_MS = 5 * 60 * 1000;
const forecastCache = new Map();

function json(res, status, body) {
  res.status(status).json(body);
}

function cacheKey(academyId, from, to) {
  return `${academyId}|${from}|${to}`;
}

function getCached(key) {
  const hit = forecastCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    forecastCache.delete(key);
    return null;
  }
  return hit.data;
}

function setCached(key, data) {
  forecastCache.set(key, { at: Date.now(), data });
  if (forecastCache.size > 200) {
    const first = forecastCache.keys().next().value;
    if (first) forecastCache.delete(first);
  }
}

export function invalidateFinanceForecastCache(academyId) {
  if (!academyId) {
    forecastCache.clear();
    return;
  }
  const prefix = `${academyId}|`;
  for (const k of forecastCache.keys()) {
    if (k.startsWith(prefix)) forecastCache.delete(k);
  }
}

async function fetchAllPages(col, queries) {
  const PAGE = 100;
  let all = [];
  let cursor = null;
  for (let i = 0; i < 40; i += 1) {
    const q = [...queries, Query.limit(PAGE)];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, col, q);
    const batch = res.documents || [];
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    cursor = batch[batch.length - 1]?.$id;
    if (!cursor) break;
  }
  return all;
}

async function computeOpeningBalance(academyId, todayEndIso) {
  if (!FINANCIAL_TX_COL) return 0;
  const docs = await fetchAllPages(FINANCIAL_TX_COL, [
    Query.equal('academyId', academyId),
    Query.equal('status', ['settled']),
    Query.lessThanEqual('settledAt', todayEndIso),
  ]);

  let balance = 0;
  for (const doc of docs) {
    const row = mapFinanceTxDoc(doc);
    if (!row || String(row.status).toLowerCase() === 'cancelled') continue;
    const dir = txDirection(row);
    const gross = Math.abs(Number(row.gross) || 0);
    const net = Math.abs(Number(row.net) || gross);
    if (dir === 'out') balance -= gross;
    else balance += net;
  }
  return roundMoney(balance);
}

function paymentDueYmd(payment, student) {
  if (payment.due_date) return String(payment.due_date).slice(0, 10);
  const ref = String(payment.reference_month || '').trim();
  if (/^\d{4}-\d{2}$/.test(ref)) {
    const d = dueDateInMonth(ref, studentDueDay(student));
    return d ? formatYmd(d) : null;
  }
  return null;
}

function txDueYmd(doc, mapped) {
  if (doc.due_date) return String(doc.due_date).slice(0, 10);
  if (mapped.competence_month && /^\d{4}-\d{2}$/.test(mapped.competence_month)) {
    return `${mapped.competence_month}-28`;
  }
  if (doc.$createdAt) return String(doc.$createdAt).slice(0, 10);
  return todayYmdLocal();
}

function inDateRange(ymd, from, to) {
  return ymd && ymd >= from && ymd <= to;
}

function isFutureOrToday(ymd, today) {
  return ymd && ymd >= today;
}

async function loadStudentNames(academyId, leadIds) {
  const map = new Map();
  const ids = [...new Set(leadIds.filter(Boolean))];
  if (!STUDENTS_COL || !ids.length) return map;

  for (const id of ids) {
    try {
      const doc = await databases.getDocument(DB_ID, STUDENTS_COL, id);
      if (String(doc.academyId || '') !== String(academyId)) continue;
      map.set(id, String(doc.name || doc.nome || '').trim() || 'Aluno');
    } catch {
      void 0;
    }
  }
  return map;
}

async function listOpenPayments(academyId) {
  if (!PAYMENTS_COL) return [];
  const byId = new Map();
  for (const status of ['pending', 'awaiting']) {
    try {
      const docs = await fetchAllPages(PAYMENTS_COL, [
        Query.equal('academy_id', academyId),
        Query.equal('status', status),
      ]);
      for (const d of docs) byId.set(d.$id, d);
    } catch (e) {
      const msg = String(e?.message || '');
      if (!msg.includes('Unknown attribute')) throw e;
    }
  }
  return [...byId.values()];
}

async function listPendingFinancialTx(academyId) {
  if (!FINANCIAL_TX_COL) return [];
  try {
    return await fetchAllPages(FINANCIAL_TX_COL, [
      Query.equal('academyId', academyId),
      Query.equal('status', ['pending']),
    ]);
  } catch {
    return [];
  }
}

async function listRecurrenceTemplates(academyId) {
  if (!FINANCIAL_TX_COL) return [];
  try {
    return await fetchAllPages(FINANCIAL_TX_COL, [
      Query.equal('academyId', academyId),
      Query.equal('is_recurrence_template', true),
    ]);
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes('Unknown attribute')) return [];
    throw e;
  }
}

export async function buildFinanceForecast(academyId, fromYmd, toYmd, { financeConfig = {} } = {}) {
  const today = todayYmdLocal();
  const from = fromYmd || today;
  const to = toYmd || from;
  const weeks = buildWeekRanges(from, to);
  const todayEndIso = `${today}T23:59:59.999Z`;

  const opening_balance = await computeOpeningBalance(academyId, todayEndIso);

  const payments = await listOpenPayments(academyId);
  const leadIds = payments.map((p) => String(p.lead_id || ''));
  const studentNames = await loadStudentNames(academyId, leadIds);
  const studentsByLead = new Map();
  for (const lid of leadIds) {
    if (!lid || studentsByLead.has(lid)) continue;
    try {
      if (STUDENTS_COL) {
        const doc = await databases.getDocument(DB_ID, STUDENTS_COL, lid);
        studentsByLead.set(lid, doc);
      }
    } catch {
      studentsByLead.set(lid, null);
    }
  }

  for (const p of payments) {
    const st = String(p.status || '').toLowerCase();
    const leadId = String(p.lead_id || '');
    const student = studentsByLead.get(leadId) || null;
    const due = paymentDueYmd(p, student);
    if (!isFutureOrToday(due, today) || !inDateRange(due, from, to)) continue;

    const amount = roundMoney(expectedAmountForStudent(student, financeConfig, p));
    if (amount <= 0) continue;

    const name = studentNames.get(leadId) || 'Aluno';
    const plan = String(p.plan_name || student?.plan || 'Mensalidade').trim();

    pushForecastItem(weeks, {
      type: 'mensalidade',
      label: `${plan} — ${name}`,
      amount,
      due_date: due,
      student_name: name,
      lead_id: leadId || undefined,
      status: st === 'awaiting' ? 'confirmado' : 'esperado',
      _flow: 'in',
    });
  }

  const pendingTx = await listPendingFinancialTx(academyId);
  for (const doc of pendingTx) {
    const mapped = mapFinanceTxDoc(doc);
    if (!mapped) continue;
    const dir = txDirection(mapped);
    const due = txDueYmd(doc, mapped);
    if (!isFutureOrToday(due, today) || !inDateRange(due, from, to)) continue;

    const amount = roundMoney(Math.abs(Number(mapped.gross) || 0));
    if (amount <= 0) continue;

    const leadId = String(mapped.lead_id || '');
    pushForecastItem(weeks, {
      type: 'pendente',
      label: String(mapped.planName || mapped.category || mapped.note || 'Lançamento pendente').trim(),
      amount,
      due_date: due,
      student_name: leadId ? studentNames.get(leadId) : undefined,
      lead_id: leadId || undefined,
      status: 'esperado',
      _flow: dir === 'out' ? 'out' : 'in',
    });
  }

  const templates = await listRecurrenceTemplates(academyId);
  for (const doc of templates) {
    const mapped = mapFinanceTxDoc(doc);
    if (!mapped) continue;
    const dir = txDirection(mapped);
    const occurrences = projectRecurrenceOccurrences(
      {
        gross: mapped.gross,
        recurrence_day: doc.recurrence_day,
        label: mapped.planName || mapped.category,
        planName: mapped.planName,
        category: mapped.category,
        lead_id: mapped.lead_id,
        _flow: dir === 'out' ? 'out' : 'in',
      },
      from,
      to
    );
    for (const occ of occurrences) {
      if (!isFutureOrToday(occ.due_date, today)) continue;
      pushForecastItem(weeks, occ);
    }
  }

  finalizeWeeks(weeks);
  const { inflow, outflow } = sumForecastFlows(weeks);
  const closing_balance = roundMoney(opening_balance + inflow - outflow);

  const weeksOut = weeks.map((w) => ({
    week_start: w.week_start,
    week_end: w.week_end,
    expected_inflow: w.expected_inflow,
    expected_outflow: w.expected_outflow,
    net: w.net,
    items: w.items.map(({ _flow, ...rest }) => ({ ...rest, flow: _flow === 'out' ? 'out' : 'in' })),
  }));

  return {
    weeks: weeksOut,
    opening_balance,
    closing_balance,
    summary: {
      expected_inflow: inflow,
      expected_outflow: outflow,
      net: roundMoney(inflow - outflow),
    },
    from,
    to,
  };
}

export default async function financeForecastHandler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId, doc: academyDoc } = access;

  const bodyAid = String(req.query.academy_id || '').trim();
  if (bodyAid && bodyAid !== academyId) {
    return json(res, 403, { ok: false, error: 'forbidden' });
  }

  const from = String(req.query.from || '').trim().slice(0, 10);
  const to = String(req.query.to || '').trim().slice(0, 10);
  if (!from || !to) {
    return json(res, 400, { ok: false, error: 'from_to_required' });
  }

  const bustCache = String(req.query._ || req.query.refresh || '').trim();
  const key = cacheKey(academyId, from, to);
  if (!bustCache) {
    const cached = getCached(key);
    if (cached) {
      return json(res, 200, { ok: true, cached: true, ...cached });
    }
  }

  let financeConfig = {};
  try {
    const raw = academyDoc?.financeConfig;
    financeConfig = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
  } catch {
    financeConfig = {};
  }

  try {
    const data = await buildFinanceForecast(academyId, from, to, { financeConfig });
    setCached(key, data);
    return json(res, 200, { ok: true, cached: false, ...data });
  } catch (e) {
    console.error('[financeForecast]', e);
    return json(res, 500, { ok: false, error: 'forecast_failed' });
  }
}
