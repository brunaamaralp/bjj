/**
 * Helpers servidor — risco de frequência por aluno.
 */
import { Query } from 'node-appwrite';
import {
  ATTENDANCE_RISK_LABELS,
  ATTENDANCE_RISK_STATUS,
  buildStudentRetentionMetrics,
  isFreezeActive,
  isRetentionEligibleStudent,
} from '../attendanceRetentionCore.js';
import { isActiveStudent } from '../../src/lib/studentStatus.js';

const ATTENDANCE_COL =
  process.env.VITE_APPWRITE_ATTENDANCE_COL_ID || process.env.APPWRITE_ATTENDANCE_COLLECTION_ID || '';

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {string} academyId
 * @param {string} studentId
 * @param {object} student — documento mapeado ou raw
 * @returns {Promise<object|null>}
 */
export async function fetchLastCheckinAt(databases, dbId, academyId, studentId) {
  if (!ATTENDANCE_COL) return null;
  const sid = String(studentId || '').trim();
  const aid = String(academyId || '').trim();
  if (!sid || !aid) return null;

  const eq = [
    Query.equal('academy_id', aid),
    Query.or([Query.equal('student_id', sid), Query.equal('lead_id', sid)]),
  ];

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
 * @param {object} student
 */
export async function fetchAttendanceRiskForStudent(databases, dbId, academyId, studentId, student) {
  if (!student || !isActiveStudent(student)) return null;
  if (isFreezeActive(student)) return null;

  const lastCheckinAt = await fetchLastCheckinAt(databases, dbId, academyId, studentId);
  const metrics = buildStudentRetentionMetrics(student, lastCheckinAt);
  if (!metrics) return null;

  return {
    ...metrics,
    statusLabel: ATTENDANCE_RISK_LABELS[metrics.status] || metrics.status,
    eligibleForRetentionTable: isRetentionEligibleStudent(student),
  };
}

export { ATTENDANCE_RISK_STATUS };
