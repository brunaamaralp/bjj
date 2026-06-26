import { Query } from 'node-appwrite';
import { ensureAuth, databases } from './academyAccess.js';
import { DB_ID, STUDENTS_COL } from './appwriteCollections.js';
import { resolvePortalStudentAccess, PORTAL_FORBIDDEN } from './portalAccess.js';
import { mapAppwriteDocToStudent } from '../../src/lib/mapAppwriteStudentDoc.js';

const PORTAL_STUDENT_FIELDS = [
  'id',
  'name',
  'email',
  'phone',
  'type',
  'turma',
  'belt',
  'plan',
  'birthDate',
  'responsavel',
  'studentStatus',
  'enrollmentDate',
];

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function pickPortalStudentFields(student) {
  const out = {};
  for (const key of PORTAL_STUDENT_FIELDS) {
    if (student[key] !== undefined) out[key] = student[key];
  }
  return out;
}

export default async function portalProfileHandler(req, res) {
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
    if (!STUDENTS_COL) return json(res, 500, { sucesso: false, erro: 'students_not_configured' });

    const doc = await databases.getDocument(DB_ID, STUDENTS_COL, studentId);
    if (String(doc.academyId || doc.academy_id || '') !== String(academyId)) {
      return json(res, 403, { sucesso: false, erro: 'forbidden' });
    }

    const student = pickPortalStudentFields(mapAppwriteDocToStudent(doc));
    return json(res, 200, { sucesso: true, student, academy_id: academyId });
  } catch (e) {
    if (e?.code === PORTAL_FORBIDDEN) {
      return json(res, 403, { sucesso: false, erro: 'forbidden' });
    }
    console.error('[portal-profile]', e?.message || e);
    return json(res, 500, { sucesso: false, erro: 'profile_failed' });
  }
}
