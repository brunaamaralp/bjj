/**
 * Classificação de risco de frequência (catraca / attendance).
 * Compartilhado entre cliente e servidor — sem I/O.
 */
import { isFreezeActive, parseYmdLocal, startOfDay, toYmd, addDays } from './planFreezeCore.js';
import { enrollmentDateYmd } from '../src/lib/studentEnrollmentDate.js';
import { isActiveStudent } from '../src/lib/studentStatus.js';

export const ATTENDANCE_RISK_STATUS = {
  ACTIVE: 'active',
  AT_RISK: 'at_risk',
  ABSENT: 'absent',
  NEWCOMER_AT_RISK: 'newcomer_at_risk',
};

export const ATTENDANCE_RISK_LABELS = {
  [ATTENDANCE_RISK_STATUS.ACTIVE]: 'Ativo',
  [ATTENDANCE_RISK_STATUS.AT_RISK]: 'Em risco',
  [ATTENDANCE_RISK_STATUS.ABSENT]: 'Sumido',
  [ATTENDANCE_RISK_STATUS.NEWCOMER_AT_RISK]: 'Novato em risco',
};

export const DEFAULT_RISK_THRESHOLDS = {
  activeMaxDays: 7,
  atRiskMinDays: 8,
  atRiskMaxDays: 14,
  absentMinDays: 15,
  newcomerMaxEnrollmentDays: 60,
  newcomerAbsenceMinDays: 7,
};

/** Janela padrão para agregar último check-in no servidor. */
export const ATTENDANCE_RETENTION_LOOKBACK_DAYS = 90;

/** Histórico máximo do heatmap (fases futuras). */
export const ATTENDANCE_HEATMAP_WEEKS = 12;

/** Tipos de evento em lead_events para ações de retenção por frequência. */
export const ATTENDANCE_RETENTION_EVENT_TYPES = {
  REACTIVATION_WHATSAPP: 'attendance_reactivation_whatsapp',
  ABSENCE_REASON: 'attendance_absence_reason',
  CONTACT_MARKED: 'attendance_contact_marked',
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
 * @param {number|null|undefined} daysWithoutCheckin
 * @param {number|null|undefined} daysSinceEnrollment
 * @param {typeof DEFAULT_RISK_THRESHOLDS} [thresholds]
 * @returns {string}
 */
export function classifyAttendanceRisk({
  daysWithoutCheckin,
  daysSinceEnrollment,
  thresholds = DEFAULT_RISK_THRESHOLDS,
}) {
  const days = daysWithoutCheckin;
  if (days == null || !Number.isFinite(days) || days < 0) {
    return ATTENDANCE_RISK_STATUS.ACTIVE;
  }

  if (
    daysSinceEnrollment != null &&
    Number.isFinite(daysSinceEnrollment) &&
    daysSinceEnrollment >= 0 &&
    daysSinceEnrollment < thresholds.newcomerMaxEnrollmentDays &&
    days >= thresholds.newcomerAbsenceMinDays
  ) {
    return ATTENDANCE_RISK_STATUS.NEWCOMER_AT_RISK;
  }

  if (days <= thresholds.activeMaxDays) return ATTENDANCE_RISK_STATUS.ACTIVE;
  if (days >= thresholds.atRiskMinDays && days <= thresholds.atRiskMaxDays) {
    return ATTENDANCE_RISK_STATUS.AT_RISK;
  }
  if (days >= thresholds.absentMinDays) return ATTENDANCE_RISK_STATUS.ABSENT;

  return ATTENDANCE_RISK_STATUS.ACTIVE;
}

/** Status elegíveis para a tabela operacional de sumidos (Fase 2). */
export function isAtRiskTableStatus(status) {
  return (
    status === ATTENDANCE_RISK_STATUS.AT_RISK ||
    status === ATTENDANCE_RISK_STATUS.ABSENT ||
    status === ATTENDANCE_RISK_STATUS.NEWCOMER_AT_RISK
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
 * Calcula dias sem check-in e status de risco para um aluno.
 * Sem check-in: conta dias desde matrícula (`enrollmentDateYmd`).
 *
 * @param {object} student
 * @param {string|null|undefined} lastCheckinAt — ISO do último check-in
 * @param {Date} [today]
 * @param {typeof DEFAULT_RISK_THRESHOLDS} [thresholds]
 * @returns {{
 *   status: string;
 *   daysWithoutCheckin: number|null;
 *   daysSinceEnrollment: number|null;
 *   lastCheckinAt: string|null;
 *   enrollmentDate: string;
 * }|null}
 */
export function buildStudentRetentionMetrics(
  student,
  lastCheckinAt,
  today = new Date(),
  thresholds = DEFAULT_RISK_THRESHOLDS
) {
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

  const status = classifyAttendanceRisk({
    daysWithoutCheckin,
    daysSinceEnrollment,
    thresholds,
  });

  return {
    status,
    daysWithoutCheckin,
    daysSinceEnrollment,
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
 * @param {typeof DEFAULT_RISK_THRESHOLDS} [thresholds]
 */
export function summarizeAttendanceRetention(
  students,
  lastCheckinByStudent,
  today = new Date(),
  thresholds = DEFAULT_RISK_THRESHOLDS
) {
  const summary = {
    active: 0,
    at_risk: 0,
    absent: 0,
    newcomer_at_risk: 0,
    unclassified: 0,
    eligible: students.length,
  };

  const atRisk = [];

  for (const student of students) {
    const studentId = String(student.id || student.$id || '').trim();
    const lastCheckin = lastCheckinByStudent.get(studentId) || null;
    const metrics = buildStudentRetentionMetrics(student, lastCheckin, today, thresholds);
    if (!metrics) {
      summary.unclassified += 1;
      continue;
    }

    if (metrics.status === ATTENDANCE_RISK_STATUS.ACTIVE) summary.active += 1;
    else if (metrics.status === ATTENDANCE_RISK_STATUS.AT_RISK) summary.at_risk += 1;
    else if (metrics.status === ATTENDANCE_RISK_STATUS.ABSENT) summary.absent += 1;
    else if (metrics.status === ATTENDANCE_RISK_STATUS.NEWCOMER_AT_RISK) summary.newcomer_at_risk += 1;

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
        lastCheckinAt: metrics.lastCheckinAt,
        enrollmentDate: metrics.enrollmentDate,
      });
    }
  }

  atRisk.sort((a, b) => {
    const da = Number(a.daysWithoutCheckin) || 0;
    const db = Number(b.daysWithoutCheckin) || 0;
    return db - da;
  });

  return { summary, atRisk };
}
