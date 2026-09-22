/**
 * Lembretes financeiros do hero da Recepção (contas a pagar + cobrança + renovação).
 */
import { addDaysYmd, todayYmdLocal } from './financeForecastCore.js';
import {
  getReceptionDueBucket,
  openAmountForStudent,
} from './collectionOverdue.js';
import { isStudentOnExemptPlan } from './planBilling.js';
import { isFreezeActive } from './planFreeze.js';
import {
  coverageEndMonth,
  formatReferenceMonthShort,
  compareReferenceMonths,
} from './bundleCoverage.js';
import { isBundleAnchorPayment } from './paymentCategories.js';

export const REMINDER_SECTION_LIMIT = 3;

/** @param {string} dueYmd @param {string} todayYmd */
export function mapPayableToReceptionBucket(dueYmd, todayYmd = todayYmdLocal()) {
  const due = String(dueYmd || '').slice(0, 10);
  const today = String(todayYmd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  if (due <= addDaysYmd(today, 7)) return 'week';
  return null;
}

function takeLimited(items, limit = REMINDER_SECTION_LIMIT) {
  const list = items || [];
  const overflow = Math.max(0, list.length - limit);
  return { items: list.slice(0, limit), overflow };
}

/**
 * @param {Array<object>} payableItems — itens do catálogo A pagar (podem ter amount)
 * @param {{ todayYmd?: string }} [opts]
 */
export function buildPayableReminders(payableItems, opts = {}) {
  const todayYmd = String(opts.todayYmd || todayYmdLocal()).slice(0, 10);
  const byBucket = { overdue: [], today: [], week: [] };

  for (const it of payableItems || []) {
    const due = String(it.due_date || '').slice(0, 10);
    const bucket =
      it.status === 'overdue'
        ? mapPayableToReceptionBucket(due, todayYmd) || 'overdue'
        : mapPayableToReceptionBucket(due, todayYmd);
    if (!bucket || !byBucket[bucket]) continue;
    byBucket[bucket].push({
      id: String(it.id || it.tx_id || due),
      kind: 'payable',
      label: String(it.vendor_label || it.planName || 'Despesa').trim() || 'Despesa',
      bucket,
      due_date: due,
      href: '/financeiro?tab=a-pagar',
    });
  }

  const order = ['overdue', 'today', 'week'];
  const out = [];
  for (const b of order) {
    const { items } = takeLimited(byBucket[b]);
    out.push(...items);
  }
  return out;
}

function leadIdOf(payment) {
  return String(payment?.lead_id || payment?.student_id || '').trim();
}

function studentIdOf(student) {
  return String(student?.id || student?.$id || '').trim();
}

/**
 * @param {{
 *   students: Array<object>,
 *   paymentsByLead: Record<string, object|null>,
 *   currentMonth: string,
 *   today?: Date,
 *   financeConfig?: object|null,
 * }} args
 */
export function buildStudentChargeReminders({
  students,
  paymentsByLead,
  currentMonth,
  today = new Date(),
  financeConfig = null,
}) {
  const rows = [];
  for (const student of students || []) {
    const id = studentIdOf(student);
    if (!id) continue;
    if (isFreezeActive(student)) continue;
    const payment = paymentsByLead?.[id] || null;
    if (isStudentOnExemptPlan(student, financeConfig, payment)) continue;

    const bucket = getReceptionDueBucket(student, payment, currentMonth, today, financeConfig);
    if (!bucket) continue;

    const amount = openAmountForStudent(student, payment, financeConfig);
    rows.push({
      id: `charge:${id}`,
      kind: 'charge',
      label: String(student.name || 'Aluno').trim() || 'Aluno',
      bucket,
      amount: Number(amount) || 0,
      studentId: id,
      href: `/student/${id}?tab=payments`,
    });
  }

  const priority = { overdue: 0, due_today: 1, due_week: 2 };
  rows.sort((a, b) => (priority[a.bucket] ?? 9) - (priority[b.bucket] ?? 9));
  return takeLimited(rows).items;
}

/** @param {string} ym YYYY-MM */
function addMonthsYm(ym, delta) {
  const s = String(ym || '').trim();
  if (!/^\d{4}-\d{2}$/.test(s)) return '';
  const [y0, m0] = s.split('-').map(Number);
  const d = new Date(y0, m0 - 1 + delta, 1, 12, 0, 0, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function paymentCoversMonth(payment, ym) {
  const st = String(payment?.status || '').toLowerCase();
  if (!['paid', 'covered', 'partial'].includes(st)) return false;
  return String(payment?.reference_month || '').slice(0, 7) === ym;
}

/**
 * @param {{
 *   payments: Array<object>,
 *   studentsById: Record<string, object>,
 *   todayYm: string,
 * }} args
 */
export function buildPackageRenewalReminders({ payments, studentsById, todayYm }) {
  const ym = String(todayYm || '').slice(0, 7);
  const list = payments || [];
  const rows = [];

  for (const p of list) {
    if (!isBundleAnchorPayment(p)) continue;
    const st = String(p.status || '').toLowerCase();
    if (st !== 'paid' && st !== 'covered') continue;
    if (String(p.covered_reason || '') === 'historical' && Number(p.amount || 0) === 0 && st === 'covered') {
      // cobertura histórica sem renovação comercial típica — ainda avisa se for âncora
    }

    const startYm = String(p.reference_month || '').slice(0, 7);
    const months = Number(p.bundle_months) || 0;
    if (!startYm || months < 2) continue;
    const endYm = coverageEndMonth(startYm, months);
    const prevYm = addMonthsYm(endYm, -1);
    if (ym !== endYm && ym !== prevYm) continue;

    const nextYm = addMonthsYm(endYm, 1);
    const leadId = leadIdOf(p);
    const alreadyRenewed = list.some(
      (x) => leadIdOf(x) === leadId && String(x.$id) !== String(p.$id) && paymentCoversMonth(x, nextYm)
    );
    if (alreadyRenewed) continue;

    const student = studentsById?.[leadId] || {};
    const amount =
      Number(p.amount || p.paid_amount || 0) ||
      Number(student.plan_price || student.planPrice || 0) ||
      0;

    rows.push({
      id: `renewal:${p.$id || p.id}`,
      kind: 'renewal',
      label: String(student.name || 'Aluno').trim() || 'Aluno',
      endYm,
      endLabel: formatReferenceMonthShort(endYm),
      amount,
      studentId: leadId,
      href: leadId ? `/student/${leadId}?tab=payments` : '/financeiro?tab=a-receber',
    });
  }

  rows.sort((a, b) => compareReferenceMonths(a.endYm, b.endYm));
  return takeLimited(rows).items;
}

function formatMoney(n) {
  try {
    return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${Number(n || 0).toFixed(2)}`;
  }
}

function chargeLineTitle(item) {
  const when =
    item.bucket === 'due_today'
      ? 'mensalidade hoje'
      : item.bucket === 'due_week'
        ? 'mensalidade esta semana'
        : 'mensalidade atrasada';
  return `${item.label} — ${when} · ${formatMoney(item.amount)}`;
}

function payableLineTitle(item) {
  if (item.bucket === 'today') return `Hoje: ${item.label}`;
  if (item.bucket === 'overdue') return `Atrasada: ${item.label}`;
  return `Esta semana: ${item.label}`;
}

function renewalLineTitle(item) {
  return `${item.label} — cobertura até ${item.endLabel || item.endYm} · ${formatMoney(item.amount)}`;
}

/**
 * Monta seções do banner (vazias omitidas).
 */
export function buildReceptionFinancialReminders({
  payableItems = [],
  students = [],
  payments = [],
  paymentsByLead = null,
  studentsById = null,
  todayYmd = todayYmdLocal(),
  currentMonth = String(todayYmd || '').slice(0, 7),
  today = new Date(),
  financeConfig = null,
} = {}) {
  const byLead =
    paymentsByLead ||
    Object.fromEntries(
      (payments || []).map((p) => [leadIdOf(p), p]).filter(([id]) => id)
    );

  const byStudent =
    studentsById ||
    Object.fromEntries(
      (students || []).map((s) => [studentIdOf(s), s]).filter(([id]) => id)
    );

  const payables = buildPayableReminders(payableItems, { todayYmd });
  const charges = buildStudentChargeReminders({
    students,
    paymentsByLead: byLead,
    currentMonth,
    today,
    financeConfig,
  });
  const renewals = buildPackageRenewalReminders({
    payments,
    studentsById: byStudent,
    todayYm: currentMonth,
  });

  const sections = [];
  if (payables.length) {
    sections.push({
      id: 'payables',
      title: 'Contas a pagar',
      items: payables.map((it) => ({ ...it, title: payableLineTitle(it) })),
    });
  }
  if (charges.length) {
    sections.push({
      id: 'charges',
      title: 'Cobrar alunos',
      items: charges.map((it) => ({ ...it, title: chargeLineTitle(it) })),
    });
  }
  if (renewals.length) {
    sections.push({
      id: 'renewals',
      title: 'Renovar pacote',
      items: renewals.map((it) => ({ ...it, title: renewalLineTitle(it) })),
    });
  }

  return { sections, empty: sections.length === 0 };
}

/** Projeção segura para API view=reception (sem valores). */
export function sanitizePayablesForReception(items, { todayYmd = todayYmdLocal() } = {}) {
  return (items || [])
    .map((it) => {
      const due = String(it.due_date || '').slice(0, 10);
      const bucket = mapPayableToReceptionBucket(due, todayYmd);
      if (!bucket) return null;
      return {
        id: String(it.id || it.tx_id || due),
        vendor_label: String(it.vendor_label || '').trim() || 'Despesa',
        due_date: due,
        bucket,
        status: bucket === 'overdue' ? 'overdue' : bucket === 'today' || bucket === 'week' ? 'due_soon' : it.status,
      };
    })
    .filter(Boolean);
}
