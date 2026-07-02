/**
 * Helpers servidor — risco de frequência por aluno.
 */
import { Query } from 'node-appwrite';
import {
  ATTENDANCE_RISK_LABELS,
  ATTENDANCE_RISK_STATUS,
  buildStudentRetentionMetrics,
  buildWeeklyGoalsContext,
  isRetentionEligibleStudent,
  WEEKLY_RETENTION_WINDOW_DAYS,
} from '../attendanceRetentionCore.js';
import { isFreezeActive } from '../planFreezeCore.js';
import { isActiveStudent } from '../../src/lib/studentStatus.js';
import { mergeFinanceConfigFromAcademyDoc } from '../../src/lib/financeConfigStorage.js';
import { listAcademyClassDocs } from './academyClasses.js';
import { addDays, startOfDay, toYmd } from '../planFreezeCore.js';

const ATTENDANCE_COL =
  process.env.VITE_APPWRITE_ATTENDANCE_COL_ID || process.env.APPWRITE_ATTENDANCE_COLLECTION_ID || '';

function studentAttendanceQueries(academyId, studentId) {
  const sid = String(studentId || '').trim();
  const aid = String(academyId || '').trim();
  return {
    sid,
    aid,
    eq: [
      Query.equal('academy_id', aid),
      Query.or([Query.equal('student_id', sid), Query.equal('lead_id', sid)]),
    ],
  };
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {string} academyId
 * @param {string} studentId
 * @returns {Promise<string|null>}
 */
export async function fetchLastCheckinAt(databases, dbId, academyId, studentId) {
  if (!ATTENDANCE_COL) return null;
  const { sid, aid, eq } = studentAttendanceQueries(academyId, studentId);
  if (!sid || !aid) return null;

  try {
    const res = await databases.listDocuments(dbId, ATTENDANCE_COL, [
      ...eq,
      Query.orderDesc('checked_in_at'),
      Query.limit(1),
    ]);
    return res.documents?.[0]?.checked_in_at || null;
  } catch {
    try {
      const res = await databases.listDocuments(dbId, ATTENDANCE_COL, [...eq, Query.limit(50)]);
      const docs = res.documents || [];
      let best = null;
      for (const row of docs) {
        const at = String(row.checked_in_at || '').trim();
        if (at && (!best || at > best)) best = at;
      }
      return best;
    } catch {
      return null;
    }
  }
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {string} academyId
 * @param {string} studentId
 * @param {Date} [today]
 */
export async function fetchCheckinsCountLast7Days(databases, dbId, academyId, studentId, today = new Date()) {
  if (!ATTENDANCE_COL) return 0;
  const { sid, aid, eq } = studentAttendanceQueries(academyId, studentId);
  if (!sid || !aid) return 0;

  const sinceIso = `${toYmd(addDays(startOfDay(today), -(WEEKLY_RETENTION_WINDOW_DAYS - 1)))}T00:00:00.000Z`;

  try {
    const res = await databases.listDocuments(dbId, ATTENDANCE_COL, [
      ...eq,
      Query.greaterThanEqual('checked_in_at', sinceIso),
      Query.limit(100),
    ]);
    return (res.documents || []).length;
  } catch {
    return 0;
  }
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} academyId
 * @param {object|null} [academyDoc]
 */
export async function fetchWeeklyGoalsContext(databases, academyId, academyDoc = null) {
  const financeConfig = mergeFinanceConfigFromAcademyDoc(academyDoc || {});
  const classes = await listAcademyClassDocs(databases, academyId);
  return buildWeeklyGoalsContext(financeConfig, classes);
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {string} academyId
 * @param {string} studentId
 * @param {object} student
 * @param {{ goalsContext?: ReturnType<typeof buildWeeklyGoalsContext>|null }} [options]
 */
export async function fetchAttendanceRiskForStudent(
  databases,
  dbId,
  academyId,
  studentId,
  student,
  options = {}
) {
  if (!student || !isActiveStudent(student)) return null;
  if (isFreezeActive(student)) return null;

  const today = new Date();
  const goalsContext =
    options.goalsContext ?? (await fetchWeeklyGoalsContext(databases, academyId));

  const [lastCheckinAt, checkinsLast7Days] = await Promise.all([
    fetchLastCheckinAt(databases, dbId, academyId, studentId),
    fetchCheckinsCountLast7Days(databases, dbId, academyId, studentId, today),
  ]);

  const metrics = buildStudentRetentionMetrics(student, lastCheckinAt, today, {
    checkinsLast7Days,
    goalsContext,
  });
  if (!metrics) return null;

  return {
    ...metrics,
    statusLabel: ATTENDANCE_RISK_LABELS[metrics.status] || metrics.status,
    eligibleForRetentionTable: isRetentionEligibleStudent(student),
  };
}

export { ATTENDANCE_RISK_STATUS };
