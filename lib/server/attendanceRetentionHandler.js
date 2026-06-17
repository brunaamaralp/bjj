/**
 * GET /api/reports?route=attendance-retention
 *
 * Agrega frequência da academia: contadores por status e lista de alunos em risco.
 * Dados analíticos — mesmo hub de Relatórios (`light`, `audit-feed`, etc.).
 */
import { Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, DB_ID, databases } from './academyAccess.js';
import {
  ATTENDANCE_RETENTION_LOOKBACK_DAYS,
  aggregateLastCheckinByStudent,
  isRetentionEligibleStudent,
  summarizeAttendanceRetention,
} from '../attendanceRetentionCore.js';
import { mapAppwriteDocToStudent } from '../../src/lib/mapAppwriteStudentDoc.js';
import { STUDENT_STATUS } from '../../src/lib/studentStatus.js';
import { isFreezeActive, toYmd, addDays } from '../planFreezeCore.js';
import { isRetentionEligibleStudent } from '../attendanceRetentionCore.js';

const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';
const ATTENDANCE_COL =
  process.env.VITE_APPWRITE_ATTENDANCE_COL_ID || process.env.APPWRITE_ATTENDANCE_COLLECTION_ID || '';

const STUDENT_PAGE_SIZE = 200;
const ATTENDANCE_PAGE_SIZE = 500;
const MAX_ATTENDANCE_DOCS = 12_000;

const RETENTION_STUDENT_SELECT = [
  '$id',
  'name',
  'phone',
  'turma',
  'class_name',
  'belt',
  'enrollmentDate',
  'enrollment_date',
  'converted_at',
  'student_status',
  'freeze_status',
  'retention_snoozed_until',
  'retention_in_contact',
  'academyId',
  'contact_type',
  'status',
];

function json(res, status, body) {
  res.status(status).json(body);
}

function sinceIsoFromLookback(days, today = new Date()) {
  const d = addDays(today, -Math.max(1, Number(days) || ATTENDANCE_RETENTION_LOOKBACK_DAYS));
  return `${toYmd(d)}T00:00:00.000Z`;
}

/**
 * @param {import('node-appwrite').Databases} db
 * @param {string} academyId
 */
async function fetchAllActiveStudents(db, academyId) {
  if (!STUDENTS_COL) return [];

  const all = [];
  let cursor = null;

  for (;;) {
    const queries = [
      Query.equal('academyId', academyId),
      Query.notEqual('student_status', STUDENT_STATUS.INACTIVE),
      Query.select(RETENTION_STUDENT_SELECT),
      Query.orderAsc('$id'),
      Query.limit(STUDENT_PAGE_SIZE),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const page = await db.listDocuments(DB_ID, STUDENTS_COL, queries);
    const docs = page.documents || [];
    all.push(...docs.map((doc) => mapAppwriteDocToStudent(doc)));

    if (docs.length < STUDENT_PAGE_SIZE) break;
    cursor = docs[docs.length - 1].$id;
  }

  return all;
}

/**
 * @param {import('node-appwrite').Databases} db
 * @param {string} academyId
 * @param {string} sinceIso
 */
async function fetchAttendanceSince(db, academyId, sinceIso) {
  if (!ATTENDANCE_COL) return { docs: [], truncated: false };

  const docs = [];
  let cursor = null;
  let truncated = false;

  for (;;) {
    const queries = [
      Query.equal('academy_id', academyId),
      Query.greaterThanEqual('checked_in_at', sinceIso),
      Query.orderDesc('checked_in_at'),
      Query.limit(ATTENDANCE_PAGE_SIZE),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const page = await db.listDocuments(DB_ID, ATTENDANCE_COL, queries);
    const batch = page.documents || [];
    docs.push(...batch);

    if (docs.length >= MAX_ATTENDANCE_DOCS) {
      truncated = true;
      break;
    }
    if (batch.length < ATTENDANCE_PAGE_SIZE) break;
    cursor = batch[batch.length - 1].$id;
  }

  return { docs: docs.slice(0, MAX_ATTENDANCE_DOCS), truncated };
}

function parseFilters(query = {}) {
  const turma = String(query.turma || '').trim();
  const belt = String(query.belt || '').trim();
  const includeAtRisk = query.include_at_risk !== '0' && query.include_at_risk !== 'false';
  const lookbackDays = Math.min(
    365,
    Math.max(14, Number(query.lookback_days) || ATTENDANCE_RETENTION_LOOKBACK_DAYS)
  );
  return { turma, belt, includeAtRisk, lookbackDays };
}

function applyStudentFilters(students, { turma, belt }) {
  let list = students;
  if (turma) {
    const t = turma.toLowerCase();
    list = list.filter((s) => String(s.turma || s.className || '').toLowerCase() === t);
  }
  if (belt) {
    const b = belt.toLowerCase();
    list = list.filter((s) => String(s.belt || '').toLowerCase() === b);
  }
  return list;
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
export default async function attendanceRetentionHandler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { ok: false, erro: 'Method Not Allowed' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;

  const { academyId } = access;
  const filters = parseFilters(req.query || {});
  const today = new Date();
  const sinceIso = sinceIsoFromLookback(filters.lookbackDays, today);

  if (!STUDENTS_COL) {
    return json(res, 503, { ok: false, erro: 'Coleção de alunos não configurada' });
  }
  if (!ATTENDANCE_COL) {
    return json(res, 503, { ok: false, erro: 'Coleção de presença não configurada' });
  }

  try {
    const allStudents = await fetchAllActiveStudents(databases, academyId);
    const todayYmd = toYmd(today);
    const excludedFrozen = allStudents.filter((s) => isFreezeActive(s)).length;
    const excludedSnoozed = allStudents.filter((s) => {
      if (isFreezeActive(s)) return false;
      const snooze = String(s.retention_snoozed_until ?? s.retentionSnoozedUntil ?? '')
        .trim()
        .slice(0, 10);
      return Boolean(snooze && todayYmd <= snooze);
    }).length;
    const excludedInContact = allStudents.filter(
      (s) => s.retention_in_contact === true || s.retentionInContact === true
    ).length;
    const eligible = allStudents.filter((s) => isRetentionEligibleStudent(s, today));

    const filtered = applyStudentFilters(eligible, filters);

    const { docs: attendanceDocs, truncated } = await fetchAttendanceSince(
      databases,
      academyId,
      sinceIso
    );
    const lastCheckinByStudent = aggregateLastCheckinByStudent(attendanceDocs);
    const { summary, atRisk } = summarizeAttendanceRetention(filtered, lastCheckinByStudent, today);

    return json(res, 200, {
      ok: true,
      academyId,
      computedAt: new Date().toISOString(),
      lookbackDays: filters.lookbackDays,
      attendanceTruncated: truncated,
      excluded: {
        frozen: excludedFrozen,
        snoozed: excludedSnoozed,
        in_contact: excludedInContact,
      },
      summary,
      at_risk: filters.includeAtRisk ? atRisk : [],
    });
  } catch (e) {
    console.error('[attendance-retention]', e);
    return json(res, 500, { ok: false, erro: e?.message || 'Falha ao calcular retenção por frequência' });
  }
}
