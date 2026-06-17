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
import { expectedAmountForStudent, GRID_STATUS_LABELS } from '../../src/lib/paymentStatus.js';
import { filterActiveStudents } from '../../src/lib/studentStatus.js';
import { listAcademyStudentsMapped } from './listAcademyStudents.js';
import { aggregatePeriodSummary } from './financeTxAggregate.js';
import { getPaymentRowStatus } from '../../src/lib/collectionOverdue.js';
import { suggestStudentsByName } from '../nlStudentMatch.js';
import {
  enrichLeadsForFollowupQuery,
  queryCoolingFollowupsRows,
  queryAttendedNotContactedYesterdayRows,
} from './followupAcademyQuery.js';
import { loadPayablesInputs } from './payablesData.js';
import { buildPayablesSnapshot } from '../../src/lib/payablesAggregate.js';
import { todayYmdLocal, addDaysYmd } from '../../src/lib/financeForecastCore.js';

const ATTENDANCE_COL =
  process.env.VITE_APPWRITE_ATTENDANCE_COL_ID ||
  process.env.APPWRITE_ATTENDANCE_COLLECTION_ID ||
  '';
const TASKS_COL =
  process.env.APPWRITE_TASKS_COLLECTION_ID ||
  process.env.VITE_APPWRITE_TASKS_COLLECTION_ID ||
  '';

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
  const en = String(student?.enrollmentDate || student?.enrollment_date || '').trim().slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(en)) return en;
  const conv = String(student?.convertedAt || student?.converted_at || '').trim().slice(0, 7);
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

function queryMissedExperimental(leads, periodOpts) {
  if (!LEADS_COL) throw new Error('Coleção de leads não configurada.');
  const { start, end, label } = resolvePeriodBounds(periodOpts);

  const rows = leads
    .filter((l) => {
      const missed =
        String(l.status || '').trim() === LEAD_STATUS.MISSED ||
        String(l.pipelineStage || '').trim() === LEAD_STATUS.MISSED;
      if (!missed) return false;
      const when = l.missedAt || l.statusChangedAt || l.scheduledDate || l.createdAt;
      return dateInRange(when, start, end);
    })
    .map((l) => {
      const when = l.missedAt || l.statusChangedAt || l.scheduledDate || '';
      return {
        id: l.id,
        linkKind: 'lead',
        name: String(l.name || '—').trim() || '—',
        phone: String(l.phone || '').trim(),
        missedAt: String(when).slice(0, 10),
        line: `${l.name}${when ? ` · ${formatDateBr(when)}` : ''}`,
      };
    })
    .sort((a, b) => String(b.missedAt).localeCompare(String(a.missedAt)));

  return buildListResponse({
    queryType: 'missed_experimental',
    label: `que faltaram à experimental ${label}`,
    rows,
    referenceMonth: parseReferenceMonth(periodOpts.referenceMonth) || '',
  });
}

function queryLostLeads(leads, periodOpts) {
  if (!LEADS_COL) throw new Error('Coleção de leads não configurada.');
  const { start, end, label } = resolvePeriodBounds(periodOpts);

  const rows = leads
    .filter((l) => {
      const lost =
        String(l.status || '').trim() === LEAD_STATUS.LOST ||
        String(l.pipelineStage || '').trim() === LEAD_STATUS.LOST;
      if (!lost) return false;
      const when = l.lostAt || l.statusChangedAt || l.createdAt;
      return dateInRange(when, start, end);
    })
    .map((l) => {
      const when = l.lostAt || l.statusChangedAt || '';
      const reason = String(l.lostReason || '').trim();
      return {
        id: l.id,
        linkKind: 'lead',
        name: String(l.name || '—').trim() || '—',
        lostReason: reason || '—',
        lostAt: String(when).slice(0, 10),
        line: `${l.name}${reason ? ` · ${reason}` : ''}${when ? ` (${formatDateBr(when)})` : ''}`,
      };
    })
    .sort((a, b) => String(b.lostAt).localeCompare(String(a.lostAt)));

  return buildListResponse({
    queryType: 'lost_leads',
    label: `de leads perdidos ${label}`,
    rows,
    referenceMonth: parseReferenceMonth(periodOpts.referenceMonth) || '',
  });
}

function normalizeStageToken(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function leadMatchesPipelineStage(lead, stageFilter) {
  const raw = String(stageFilter || '').trim();
  if (!raw) return true;
  const token = normalizeStageToken(raw);
  const stage = normalizeStageToken(lead.pipelineStage);
  const status = normalizeStageToken(lead.status);
  if (stage === token || status === token) return true;
  if (stage.includes(token) || token.includes(stage)) return true;
  if (status.includes(token) || token.includes(status)) return true;
  return false;
}

function queryPipelineStage(leads, stageFilter) {
  if (!LEADS_COL) throw new Error('Coleção de leads não configurada.');
  const stageLabel = String(stageFilter || '').trim() || 'etapa';

  const rows = leads
    .filter(isFunnelLead)
    .filter((l) => leadMatchesPipelineStage(l, stageFilter))
    .map((l) => ({
      id: l.id,
      linkKind: 'lead',
      name: String(l.name || '—').trim() || '—',
      pipelineStage: String(l.pipelineStage || l.status || '—').trim(),
      status: String(l.status || '—').trim(),
      line: `${l.name} · ${l.pipelineStage || l.status || '—'}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  return buildListResponse({
    queryType: 'pipeline_stage',
    label: `na etapa «${stageLabel}»`,
    rows,
    referenceMonth: '',
  });
}

async function queryFinanceSummary(databases, academyId, referenceMonth) {
  const month = parseReferenceMonth(referenceMonth);
  if (!month) throw new Error('Mês de referência inválido.');

  const { start, end } = monthDateRange(month);
  if (!start || !end) throw new Error('Período inválido.');

  const from = start.toISOString().slice(0, 10);
  const to = end.toISOString().slice(0, 10);

  const { listFinancialTxForPeriod } = await import('./financeTxQuery.js');

  const docs = await listFinancialTxForPeriod(academyId, { from, to });
  const {
    settledIn,
    settledOut,
    periodBalance: balance,
    pendingIn,
    pendingOut,
    countSettled,
    countPending,
  } = aggregatePeriodSummary(docs);

  const label = formatMonthLabel(month);
  const resposta = [
    `Resumo financeiro de ${label} (caixa, liquidado):`,
    `• Entradas: ${formatMoney(settledIn)} (${countSettled} lançamento(s) liquidado(s) no período)`,
    `• Saídas: ${formatMoney(settledOut)}`,
    `• Saldo do período: ${formatMoney(balance)}`,
    pendingIn + pendingOut > 0.009
      ? `• Pendente: +${formatMoney(pendingIn)} / -${formatMoney(pendingOut)} (${countPending} lançamento(s))`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    resposta,
    rows: [],
    count: countSettled + countPending,
    query_type: 'finance_summary',
    reference_month: month,
    summary: {
      settledIn,
      settledOut,
      periodBalance: balance,
      pendingIn,
      pendingOut,
      countSettled,
      countPending,
    },
  };
}

function todayYmdLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function paymentForStudent(payments, studentId) {
  const sid = String(studentId || '').trim();
  return (payments || []).find((p) => String(p.lead_id || '').trim() === sid) || null;
}

function queryStudentPaymentStatus(students, payments, financeConfig, referenceMonth, studentNameQuery) {
  const month = parseReferenceMonth(referenceMonth);
  if (!month) throw new Error('Mês de referência inválido.');
  const q = String(studentNameQuery || '').trim();
  if (!q) throw new Error('Informe o nome do aluno na pergunta.');

  const active = filterActiveStudents(students);
  const matches = suggestStudentsByName(q, active, 5);
  if (!matches.length) {
    return {
      resposta: `Não encontrei aluno com nome parecido com "${q}".`,
      rows: [],
      count: 0,
      query_type: 'student_payment_status',
      reference_month: month,
    };
  }
  if (matches.length > 1 && matches[0].score - (matches[1]?.score || 0) < 8) {
    const names = matches.map((m) => m.name).join(', ');
    return {
      resposta: `Há mais de um aluno parecido: ${names}. Seja mais específico.`,
      rows: matches.map((m) => ({
        id: m.id,
        linkKind: 'student',
        name: m.name,
        line: 'Possível correspondência',
      })),
      count: matches.length,
      query_type: 'student_payment_status',
      reference_month: month,
    };
  }

  const student = active.find((s) => String(s.id) === matches[0].id) || null;
  if (!student) throw new Error('Aluno não encontrado.');

  const payment = paymentForStudent(payments, student.id);
  const rowStatus = getPaymentRowStatus(student, payment, month);
  const label = GRID_STATUS_LABELS[rowStatus.status] || rowStatus.status;
  const expected = expectedAmountForStudent(student, financeConfig, payment);
  const paidAmount = payment && String(payment.status || '').toLowerCase() === 'paid' ? Number(payment.amount) : 0;
  const name = String(student.name || '—').trim();

  let detail = label;
  if (rowStatus.status === 'paid' || rowStatus.status === 'covered') {
    detail = `${label}${paidAmount > 0 ? ` · ${formatMoney(paidAmount)}` : ''}`;
  } else if (expected > 0) {
    detail = `${label} · esperado ${formatMoney(expected)}`;
  }
  if (rowStatus.daysOverdue > 0) {
    detail += ` · ${rowStatus.daysOverdue} dia(s) de atraso`;
  }

  const inDay = ['paid', 'covered', 'frozen', 'soon', 'none'].includes(rowStatus.status);
  const resposta = `${name} — ${formatMonthLabel(month)}: ${detail}${inDay && rowStatus.status !== 'pending' ? ' (em dia ou sem cobrança registrada)' : ''}`;

  return {
    resposta,
    rows: [
      {
        id: student.id,
        linkKind: 'student',
        name,
        line: detail,
        status: rowStatus.status,
        reference_month: month,
      },
    ],
    count: 1,
    query_type: 'student_payment_status',
    reference_month: month,
  };
}

async function listCheckinsToday(databases, academyId) {
  if (!ATTENDANCE_COL || !DB_ID || !academyId) return [];
  const today = todayYmdLocal();
  const startIso = `${today}T00:00:00.000Z`;
  const endIso = `${today}T23:59:59.999Z`;
  try {
    const res = await databases.listDocuments(DB_ID, ATTENDANCE_COL, [
      Query.equal('academy_id', academyId),
      Query.greaterThanEqual('checked_in_at', startIso),
      Query.lessThanEqual('checked_in_at', endIso),
      Query.limit(200),
      Query.orderDesc('checked_in_at'),
    ]);
    return res.documents || [];
  } catch {
    try {
      const res = await databases.listDocuments(DB_ID, ATTENDANCE_COL, [
        Query.equal('academy_id', academyId),
        Query.limit(300),
      ]);
      return (res.documents || []).filter((doc) => {
        const ts = String(doc.checked_in_at || doc.$createdAt || '').slice(0, 10);
        return ts === today;
      });
    } catch {
      return [];
    }
  }
}

async function queryCheckinsToday(databases, academyId, students) {
  if (!ATTENDANCE_COL) {
    return {
      resposta: 'Presenças não configuradas para esta academia.',
      rows: [],
      count: 0,
      query_type: 'checkins_today',
    };
  }
  const docs = await listCheckinsToday(databases, academyId);
  const nameById = new Map(
    (students || []).map((s) => [String(s.id || '').trim(), String(s.name || '').trim()])
  );
  const seen = new Set();
  const rows = [];
  for (const doc of docs) {
    const sid = String(doc.student_id || doc.lead_id || '').trim();
    if (!sid || seen.has(sid)) continue;
    seen.add(sid);
    const name = nameById.get(sid) || String(doc.student_name || doc.lead_name || 'Aluno').trim();
    const at = String(doc.checked_in_at || doc.$createdAt || '').slice(11, 16);
    rows.push({
      id: sid,
      linkKind: 'student',
      name,
      line: at ? `Check-in às ${at}` : 'Check-in hoje',
      checked_in_at: String(doc.checked_in_at || doc.$createdAt || '').slice(0, 19),
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  if (!rows.length) {
    return {
      resposta: 'Ninguém fez check-in hoje ainda.',
      rows: [],
      count: 0,
      query_type: 'checkins_today',
    };
  }

  return buildListResponse({
    queryType: 'checkins_today',
    label: 'com check-in hoje',
    rows,
  });
}

async function listOverdueTasks(databases, academyId) {
  if (!TASKS_COL || !DB_ID || !academyId) return [];
  const today = todayYmdLocal();
  let docs = [];
  try {
    const res = await databases.listDocuments(DB_ID, TASKS_COL, [
      Query.equal('academy_id', academyId),
      Query.equal('status', ['pending']),
      Query.limit(200),
      Query.orderDesc('$createdAt'),
    ]);
    docs = res.documents || [];
  } catch {
    return [];
  }
  return docs.filter((t) => {
    const due = String(t.due_date || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return false;
    return due < today;
  });
}

async function queryOverdueTasks(databases, academyId) {
  if (!TASKS_COL) {
    return {
      resposta: 'Tarefas não configuradas para esta academia.',
      rows: [],
      count: 0,
      query_type: 'overdue_tasks',
    };
  }
  const docs = await listOverdueTasks(databases, academyId);
  const rows = docs.map((t) => ({
    id: String(t.lead_id || t.$id || '').trim() || String(t.$id),
    linkKind: t.lead_id ? 'lead' : undefined,
    name: String(t.title || 'Tarefa').trim(),
    line: `${String(t.lead_name || '').trim() || '—'} · venc. ${formatDateBr(String(t.due_date || '').slice(0, 10))}`,
    due_date: String(t.due_date || '').slice(0, 10),
  }));

  if (!rows.length) {
    return {
      resposta: 'Nenhuma tarefa atrasada no momento.',
      rows: [],
      count: 0,
      query_type: 'overdue_tasks',
    };
  }

  return buildListResponse({
    queryType: 'overdue_tasks',
    label: 'atrasadas',
    rows,
  });
}

async function queryPayablesDue(databases, academyId, { days = 7 } = {}) {
  const today = todayYmdLocal();
  const to = addDaysYmd(today, Math.max(1, Number(days) || 7));
  const { pendingTransactions, recurrenceTemplates } = await loadPayablesInputs(academyId);
  const snapshot = buildPayablesSnapshot({
    pendingTransactions,
    recurrenceTemplates,
    fromYmd: today,
    toYmd: to,
    today,
    section: 'visao',
  });
  const items = (snapshot.items || []).filter((it) => {
    const due = String(it.due_date || '').slice(0, 10);
    return due >= today && due <= to;
  });
  const rows = items.map((it) => ({
    id: it.id,
    name: it.vendor_label || 'Despesa',
    line: `${it.category || '—'} · venc. ${formatDateBr(String(it.due_date || '').slice(0, 10))} · R$ ${Number(it.amount || 0).toFixed(2)}`,
    due_date: String(it.due_date || '').slice(0, 10),
    amount: it.amount,
  }));

  if (!rows.length) {
    return {
      resposta: `Nenhuma conta a pagar nos próximos ${days} dias.`,
      rows: [],
      count: 0,
      query_type: 'payables_due',
    };
  }

  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  return {
    resposta: `${rows.length} conta(s) a pagar até ${formatDateBr(to)} · total R$ ${total.toFixed(2)}.`,
    rows,
    count: rows.length,
    query_type: 'payables_due',
  };
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

  if (queryType === 'finance_summary') {
    return queryFinanceSummary(databases, academyId, referenceMonth);
  }

  if (queryType === 'checkins_today') {
    const students = await listAcademyStudentsMapped(academyId);
    return queryCheckinsToday(databases, academyId, students);
  }

  if (queryType === 'overdue_tasks') {
    return queryOverdueTasks(databases, academyId);
  }

  if (queryType === 'payables_due' || queryType === 'payables_this_week') {
    if (opts.isOwnerOrAdmin !== true) {
      return {
        resposta: 'Apenas titular ou administrador pode consultar contas a pagar.',
        rows: [],
        count: 0,
        query_type: queryType,
      };
    }
    const days = queryType === 'payables_this_week' ? 7 : Number(opts.days) || 7;
    return queryPayablesDue(databases, academyId, { days });
  }

  if (queryType === 'cooling_followups' || queryType === 'attended_not_contacted_yesterday') {
    const leads = await listAcademyLeads(databases, academyId);
    let academySettings = null;
    if (ACADEMIES_COL) {
      try {
        const acad = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        academySettings = acad?.settings;
      } catch {
        void 0;
      }
    }
    const enriched = await enrichLeadsForFollowupQuery(databases, academyId, leads, academySettings);
    if (queryType === 'cooling_followups') {
      const rows = queryCoolingFollowupsRows(enriched);
      return buildListResponse({
        queryType,
        label: 'esfriando no retorno pós-aula',
        rows,
      });
    }
    const rows = queryAttendedNotContactedYesterdayRows(enriched);
    return buildListResponse({
      queryType,
      label: 'que compareceram ontem sem retorno no dia seguinte',
      rows,
    });
  }

  const funnelQueries = new Set([
    'new_leads',
    'attended_experimental',
    'scheduled_experimental',
    'missed_experimental',
    'lost_leads',
    'pipeline_stage',
  ]);

  if (funnelQueries.has(queryType)) {
    const leads = await listAcademyLeads(databases, academyId);
    if (queryType === 'new_leads') return queryNewLeads(leads, periodOpts);
    if (queryType === 'attended_experimental') return queryAttendedExperimental(leads, periodOpts);
    if (queryType === 'scheduled_experimental') return queryScheduledExperimental(leads, periodOpts);
    if (queryType === 'missed_experimental') return queryMissedExperimental(leads, periodOpts);
    if (queryType === 'lost_leads') return queryLostLeads(leads, periodOpts);
    if (queryType === 'pipeline_stage') {
      const stage = String(opts.pipelineStage || opts.pipeline_stage || '').trim();
      if (!stage) throw new Error('Informe a etapa do funil na pergunta (ex.: aguardando decisão).');
      return queryPipelineStage(leads, stage);
    }
  }

  if (!PEOPLE_COL) throw new Error('Coleção de alunos não configurada.');

  const [students, financeConfig, payments] = await Promise.all([
    listAcademyStudentsMapped(academyId),
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

  if (queryType === 'student_payment_status') {
    const studentName = String(opts.studentName || opts.student_name || '').trim();
    return queryStudentPaymentStatus(students, payments, financeConfig, referenceMonth, studentName);
  }

  throw new Error(`Tipo de consulta não suportado: ${queryType || '(vazio)'}`);
}

export function inferAcademyQueryType(text) {
  const t = String(text || '').trim().toLowerCase();
  if (/contas?\s+a\s+pagar|pagar\s+(esta\s+semana|nos?\s+pr[oó]ximos?\s+\d+\s+dias?)|despesas?\s+vencendo/.test(t)) {
    return 'payables_this_week';
  }
  if (/fatur|quanto\s+entrou|entradas?\s+do\s+m[eê]s|resumo\s+(do\s+)?caixa|saldo\s+do\s+m[eê]s/.test(t)) {
    return 'finance_summary';
  }
  if (/lead(s)?\s+(novo|nova)|novos?\s+lead|cadastr.*lead|entraram\s+no\s+funil/.test(t)) {
    return 'new_leads';
  }
  if (/esfriando|esfria|retornos?\s+(cr[ií]ticos?|urgentes?)|quem\s+est[aá]\s+esfriando/.test(t)) {
    return 'cooling_followups';
  }
  if (
    /compareceu.*ontem.*(sem|n[aã]o).*(contat|retorn)|sem\s+retorno.*ontem|n[aã]o\s+(foi\s+)?contatad.*ontem|ontem\s+sem\s+retorno/.test(
      t
    )
  ) {
    return 'attended_not_contacted_yesterday';
  }
  if (/faltou|faltaram|n[aã]o\s+compareceu.*experimental|nao\s+compareceu.*experimental/.test(t)) {
    return 'missed_experimental';
  }
  if (/compareceu|compareceram|presen[aç]a.*experimental|foi\s+na\s+experimental/.test(t)) {
    return 'attended_experimental';
  }
  if (/agendad.*experimental|experimental\s+agendad|v[aã]o\s+fazer\s+experimental/.test(t)) {
    return 'scheduled_experimental';
  }
  if (/perdemos|perdidos?|n[aã]o\s+fechou|leads?\s+perdidos?/.test(t)) {
    return 'lost_leads';
  }
  if (/tarefas?\s+atrasad|tarefas?\s+vencid|tarefa\s+pendente.*atras/.test(t)) {
    return 'overdue_tasks';
  }
  if (/quem\s+veio\s+hoje|check-?in\s+hoje|presen[cç]a\s+hoje|vieram\s+hoje/.test(t)) {
    return 'checkins_today';
  }
  if (/est[aá]\s+em\s+dia|pagou\s+a\s+mensalidade|mensalidade\s+do\s+|mensalidade\s+da\s+|status.*pagamento/.test(t)) {
    return 'student_payment_status';
  }
  if (/etapa|pipeline|aguardando\s+decis[aã]o|quem\s+est[aá]\s+em/.test(t)) {
    return 'pipeline_stage';
  }
  if (/matricul|matrícula|matricula|novo aluno|entraram/.test(t)) return 'enrolled_in_month';
  if (/n[aã]o pagou|nao pagou|inadimpl|pendente|em aberto|devendo|falta pagar/.test(t)) {
    return 'unpaid_tuition';
  }
  if (/atrasad.*mensal|mensal.*atrasad|inadimplente/.test(t)) {
    return 'overdue_tuition';
  }
  return null;
}
