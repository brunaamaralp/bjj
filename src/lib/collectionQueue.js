/**
 * Fila de cobrança acumulada (multi-mês) para a sub-aba Cobrança.
 */
import { isActiveStudent } from './studentStatus.js';
import { getPaymentRowStatus } from './collectionOverdue.js';
import { openMensalidadeAmount } from './receivablesAggregate.js';
import {
  parseCollectionRules,
  resolveCollectionStage,
  isCollectionSnoozed,
  readCollectionSettingsFromFinanceConfig,
} from './collectionRules.js';
import { shiftMonthYm } from './financeiroOverview.js';
import {
  buildPaidBundleCoveredMonthsByLead,
  isMonthCoveredByPaidBundle,
} from './bundleCoverage.js';

export const COLLECTION_QUEUE_LOOKBACK_MONTHS = 12;

function monthYmFromDate(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return shiftMonthYm(null, 0);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
}

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function ymdFromDate(d) {
  if (!d) return null;
  try {
    const x = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(x.getTime())) return null;
    return x.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function studentEnrollmentMonth(student) {
  const raw = String(
    student?.converted_at || student?.enrollmentDate || student?.createdAt || ''
  ).trim();
  const iso = raw.match(/^(\d{4}-\d{2})/);
  if (iso) return iso[1];
  const br = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}`;
  return null;
}

function listMonthsInclusive(fromYm, toYm, maxMonths = 24) {
  const from = String(fromYm || '').trim().slice(0, 7);
  const to = String(toYm || '').trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to) || from > to) return [];
  const months = [];
  let cur = from;
  while (cur <= to && months.length < maxMonths) {
    months.push(cur);
    cur = shiftMonthYm(cur, 1);
  }
  return months;
}

function mapPaymentDoc(p) {
  if (!p) return null;
  return {
    ...p,
    lead_id: String(p.lead_id || p.leadId || '').trim(),
    reference_month: String(p.reference_month || '').trim().slice(0, 7),
    status: String(p.status || '').toLowerCase(),
    $id: p.$id || p.id,
    id: p.$id || p.id,
  };
}

/** Índice lead|YYYY-MM → pagamento (prioriza settled sobre aberto). */
export function buildPaymentsByLeadMonth(payments = []) {
  const map = new Map();
  for (const raw of payments) {
    const p = mapPaymentDoc(raw);
    const lid = p.lead_id;
    const ym = p.reference_month;
    if (!lid || !/^\d{4}-\d{2}$/.test(ym)) continue;
    const key = `${lid}|${ym}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, p);
      continue;
    }
    const st = p.status;
    const existingSt = existing.status;
    const settled = new Set(['paid', 'covered', 'frozen']);
    if (settled.has(st)) map.set(key, p);
    else if (!settled.has(existingSt)) map.set(key, p);
  }
  return map;
}

function paymentFromMap(map, studentId, ym) {
  return map.get(`${String(studentId).trim()}|${ym}`) || null;
}

function buildOpenMonthEntry(student, payment, ym, financeConfig, today) {
  if (String(student?.freeze_status || student?.freezeStatus || '').trim() === 'active') {
    return null;
  }
  const amount = openMensalidadeAmount(student, payment, financeConfig);
  if (amount < 0.01) return null;

  const row = getPaymentRowStatus(student, payment, ym, today);
  if (row.status === 'frozen' || row.status === 'paid' || row.status === 'covered') return null;
  if (row.status !== 'pending' || row.daysOverdue < 1) return null;

  const dueDate =
    ymdFromDate(row.dueDate) ||
    (payment?.due_date ? String(payment.due_date).slice(0, 10) : null);

  return {
    referenceMonth: ym,
    amount: roundMoney(amount),
    daysOverdue: row.daysOverdue,
    dueDate,
    paymentId: payment?.$id || payment?.id || null,
  };
}

/**
 * @param {object} params
 * @returns {{ summary: object, rows: object[] }}
 */
export function buildCollectionQueue({
  students = [],
  payments = [],
  financeConfig = {},
  today = new Date(),
  lookbackMonths = COLLECTION_QUEUE_LOOKBACK_MONTHS,
} = {}) {
  const currentMonth = monthYmFromDate(today);
  const lookbackStart = shiftMonthYm(currentMonth, -(Math.max(1, lookbackMonths) - 1));
  const collectionRules = parseCollectionRules(
    readCollectionSettingsFromFinanceConfig(financeConfig).collectionRules
  );
  const payMap = buildPaymentsByLeadMonth(payments);
  const bundleCoveredByLead = buildPaidBundleCoveredMonthsByLead(payments);

  const active = students.filter((s) => isActiveStudent(s) && String(s.plan || '').trim());
  const rows = [];

  for (const student of active) {
    const studentId = String(student.id || student.$id || '').trim();
    if (!studentId) continue;

    const enrollYm = studentEnrollmentMonth(student);
    const scanStart =
      enrollYm && enrollYm > lookbackStart ? enrollYm : lookbackStart;
    const months = listMonthsInclusive(scanStart, currentMonth);

    const bundleCoveredMonths = bundleCoveredByLead.get(studentId);
    const openMonths = [];
    for (const ym of months) {
      if (isMonthCoveredByPaidBundle(ym, bundleCoveredMonths)) continue;
      const payment = paymentFromMap(payMap, studentId, ym);
      const entry = buildOpenMonthEntry(student, payment, ym, financeConfig, today);
      if (entry) openMonths.push(entry);
    }

    if (!openMonths.length) continue;

    openMonths.sort((a, b) => a.referenceMonth.localeCompare(b.referenceMonth));
    const oldestDaysOverdue = Math.max(...openMonths.map((m) => m.daysOverdue));
    const totalOpen = roundMoney(openMonths.reduce((sum, m) => sum + m.amount, 0));
    const stage = resolveCollectionStage(oldestDaysOverdue, collectionRules);

    rows.push({
      studentId,
      name: String(student.name || '').trim() || 'Aluno',
      phone: String(student.phone || '').trim(),
      plan: String(student.plan || '').trim(),
      totalOpen,
      oldestDaysOverdue,
      stage: stage
        ? { day: stage.day, label: stage.label, escalate: stage.escalate === true }
        : null,
      snoozed: isCollectionSnoozed(student, currentMonth),
      openMonths,
    });
  }

  rows.sort(
    (a, b) =>
      b.oldestDaysOverdue - a.oldestDaysOverdue ||
      b.totalOpen - a.totalOpen ||
      a.name.localeCompare(b.name, 'pt-BR')
  );

  const byStage = {};
  let totalOpenAll = 0;
  for (const row of rows) {
    totalOpenAll += row.totalOpen;
    const key = String(row.stage?.day ?? 'outros');
    byStage[key] = (byStage[key] || 0) + 1;
  }

  return {
    summary: {
      students: rows.length,
      totalOpen: roundMoney(totalOpenAll),
      byStage,
    },
    rows,
    currentMonth,
    collectionRules,
  };
}
