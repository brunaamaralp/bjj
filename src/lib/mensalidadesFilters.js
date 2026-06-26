import { getReceptionDueBucket } from './collectionOverdue.js';
import { canonicalTurmaGroupLabel } from './academyTurmas.js';
import {
  canonicalStudentPlanFilterLabel,
  effectiveStudentPlan,
} from './financeStudentRoster.js';

export function studentTurma(student, configuredTurmas = []) {
  const raw = String(
    student?.turma || student?.className || student?.class_name || student?.classId || ''
  ).trim();
  if (!raw) return '';
  return canonicalTurmaGroupLabel(raw, configuredTurmas);
}

export const MENSALIDADES_FILTER_ALL = 'all';

/** Filtros de prioridade do dia (recepção) — distintos dos status da grade. */
export const MENSALIDADES_RECEPTION_FILTER_IDS = [
  'due_today',
  'due_week',
  'overdue',
  'paid_in_month',
];

const URL_FILTRO_KEYS = new Set([
  MENSALIDADES_FILTER_ALL,
  'paid',
  'paid_in_month',
  'covered',
  'exempt',
  'frozen',
  'awaiting',
  'partial',
  'pending',
  'soon',
  'none',
  ...MENSALIDADES_RECEPTION_FILTER_IDS,
]);

export function isReguaMensalidadesFilter(filter) {
  return String(filter || '').startsWith('regua_');
}

export function parseMensalidadesFiltroParam(raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (!key) return MENSALIDADES_FILTER_ALL;
  if (URL_FILTRO_KEYS.has(key)) return key;
  if (isReguaMensalidadesFilter(key)) return key;
  return MENSALIDADES_FILTER_ALL;
}

/**
 * @param {object} params
 * @param {string} params.filter
 * @param {string} params.statusKey — resolveGridDisplayStatus().key
 * @param {object} params.student
 * @param {object} [params.payment]
 * @param {string} params.currentMonth
 * @param {object} [params.financeConfig]
 * @param {Record<string, object>} [params.studentOverdueMeta]
 */
export function matchesMensalidadesStatusFilter({
  filter,
  statusKey,
  student,
  payment,
  currentMonth,
  financeConfig,
  studentOverdueMeta = {},
}) {
  const f = String(filter || MENSALIDADES_FILTER_ALL);
  if (f === MENSALIDADES_FILTER_ALL) return true;

  if (isReguaMensalidadesFilter(f)) {
    const day = Number(f.replace('regua_', ''));
    const meta = studentOverdueMeta[student?.id];
    if (!meta || !Number.isFinite(day)) return false;
    return Number(meta.stage?.day) === day;
  }

  if (f === 'due_today' || f === 'due_week' || f === 'overdue') {
    const bucket = getReceptionDueBucket(
      student,
      payment,
      currentMonth,
      new Date(),
      financeConfig
    );
    if (f === 'overdue') return bucket === 'overdue';
    return bucket === f;
  }

  if (f === 'paid_in_month') {
    return statusKey === 'paid' || statusKey === 'covered';
  }

  return statusKey === f;
}

export function matchesMensalidadesStudentFilters({
  student,
  search = '',
  turmaFilter = 'all',
  planFilter = 'all',
  payment = null,
  configuredTurmas = [],
}) {
  const q = String(search || '').trim().toLowerCase();
  if (q && !String(student?.name || '').toLowerCase().includes(q)) return false;
  if (turmaFilter !== 'all' && studentTurma(student, configuredTurmas) !== turmaFilter) {
    return false;
  }
  if (planFilter !== 'all') {
    const plan = canonicalStudentPlanFilterLabel(effectiveStudentPlan(student, payment));
    if (plan !== planFilter) return false;
  }
  return true;
}

/** Contagens por status da grade (+ paid_in_month derivado). */
export function buildMensalidadesFilterCounts(students, getStatusKey) {
  const c = {
    all: students.length,
    paid: 0,
    covered: 0,
    exempt: 0,
    frozen: 0,
    awaiting: 0,
    partial: 0,
    pending: 0,
    soon: 0,
    none: 0,
    paid_in_month: 0,
  };
  for (const s of students) {
    const st = getStatusKey(s);
    if (Object.prototype.hasOwnProperty.call(c, st)) c[st] += 1;
    if (st === 'paid' || st === 'covered') c.paid_in_month += 1;
  }
  return c;
}
