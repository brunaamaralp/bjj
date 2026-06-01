/**
 * Consultas read-only da academia (matrículas, mensalidades, funil) para NL / assistente.
 */
import { Query } from 'node-appwrite';
import {
  DB_ID,
  STUDENTS_COL,
  LEADS_COL,
  STUDENT_PAYMENTS_COL,
} from './appwriteCollections.js';
import { mapAppwriteDocToStudent } from '../../src/lib/mapAppwriteStudentDoc.js';
import { mapAppwriteDocToLead } from '../../src/lib/mapAppwriteLeadDoc.js';
import { LEAD_STATUS } from '../../src/lib/leadStatus.js';
import { buildClosingRows, parseReferenceMonth, monthDateRange } from '../../src/lib/monthlyClosing.js';
import { expectedAmountForStudent } from '../../src/lib/paymentStatus.js';
import { filterActiveStudents } from '../../src/lib/studentStatus.js';

const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

const PEOPLE_COL = STUDENTS_COL || LEADS_COL;
const LEAD_STATUS_SET = new Set(Object.values(LEAD_STATUS));

function parseFinanceConfig(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw || {};
  } catch {
    return {};
  }
}

function formatMonthLabel(ym) {
  if (!ym) return '—';
  try {
    const cap = new Date(`${ym}-02`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return cap.replace(/^\w/, (c) => c.toUpperCase());
  } catch {
    return ym;
  }
}

function formatMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  try {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${v.toFixed(2)}`.replace('.', ',');
  }
}

function formatDateBr(ymd) {
  const s = String(ymd || '').slice(0, 10);
  const p = s.split('-');
  if (p.length !== 3) return s || '—';
  return `${p[2]}/${p[1]}/${p[0]}`;
}

function parseYmd(s) {
  const raw = String(s || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateInRange(iso, start, end) {
  if (!iso || !start || !end) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
}

function weekBounds(refDate = new Date()) {
  const d = new Date(refDate);
  const day = d.getDay();
  const start = new Date(d);
  start.setDate(d.getDate() - day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function resolvePeriodBounds(opts = {}) {
  const fromYmd = parseYmd(opts.periodFrom);
  const toYmd = parseYmd(opts.periodTo);
  if (fromYmd && toYmd) {
    const end = new Date(toYmd);
    end.setHours(23, 59, 59, 999);
    return { start: fromYmd, end, label: `${formatDateBr(fromYmd)} a ${formatDateBr(toYmd)}` };
  }

  const month = parseReferenceMonth(opts.referenceMonth);
  if (month || String(opts.period || '').toLowerCase() === 'month') {
    const ym = month || new Date().toISOString().slice(0, 7);
    const { start, end } = monthDateRange(ym);
    if (!start || !end) throw new Error('Período inválido.');
    return { start, end, label: formatMonthLabel(ym) };
  }

  const { start, end } = weekBounds();
  return { start, end, label: 'esta semana' };
}

async function listAllDocuments(databases, col, queries) {
  const PAGE = 100;
  let all = [];
  let cursor = null;
  for (let guard = 0; guard < 30; guard += 1) {
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

async function listAcademyStudents(databases, academyId) {
  if (!PEOPLE_COL) return [];
  const docs = await listAllDocuments(databases, PEOPLE_COL, [Query.equal('academyId', academyId)]);
  return docs.map(mapAppwriteDocToStudent).filter((s) => s && s.id);
}

async function listAcademyLeads(databases, academyId) {
  if (!LEADS_COL) return [];
  const docs = await listAllDocuments(databases, LEADS_COL, [Query.equal('academyId', academyId)]);
  return docs.map((d) => mapAppwriteDocToLead(d, LEAD_STATUS_SET)).filter((l) => l && l.id);
}

async function listPaymentsForMonth(databases, academyId, referenceMonth) {
  if (!STUDENT_PAYMENTS_COL) return [];
  return listAllDocuments(databases, STUDENT_PAYMENTS_COL, [
    Query.equal('academy_id', academyId),
    Query.equal('reference_month', referenceMonth),
  ]);
}

async function loadFinanceConfig(databases, academyId) {
  if (!ACADEMIES_COL || !academyId) return {};
  try {
    const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
    return parseFinanceConfig(doc.settings || doc.finance_config);
  } catch {
    return {};
  }
}

function isFunnelLead(lead) {
  if (String(lead?.contact_type || '').trim() === 'student') return false;
  if (String(lead?.status || '').trim() === LEAD_STATUS.CONVERTED) return false;
  return true;
}

function buildListResponse({ queryType, label, rows, referenceMonth = '' }) {
  if (!rows.length) {
    return {
      resposta: `Nenhum resultado encontrado ${label}.`,
      rows: [],
      count: 0,
      query_type: queryType,
      reference_month: referenceMonth,
    };
  }

  const lines = rows.slice(0, 40).map((r) => `• ${r.line || r.name}`);
  const tail = rows.length > 40 ? `\n… e mais ${rows.length - 40} registro(s).` : '';

  return {
    resposta: `${rows.length} resultado(s) ${label}:\n${lines.join('\n')}${tail}`,
    rows: rows.slice(0, 100).map(({ line, ...rest }) => rest),
    count: rows.length,
    query_type: queryType,
    reference_month: referenceMonth,
  };
}

function enrollmentMonth(student) {
  const en = String(student?.enrollmentDate || '').trim().slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(en)) return en;
  const conv = String(student?.convertedAt || student?.createdAt || '').trim().slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(conv)) return conv;
  return '';
}

function queryEnrolledInMonth(students, referenceMonth) {
  const month = parseReferenceMonth(referenceMonth);
  if (!month) throw new Error('Mês de referência inválido.');
  const active = filterActiveStudents(students);
  const rows = active
    .filter((s) => enrollmentMonth(s) === month)
    .map((s) => ({
      id: s.id,
      linkKind: 'student',
      name: String(s.name || '—').trim() || '—',
      plan: String(s.plan || '—').trim() || '—',
      phone: String(s.phone || '').trim(),
      enrollmentDate: String(s.enrollmentDate || s.convertedAt || '').slice(0, 10),
      line: `${String(s.name || '—').trim()}${s.plan ? ` · ${s.plan}` : ''}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  return buildListResponse({
    queryType: 'enrolled_in_month',
    label: `em ${formatMonthLabel(month)}`,
    rows,
    referenceMonth: month,
  });
}

function queryUnpaidTuition(students, payments, financeConfig, referenceMonth) {
  const month = parseReferenceMonth(referenceMonth);
  if (!month) throw new Error('Mês de referência inválido.');

  const active = filterActiveStudents(students).filter((s) => String(s.plan || '').trim());
  const leadById = new Map(active.map((s) => [String(s.id), s]));

  const closingRows = buildClosingRows({
    payments,
    transactions: [],
    leadById,
    financeConfig,
    referenceMonth: month,
  });

  const unpaid = closingRows.filter((r) => r.situation === 'pendente' || r.situation === 'parcial');
  const rows = unpaid
    .map((r) => {
      const pend = formatMoney(r.pending);
      const sit = r.situation === 'parcial' ? 'parcial' : 'pendente';
      return {
        id: r.leadId,
        linkKind: 'student',
        name: r.name,
        plan: r.description || '—',
        pending: r.pending,
        situation: r.situation,
        line: `${r.name} — ${pend} (${sit}) · ${r.description || 'Mensalidade'}`,
      };
    })
    .sort((a, b) => b.pending - a.pending || a.name.localeCompare(b.name, 'pt-BR'));

  if (!rows.length) {
    return {
      resposta: `Todos os alunos com plano estão em dia em ${formatMonthLabel(month)} (ou sem valor pendente).`,
      rows: [],
      count: 0,
      query_type: 'unpaid_tuition',
      reference_month: month,
    };
  }

  return buildListResponse({
    queryType: 'unpaid_tuition',
    label: `com mensalidade em aberto em ${formatMonthLabel(month)}`,
    rows,
    referenceMonth: month,
  });
}

function queryOverdueTuition(students, paymentsByMonth, financeConfig, referenceMonth) {
  const month = parseReferenceMonth(referenceMonth) || new Date().toISOString().slice(0, 7);
  const active = filterActiveStudents(students).filter((s) => String(s.plan || '').trim());
  const rows = [];

  for (const student of active) {
    const payment = paymentsByMonth.get(String(student.id)) || null;
    const st = String(payment?.status || '').toLowerCase();
    if (st === 'paid' || st === 'covered' || st === 'frozen') continue;

    const expected = expectedAmountForStudent(student, financeConfig, payment);
    if (!(expected > 0.009)) continue;

    const pending =
      st === 'partial' ? Math.max(0, expected - Number(payment?.amount || 0)) : expected;

    if (pending < 0.009) continue;

    rows.push({
      id: student.id,
      linkKind: 'student',
      name: String(student.name || '—').trim() || '—',
      plan: String(student.plan || payment?.plan_name || 'Mensalidade').trim(),
      pending,
      line: `${student.name} — ${formatMoney(pending)} · ${student.plan || 'Mensalidade'}`,
    });
  }

  rows.sort((a, b) => b.pending - a.pending || a.name.localeCompare(b.name, 'pt-BR'));

  return buildListResponse({
    queryType: 'overdue_tuition',
    label: `inadimplentes em ${formatMonthLabel(month)}`,
    rows,
    referenceMonth: month,
  });
}

function queryNewLeads(leads, periodOpts) {
  if (!LEADS_COL) throw new Error('Coleção de leads não configurada.');
  const { start, end, label } = resolvePeriodBounds(periodOpts);

  const rows = leads
    .filter(isFunnelLead)
    .filter((l) => dateInRange(l.createdAt, start, end))
    .map((l) => ({
      id: l.id,
      linkKind: 'lead',
      name: String(l.name || '—').trim() || '—',
      origin: String(l.origin || '—').trim() || '—',
      status: String(l.status || '—').trim(),
      createdAt: String(l.createdAt || '').slice(0, 10),
      line: `${l.name}${l.origin ? ` · ${l.origin}` : ''} (${formatDateBr(l.createdAt)})`,
    }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  return buildListResponse({
    queryType: 'new_leads',
    label: `de leads novos em ${label}`,
    rows,
    referenceMonth: parseReferenceMonth(periodOpts.referenceMonth) || '',
  });
}

function queryAttendedExperimental(leads, periodOpts) {
  if (!LEADS_COL) throw new Error('Coleção de leads não configurada.');
  const { start, end, label } = resolvePeriodBounds(periodOpts);

  const rows = leads
    .filter((l) => {
      const attended =
        String(l.status || '').trim() === LEAD_STATUS.COMPLETED || Boolean(l.attendedAt);
      if (!attended) return false;
      const when = l.attendedAt || l.statusChangedAt || l.scheduledDate || l.createdAt;
      return dateInRange(when, start, end);
    })
    .map((l) => {
      const when = l.attendedAt || l.statusChangedAt || l.scheduledDate || '';
      return {
        id: l.id,
        linkKind: 'lead',
        name: String(l.name || '—').trim() || '—',
        phone: String(l.phone || '').trim(),
        attendedAt: String(when).slice(0, 10),
        line: `${l.name}${when ? ` · ${formatDateBr(when)}` : ''}`,
      };
    })
    .sort((a, b) => String(b.attendedAt).localeCompare(String(a.attendedAt)));

  return buildListResponse({
    queryType: 'attended_experimental',
    label: `que compareceram à experimental ${label}`,
    rows,
    referenceMonth: parseReferenceMonth(periodOpts.referenceMonth) || '',
  });
}

function queryScheduledExperimental(leads, periodOpts) {
  if (!LEADS_COL) throw new Error('Coleção de leads não configurada.');
  const { start, end, label } = resolvePeriodBounds(periodOpts);

  const rows = leads
    .filter((l) => {
      if (!isFunnelLead(l)) return false;
      const scheduled =
        String(l.status || '').trim() === LEAD_STATUS.SCHEDULED ||
        String(l.pipelineStage || '').trim() === 'Aula experimental';
      if (!scheduled) return false;
      const when = l.scheduledDate || l.createdAt;
      return dateInRange(when, start, end);
    })
    .map((l) => ({
      id: l.id,
      linkKind: 'lead',
      name: String(l.name || '—').trim() || '—',
      phone: String(l.phone || '').trim(),
      scheduledDate: String(l.scheduledDate || '').slice(0, 10),
      scheduledTime: String(l.scheduledTime || '').trim(),
      line: `${l.name} · ${formatDateBr(l.scheduledDate)}${l.scheduledTime ? ` ${l.scheduledTime}` : ''}`,
    }))
    .sort((a, b) => String(a.scheduledDate).localeCompare(String(b.scheduledDate)));

  return buildListResponse({
    queryType: 'scheduled_experimental',
    label: `com experimental agendada ${label}`,
    rows,
    referenceMonth: parseReferenceMonth(periodOpts.referenceMonth) || '',
  });
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {{ academyId: string, queryType: string, referenceMonth?: string, period?: string, periodFrom?: string, periodTo?: string }} opts
 */
export async function answerAcademyQuery(databases, opts = {}) {
  const academyId = String(opts.academyId || '').trim();
  const queryType = String(opts.queryType || '').trim();
  const referenceMonth =
    parseReferenceMonth(opts.referenceMonth) || new Date().toISOString().slice(0, 7);
  const periodOpts = {
    referenceMonth: opts.referenceMonth || referenceMonth,
    period: opts.period,
    periodFrom: opts.periodFrom,
    periodTo: opts.periodTo,
  };

  if (!academyId) throw new Error('Academia não informada.');

  const funnelQueries = new Set([
    'new_leads',
    'attended_experimental',
    'scheduled_experimental',
  ]);

  if (funnelQueries.has(queryType)) {
    const leads = await listAcademyLeads(databases, academyId);
    if (queryType === 'new_leads') return queryNewLeads(leads, periodOpts);
    if (queryType === 'attended_experimental') return queryAttendedExperimental(leads, periodOpts);
    if (queryType === 'scheduled_experimental') return queryScheduledExperimental(leads, periodOpts);
  }

  if (!PEOPLE_COL) throw new Error('Coleção de alunos não configurada.');

  const [students, financeConfig, payments] = await Promise.all([
    listAcademyStudents(databases, academyId),
    loadFinanceConfig(databases, academyId),
    listPaymentsForMonth(databases, academyId, referenceMonth),
  ]);

  if (queryType === 'enrolled_in_month' || queryType === 'new_enrollments') {
    return queryEnrolledInMonth(students, referenceMonth);
  }

  if (queryType === 'unpaid_tuition' || queryType === 'pending_payments') {
    return queryUnpaidTuition(students, payments, financeConfig, referenceMonth);
  }

  if (queryType === 'overdue_tuition' || queryType === 'defaulters') {
    const payMap = new Map();
    for (const p of payments) {
      const lid = String(p.lead_id || '').trim();
      if (lid && !payMap.has(lid)) payMap.set(lid, p);
    }
    return queryOverdueTuition(students, payMap, financeConfig, referenceMonth);
  }

  throw new Error(`Tipo de consulta não suportado: ${queryType || '(vazio)'}`);
}

export function inferAcademyQueryType(text) {
  const t = String(text || '').trim().toLowerCase();
  if (/lead(s)?\s+(novo|nova)|novos?\s+lead|cadastr.*lead|entraram\s+no\s+funil/.test(t)) {
    return 'new_leads';
  }
  if (/compareceu|compareceram|presen[aç]a.*experimental|foi\s+na\s+experimental/.test(t)) {
    return 'attended_experimental';
  }
  if (/agendad.*experimental|experimental\s+agendad|v[aã]o\s+fazer\s+experimental/.test(t)) {
    return 'scheduled_experimental';
  }
  if (/matricul|matrícula|matricula|novo aluno|entraram/.test(t)) return 'enrolled_in_month';
  if (/n[aã]o pagou|nao pagou|inadimpl|atrasad|pendente|em aberto|devendo|falta pagar/.test(t)) {
    return 'unpaid_tuition';
  }
  return null;
}
