/**
 * Classificação de risco de frequência (catraca / attendance).
 * Compartilhado entre cliente e servidor — sem I/O.
 */
import { isFreezeActive, parseYmdLocal, startOfDay, toYmd, addDays } from './planFreezeCore.js';
import { enrollmentDateYmd } from '../src/lib/studentEnrollmentDate.js';
import { isActiveStudent } from '../src/lib/studentStatus.js';
import {
  aggregateCheckinsInWindowByStudent,
  buildWeeklyGoalsContext,
  classifyWeeklyAttendanceRisk,
  DEFAULT_WEEKLY_RETENTION_RULES,
  resolveWeeklyCheckinsExpected,
  WEEKLY_RETENTION_WINDOW_DAYS,
} from './attendanceWeeklyGoalCore.js';

export const ATTENDANCE_RISK_STATUS = {
  ACTIVE: 'active',
  AT_RISK: 'at_risk',
  ABSENT: 'absent',
};

/** @deprecated Status removido — mantido só para leitura de dados legados. */
export const LEGACY_ATTENDANCE_RISK_STATUS = {
  NEWCOMER_AT_RISK: 'newcomer_at_risk',
};

export const ATTENDANCE_RISK_LABELS = {
  [ATTENDANCE_RISK_STATUS.ACTIVE]: 'Ativo',
  [ATTENDANCE_RISK_STATUS.AT_RISK]: 'Em risco',
  [ATTENDANCE_RISK_STATUS.ABSENT]: 'Sumido',
  [LEGACY_ATTENDANCE_RISK_STATUS.NEWCOMER_AT_RISK]: 'Em risco',
};

/** @deprecated Use DEFAULT_WEEKLY_RETENTION_RULES — limiares antigos por dias corridos. */
export const DEFAULT_RISK_THRESHOLDS = {
  activeMaxDays: 7,
  atRiskMinDays: 8,
  atRiskMaxDays: 14,
  absentMinDays: 15,
  newcomerMaxEnrollmentDays: 60,
  newcomerAbsenceMinDays: 7,
};

/** Janela padrão para agregar check-ins no servidor. */
export const ATTENDANCE_RETENTION_LOOKBACK_DAYS = 90;

/** Histórico máximo do heatmap (fases futuras). */
export const ATTENDANCE_HEATMAP_WEEKS = 12;

/** Tipos de evento em lead_events para ações de retenção por frequência. */
export const ATTENDANCE_RETENTION_EVENT_TYPES = {
  REACTIVATION_WHATSAPP: 'attendance_reactivation_whatsapp',
  ABSENCE_REASON: 'attendance_absence_reason',
  CONTACT_MARKED: 'attendance_contact_marked',
  CONTACT_CLEARED: 'attendance_contact_cleared',
  SNOOZE: 'attendance_snooze',
};

export const ATTENDANCE_ABSENCE_REASONS = [
  { id: 'viagem', label: 'Viagem' },
  { id: 'lesao', label: 'Lesão' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'esqueceu', label: 'Esqueceu' },
  { id: 'desistiu', label: 'Desistiu' },
];

/** Ocultar da fila operacional após registrar motivo de ausência. */
export const ATTENDANCE_ABSENCE_SNOOZE_OPTIONS = [
  { value: 7, label: '7 dias' },
  { value: 14, label: '14 dias' },
  { value: 30, label: '30 dias' },
];

export const DEFAULT_ATTENDANCE_ABSENCE_SNOOZE_DAYS = 14;

export {
  aggregateCheckinsInWindowByStudent,
  buildWeeklyGoalsContext,
  classifyWeeklyAttendanceRisk,
  DEFAULT_WEEKLY_RETENTION_RULES,
  resolveWeeklyCheckinsExpected,
  WEEKLY_RETENTION_WINDOW_DAYS,
};

/**
 * Normaliza status legado para os 3 buckets atuais.
 * @param {string|null|undefined} status
 */
export function normalizeAttendanceRiskStatus(status) {
  const key = String(status || '').trim();
  if (key === LEGACY_ATTENDANCE_RISK_STATUS.NEWCOMER_AT_RISK) {
    return ATTENDANCE_RISK_STATUS.AT_RISK;
  }
  if (
    key === ATTENDANCE_RISK_STATUS.ACTIVE ||
    key === ATTENDANCE_RISK_STATUS.AT_RISK ||
    key === ATTENDANCE_RISK_STATUS.ABSENT
  ) {
    return key;
  }
  return ATTENDANCE_RISK_STATUS.ACTIVE;
}

/**
 * Data YMD até quando o aluno fica fora da fila de retenção.
 * @param {number} [days]
 * @param {Date} [today]
 */
export function retentionSnoozeUntilYmd(days = DEFAULT_ATTENDANCE_ABSENCE_SNOOZE_DAYS, today = new Date()) {
  const n = Math.min(90, Math.max(1, Number(days) || DEFAULT_ATTENDANCE_ABSENCE_SNOOZE_DAYS));
  return toYmd(addDays(today, n));
}

/**
 * Dias corridos entre uma data (YYYY-MM-DD ou ISO) e hoje (início do dia local).
 * @param {string|null|undefined} value
 * @param {Date} [today]
 * @returns {number|null}
 */
export function daysSinceDate(value, today = new Date()) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const parsed = parseYmdLocal(raw.slice(0, 10));
  const anchor = parsed || (() => {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  })();
  if (!anchor) return null;

  const t0 = startOfDay(today);
  const t1 = startOfDay(anchor);
  return Math.floor((t0.getTime() - t1.getTime()) / 86400000);
}

/**
 * @deprecated Preferir classifyWeeklyAttendanceRisk.
 */
export function classifyAttendanceRisk({
  daysWithoutCheckin,
  daysSinceEnrollment: _daysSinceEnrollment,
  thresholds = DEFAULT_RISK_THRESHOLDS,
}) {
  return classifyWeeklyAttendanceRisk({
    checkinsLast7Days: 0,
    daysWithoutCheckin,
    weeklyExpected: 1,
    rules: {
      ...DEFAULT_WEEKLY_RETENTION_RULES,
      graceDaysWithoutCheckin: thresholds.activeMaxDays,
      atRiskMinDaysWithoutCheckin: thresholds.atRiskMinDays,
      absentMinDaysWithoutCheckin: thresholds.absentMinDays,
    },
  });
}

/** Status elegíveis para a tabela operacional (Em risco + Sumido). */
export function isAtRiskTableStatus(status) {
  const normalized = normalizeAttendanceRiskStatus(status);
  return (
    normalized === ATTENDANCE_RISK_STATUS.AT_RISK || normalized === ATTENDANCE_RISK_STATUS.ABSENT
  );
}

/**
 * Aluno ativo, não trancado, fora do snooze «em contato».
 * @param {object|null|undefined} student
 * @param {Date} [today]
 */
export function isRetentionEligibleStudent(student, today = new Date()) {
  if (!student || !isActiveStudent(student)) return false;
  if (isFreezeActive(student)) return false;
  if (student.retention_in_contact === true || student.retentionInContact === true) return false;

  const snooze = String(
    student.retention_snoozed_until ?? student.retentionSnoozedUntil ?? ''
  )
    .trim()
    .slice(0, 10);
  if (!snooze) return true;

  const todayYmd = toYmd(today);
  return todayYmd > snooze;
}

/**
 * Calcula métricas de retenção com meta semanal por plano/turma.
 *
 * @param {object} student
 * @param {string|null|undefined} lastCheckinAt — ISO do último check-in
 * @param {Date} [today]
 * @param {{
 *   checkinsLast7Days?: number|null;
 *   goalsContext?: ReturnType<typeof buildWeeklyGoalsContext>|null;
 *   weeklyRules?: typeof DEFAULT_WEEKLY_RETENTION_RULES;
 * }} [options]
 * @returns {{
 *   status: string;
 *   daysWithoutCheckin: number|null;
 *   daysSinceEnrollment: number|null;
 *   checkinsLast7Days: number;
 *   weeklyCheckinsExpected: number;
 *   lastCheckinAt: string|null;
 *   enrollmentDate: string;
 * }|null}
 */
export function buildStudentRetentionMetrics(
  student,
  lastCheckinAt,
  today = new Date(),
  options = {}
) {
  const { checkinsLast7Days = null, goalsContext = null, weeklyRules = DEFAULT_WEEKLY_RETENTION_RULES } =
    options;

  const enrollmentDate = enrollmentDateYmd(student);
  const daysSinceEnrollment = enrollmentDate ? daysSinceDate(enrollmentDate, today) : null;

  let daysWithoutCheckin;
  const lastAt = String(lastCheckinAt || '').trim() || null;

  if (lastAt) {
    daysWithoutCheckin = daysSinceDate(lastAt, today);
  } else if (enrollmentDate) {
    daysWithoutCheckin = daysSinceEnrollment;
  } else {
    return null;
  }

  const weeklyCheckinsExpected = resolveWeeklyCheckinsExpected(student, goalsContext);
  const count7 =
    checkinsLast7Days == null || !Number.isFinite(Number(checkinsLast7Days))
      ? lastAt && daysWithoutCheckin != null && daysWithoutCheckin < WEEKLY_RETENTION_WINDOW_DAYS
        ? 1
        : 0
      : Math.max(0, Number(checkinsLast7Days));

  const status = classifyWeeklyAttendanceRisk({
    checkinsLast7Days: count7,
    daysWithoutCheckin,
    weeklyExpected: weeklyCheckinsExpected,
    rules: weeklyRules,
  });

  return {
    status,
    daysWithoutCheckin,
    daysSinceEnrollment,
    checkinsLast7Days: count7,
    weeklyCheckinsExpected,
    lastCheckinAt: lastAt,
    enrollmentDate,
  };
}

/**
 * Agrega último check-in por aluno a partir de documentos `attendance`.
 * @param {object[]} docs
 * @returns {Map<string, string>}
 */
export function aggregateLastCheckinByStudent(docs) {
  const map = new Map();
  for (const row of docs || []) {
    const sid = String(row.student_id || row.lead_id || '').trim();
    const at = String(row.checked_in_at || '').trim();
    if (!sid || !at) continue;
    const prev = map.get(sid);
    if (!prev || at > prev) map.set(sid, at);
  }
  return map;
}

/**
 * Contadores por status + lista de alunos em risco ordenada.
 * @param {object[]} students — já filtrados por elegibilidade
 * @param {Map<string, string>} lastCheckinByStudent
 * @param {Date} [today]
 * @param {{
 *   checkinsLast7DaysByStudent?: Map<string, number>;
 *   goalsContext?: ReturnType<typeof buildWeeklyGoalsContext>|null;
 *   weeklyRules?: typeof DEFAULT_WEEKLY_RETENTION_RULES;
 * }} [options]
 */
export function summarizeAttendanceRetention(
  students,
  lastCheckinByStudent,
  today = new Date(),
  options = {}
) {
  const {
    checkinsLast7DaysByStudent = new Map(),
    goalsContext = null,
    weeklyRules = DEFAULT_WEEKLY_RETENTION_RULES,
  } = options;

  const summary = {
    active: 0,
    at_risk: 0,
    absent: 0,
    unclassified: 0,
    eligible: students.length,
  };

  const atRisk = [];

  for (const student of students) {
    const studentId = String(student.id || student.$id || '').trim();
    const lastCheckin = lastCheckinByStudent.get(studentId) || null;
    const checkinsLast7Days = checkinsLast7DaysByStudent.get(studentId) ?? 0;
    const metrics = buildStudentRetentionMetrics(student, lastCheckin, today, {
      checkinsLast7Days,
      goalsContext,
      weeklyRules,
    });
    if (!metrics) {
      summary.unclassified += 1;
      continue;
    }

    if (metrics.status === ATTENDANCE_RISK_STATUS.ACTIVE) summary.active += 1;
    else if (metrics.status === ATTENDANCE_RISK_STATUS.AT_RISK) summary.at_risk += 1;
    else if (metrics.status === ATTENDANCE_RISK_STATUS.ABSENT) summary.absent += 1;

    if (isAtRiskTableStatus(metrics.status)) {
      atRisk.push({
        studentId,
        name: String(student.name || '').trim(),
        phone: String(student.phone || '').trim(),
        turma: String(student.turma || student.className || '').trim(),
        belt: String(student.belt || '').trim(),
        status: metrics.status,
        statusLabel: ATTENDANCE_RISK_LABELS[metrics.status] || metrics.status,
        daysWithoutCheckin: metrics.daysWithoutCheckin,
        checkinsLast7Days: metrics.checkinsLast7Days,
        weeklyCheckinsExpected: metrics.weeklyCheckinsExpected,
        lastCheckinAt: metrics.lastCheckinAt,
        enrollmentDate: metrics.enrollmentDate,
      });
    }
  }

  atRisk.sort((a, b) => {
    const statusOrder = (s) =>
      s === ATTENDANCE_RISK_STATUS.ABSENT ? 2 : s === ATTENDANCE_RISK_STATUS.AT_RISK ? 1 : 0;
    const so = statusOrder(b.status) - statusOrder(a.status);
    if (so !== 0) return so;
    const gapA = Math.max(0, (a.weeklyCheckinsExpected ?? 2) - (a.checkinsLast7Days ?? 0));
    const gapB = Math.max(0, (b.weeklyCheckinsExpected ?? 2) - (b.checkinsLast7Days ?? 0));
    if (gapB !== gapA) return gapB - gapA;
    const da = Number(a.daysWithoutCheckin) || 0;
    const db = Number(b.daysWithoutCheckin) || 0;
    return db - da;
  });

  return { summary, atRisk };
}
