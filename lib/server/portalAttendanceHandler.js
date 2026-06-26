import { Query } from 'node-appwrite';
import { ensureAuth, databases } from './academyAccess.js';
import { DB_ID } from './appwriteCollections.js';
import { resolvePortalStudentAccess, PORTAL_FORBIDDEN } from './portalAccess.js';

const ATTENDANCE_COL_ID =
  process.env.VITE_APPWRITE_ATTENDANCE_COL_ID || process.env.APPWRITE_ATTENDANCE_COL_ID || '';

const DIAS_UTEIS_MES_REF = 26;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function ymFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

async function fetchAttendanceStats(studentId, academyId) {
  const empty = { thisMonth: 0, lastMonth: 0, total: 0, monthlyRate: '0%' };
  if (!ATTENDANCE_COL_ID) return empty;
  try {
    const res = await databases.listDocuments(DB_ID, ATTENDANCE_COL_ID, [
      Query.equal('academy_id', academyId),
      Query.or([Query.equal('student_id', studentId), Query.equal('lead_id', studentId)]),
      Query.limit(500),
    ]);
    const docs = res.documents || [];
    const totalFromApi = typeof res.total === 'number' ? res.total : docs.length;
    const now = new Date();
    const thisYm = ymFromDate(now);
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastYm = ymFromDate(prev);
    let thisMonth = 0;
    let lastMonth = 0;
    for (const row of docs) {
      const raw = row.checked_in_at;
      if (!raw) continue;
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) continue;
      const rowYm = ymFromDate(d);
      if (rowYm === thisYm) thisMonth += 1;
      if (rowYm === lastYm) lastMonth += 1;
    }
    return {
      thisMonth,
      lastMonth,
      total: totalFromApi,
      monthlyRate: `${((thisMonth / DIAS_UTEIS_MES_REF) * 100).toFixed(0)}%`,
    };
  } catch {
    return empty;
  }
}

async function fetchRecentCheckins(studentId, academyId, limit = 20) {
  if (!ATTENDANCE_COL_ID) return [];
  try {
    const res = await databases.listDocuments(DB_ID, ATTENDANCE_COL_ID, [
      Query.equal('academy_id', academyId),
      Query.or([Query.equal('student_id', studentId), Query.equal('lead_id', studentId)]),
      Query.orderDesc('checked_in_at'),
      Query.limit(limit),
    ]);
    return (res.documents || []).map((row) => ({
      id: row.$id,
      checked_in_at: row.checked_in_at,
      turma: row.turma || row.class_name || null,
    }));
  } catch {
    return [];
  }
}

export default async function portalAttendanceHandler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end();
    return null;
  }

  const me = await ensureAuth(req, res);
  if (!me) return null;

  const studentId = String(req.query?.student_id || '').trim();
  if (!studentId) return json(res, 400, { sucesso: false, erro: 'student_id_required' });

  try {
    const { academyId } = await resolvePortalStudentAccess(databases, me.$id, studentId);
    const [stats, recent] = await Promise.all([
      fetchAttendanceStats(studentId, academyId),
      fetchRecentCheckins(studentId, academyId),
    ]);
    return json(res, 200, { sucesso: true, stats, recent });
  } catch (e) {
    if (e?.code === PORTAL_FORBIDDEN) {
      return json(res, 403, { sucesso: false, erro: 'forbidden' });
    }
    console.error('[portal-attendance]', e?.message || e);
    return json(res, 500, { sucesso: false, erro: 'attendance_failed' });
  }
}
