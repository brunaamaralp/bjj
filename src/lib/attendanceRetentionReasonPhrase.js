import {
  ATTENDANCE_RISK_STATUS,
  normalizeAttendanceRiskStatus,
} from '../../lib/attendanceRetentionCore.js';

/**
 * Frase operacional do motivo na fila de retenção.
 * @param {{
 *   status?: string|null;
 *   daysWithoutCheckin?: number|null;
 *   checkinsLast7Days?: number|null;
 *   weeklyCheckinsExpected?: number|null;
 * }} [row]
 */
export function buildAttendanceRetentionReasonPhrase(row = {}) {
  const status = normalizeAttendanceRiskStatus(row.status);
  const rawDays = row.daysWithoutCheckin;
  const days = rawDays == null || rawDays === '' ? NaN : Number(rawDays);
  const daysPart =
    Number.isFinite(days) && days >= 0 ? `${days} dias sem treinar` : 'sem check-in recente';

  if (status === ATTENDANCE_RISK_STATUS.ABSENT) {
    return `Sumido · ${daysPart}`;
  }

  const expected = Number(row.weeklyCheckinsExpected) || 2;
  const count = Number(row.checkinsLast7Days);
  const countSafe = Number.isFinite(count) ? Math.max(0, count) : 0;
  return `Abaixo da meta (${countSafe}/${expected}) · ${daysPart}`;
}
