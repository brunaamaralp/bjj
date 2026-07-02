/**
 * GET /api/reports?route=attendance-frequency
 *
 * Painel analítico: KPIs de retenção, heatmap 12 semanas, ranking e comparativo mensal.
 */
import { Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, DB_ID, databases } from './academyAccess.js';
import {
  ATTENDANCE_RETENTION_LOOKBACK_DAYS,
  aggregateCheckinsInWindowByStudent,
  aggregateLastCheckinByStudent,
  buildWeeklyGoalsContext,
  summarizeAttendanceRetention,
} from '../attendanceRetentionCore.js';
import { mergeFinanceConfigFromAcademyDoc } from '../../src/lib/financeConfigStorage.js';
import { listAcademyClassDocs } from './academyClasses.js';
import { mapAppwriteDocToStudent } from '../../src/lib/mapAppwriteStudentDoc.js';
import { STUDENT_STATUS } from '../../src/lib/studentStatus.js';
import { isFreezeActive, toYmd, addDays } from '../planFreezeCore.js';
import {
  buildAttendanceMonthComparison,
  buildAttendanceStudentRanking,
  buildAttendanceWeekHeatmap,
  countCheckinsInRange,
} from './attendanceFrequencyCore.js';

const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';
const ATTENDANCE_COL =
  process.env.VITE_APPWRITE_ATTENDANCE_COL_ID || process.env.APPWRITE_ATTENDANCE_COLLECTION_ID || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

const STUDENT_PAGE_SIZE = 200;
const ATTENDANCE_PAGE_SIZE = 500;
const MAX_ATTENDANCE_DOCS = 15_000;

function json(res, status, body) {
  res.status(status).json(body);
}

function sinceIsoFromLookback(days, today = new Date()) {
  const d = addDays(today, -Math.max(14, Number(days) || ATTENDANCE_RETENTION_LOOKBACK_DAYS));
  return `${toYmd(d)}T00:00:00.000Z`;
}

async function fetchActiveStudents(db, academyId) {
  if (!STUDENTS_COL) return [];
  const all = [];
  let cursor = null;
  for (;;) {
    const queries = [
      Query.equal('academyId', academyId),
      Query.notEqual('student_status', STUDENT_STATUS.INACTIVE),
      Query.select([
        '$id',
        'name',
        'turma',
        'belt',
        'student_status',
        'freeze_status',
        'enrollmentDate',
        'converted_at',
        'plan',
      ]),
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

function applyFilters(students, attendanceDocs, { turma, belt }) {
  let studentList = students.filter((s) => !isFreezeActive(s));
  if (turma) {
    const t = turma.toLowerCase();
    studentList = studentList.filter((s) => String(s.turma || s.className || '').toLowerCase() === t);
  }
  if (belt) {
    const b = belt.toLowerCase();
    studentList = studentList.filter((s) => String(s.belt || '').toLowerCase() === b);
  }
  const ids = new Set(studentList.map((s) => String(s.id || s.$id || '').trim()).filter(Boolean));
  const docs =
    ids.size === 0
      ? []
      : attendanceDocs.filter((row) => {
          const sid = String(row.student_id || row.lead_id || '').trim();
          return sid && ids.has(sid);
        });
  return { studentList, docs };
}

function uniqueFilterOptions(students) {
  const turmas = new Set();
  const belts = new Set();
  for (const s of students) {
    const t = String(s.turma || s.className || '').trim();
    const b = String(s.belt || '').trim();
    if (t) turmas.add(t);
    if (b) belts.add(b);
  }
  return {
    turmas: [...turmas].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    belts: [...belts].sort((a, b) => a.localeCompare(b, 'pt-BR')),
  };
}

export default async function attendanceFrequencyHandler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { ok: false, erro: 'Method Not Allowed' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;

  const { academyId } = access;
  const turma = String(req.query?.turma || '').trim();
  const belt = String(req.query?.belt || '').trim();
  const lookbackDays = Math.min(
    365,
    Math.max(28, Number(req.query?.lookback_days) || ATTENDANCE_RETENTION_LOOKBACK_DAYS)
  );
  const fromYmd = String(req.query?.from || '').trim().slice(0, 10);
  const toParam = String(req.query?.to || '').trim().slice(0, 10);
  const today = new Date();

  if (!STUDENTS_COL || !ATTENDANCE_COL) {
    return json(res, 503, { ok: false, erro: 'Coleção de presença não configurada' });
  }

  try {
    const allStudents = await fetchActiveStudents(databases, academyId);
    const sinceIso = sinceIsoFromLookback(lookbackDays, today);
    const { docs: attendanceDocs, truncated } = await fetchAttendanceSince(
      databases,
      academyId,
      sinceIso
    );

    const { studentList, docs: filteredDocs } = applyFilters(allStudents, attendanceDocs, {
      turma,
      belt,
    });
    const lastCheckinByStudent = aggregateLastCheckinByStudent(filteredDocs);
    const checkinsLast7DaysByStudent = aggregateCheckinsInWindowByStudent(filteredDocs, undefined, today);

    let goalsContext = null;
    if (ACADEMIES_COL) {
      try {
        const academyDoc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        const financeConfig = mergeFinanceConfigFromAcademyDoc(academyDoc || {});
        const classes = await listAcademyClassDocs(databases, academyId);
        goalsContext = buildWeeklyGoalsContext(financeConfig, classes);
      } catch (e) {
        console.warn('[attendance-frequency] goals context unavailable', e?.message || e);
      }
    }

    const { summary } = summarizeAttendanceRetention(studentList, lastCheckinByStudent, today, {
      checkinsLast7DaysByStudent,
      goalsContext,
    });

    const periodFrom = fromYmd || toYmd(sinceIso.slice(0, 10));
    const periodTo = toParam || toYmd(today);
    const periodDocs = filteredDocs.filter((row) => {
      const ymd = String(row.checked_in_at || '').slice(0, 10);
      return ymd && ymd >= periodFrom && ymd <= periodTo;
    });

    const studentById = new Map(
      studentList.map((s) => [String(s.id || '').trim(), s]).filter(([id]) => id)
    );

    const heatmap = buildAttendanceWeekHeatmap(filteredDocs, 12, today);
    const monthComparison = buildAttendanceMonthComparison(filteredDocs, today);
    const ranking = buildAttendanceStudentRanking(periodDocs, studentById, 15);
    const periodCheckins = countCheckinsInRange(filteredDocs, periodFrom, periodTo);
    const filters = uniqueFilterOptions(allStudents.filter((s) => !isFreezeActive(s)));

    return json(res, 200, {
      ok: true,
      academyId,
      computedAt: new Date().toISOString(),
      lookbackDays,
      period: { from: periodFrom, to: periodTo },
      attendanceTruncated: truncated,
      summary,
      monthComparison,
      periodCheckins,
      heatmap,
      ranking,
      filters,
    });
  } catch (e) {
    console.error('[attendance-frequency]', e);
    return json(res, 500, { ok: false, erro: e?.message || 'Falha ao calcular frequência' });
  }
}
