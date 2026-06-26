import { Query } from 'node-appwrite';
import { ensureAuth, databases } from './academyAccess.js';
import {
  DB_ID,
  STUDENTS_COL,
  ACADEMIES_COL,
  STUDENT_PORTAL_ACCESS_COL,
} from './appwriteCollections.js';
import { listActivePortalAccessForUser } from './portalAccess.js';
import { mapAppwriteDocToStudent } from '../../src/lib/mapAppwriteStudentDoc.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export default async function portalContextHandler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end();
    return null;
  }

  const me = await ensureAuth(req, res);
  if (!me) return null;

  if (!STUDENT_PORTAL_ACCESS_COL) {
    return json(res, 500, { sucesso: false, erro: 'portal_not_configured' });
  }

  try {
    const rows = await listActivePortalAccessForUser(databases, me.$id);
    if (!rows.length) {
      return json(res, 403, { sucesso: false, erro: 'no_portal_access' });
    }

    const byAcademy = new Map();
    for (const row of rows) {
      const aid = String(row.academy_id || '').trim();
      if (!aid) continue;
      if (!byAcademy.has(aid)) byAcademy.set(aid, []);
      byAcademy.get(aid).push(row);
    }

    const academyId = String(req.query?.academy_id || [...byAcademy.keys()][0] || '').trim();
    const academyRows = byAcademy.get(academyId) || rows.filter((r) => String(r.academy_id) === academyId);

    let academy = null;
    if (ACADEMIES_COL && academyId) {
      try {
        const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        academy = {
          id: doc.$id,
          name: doc.name || '',
          phone: doc.phone || '',
        };
      } catch {
        void 0;
      }
    }

    const students = [];
    for (const row of academyRows) {
      if (!STUDENTS_COL) continue;
      try {
        const doc = await databases.getDocument(DB_ID, STUDENTS_COL, row.student_id);
        const mapped = mapAppwriteDocToStudent(doc);
        students.push({
          id: mapped.id,
          name: mapped.name,
          turma: mapped.turma,
          belt: mapped.belt,
          relationship: row.relationship,
          must_change_password: row.must_change_password === true,
        });
      } catch {
        void 0;
      }
    }

    const activeStudentId =
      String(req.query?.student_id || '').trim() ||
      students[0]?.id ||
      null;

    return json(res, 200, {
      sucesso: true,
      academy_id: academyId,
      academy,
      students,
      active_student_id: activeStudentId,
      academies: [...byAcademy.keys()],
    });
  } catch (e) {
    console.error('[portal-context]', e?.message || e);
    return json(res, 500, { sucesso: false, erro: 'context_failed' });
  }
}
