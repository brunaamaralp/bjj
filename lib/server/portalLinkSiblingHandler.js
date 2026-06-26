import { ensureAuth, ensureAcademyAccess, databases } from './academyAccess.js';
import { assertOrRepairStudentInAcademy } from './studentAcademyRepair.js';
import { DB_ID, STUDENTS_COL } from './appwriteCollections.js';
import { findGuardianAccessMatch, linkSiblingPortalAccess } from './portalSiblingLink.js';
import { mapAppwriteDocToStudent } from '../../src/lib/mapAppwriteStudentDoc.js';
import { resolveInviteEmail } from './portalAccess.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

export default async function portalLinkSiblingHandler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end();
    return null;
  }

  const me = await ensureAuth(req, res);
  if (!me) return null;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return null;

  const body = await readBody(req);
  const studentId = String(body.student_id || '').trim();
  if (!studentId) return json(res, 400, { sucesso: false, erro: 'student_id_required' });

  try {
    const doc = await assertOrRepairStudentInAcademy(
      databases,
      DB_ID,
      STUDENTS_COL,
      studentId,
      access.academyId
    );
    const student = mapAppwriteDocToStudent(doc);
    const { email, relationship } = resolveInviteEmail(student);
    const match = await findGuardianAccessMatch(databases, access.academyId, email);
    if (!match) {
      return json(res, 404, { sucesso: false, erro: 'guardian_access_not_found' });
    }

    await linkSiblingPortalAccess(databases, {
      academyId: access.academyId,
      studentId,
      authUserId: match.authUserId,
      relationship,
    });

    return json(res, 200, { sucesso: true, access_status: 'active', email });
  } catch (e) {
    const code = String(e?.code || e?.message || '');
    if (code === 'guardian_email_required' || code === 'student_email_required') {
      return json(res, 400, { sucesso: false, erro: code });
    }
    console.error('[portal-link-sibling]', e?.message || e);
    return json(res, 500, { sucesso: false, erro: 'link_failed' });
  }
}
