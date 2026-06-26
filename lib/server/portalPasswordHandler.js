import { ensureAuth, databases } from './academyAccess.js';
import { DB_ID, STUDENT_PORTAL_ACCESS_COL } from './appwriteCollections.js';
import { resolvePortalStudentAccess, PORTAL_FORBIDDEN } from './portalAccess.js';

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

/** Limpa flag must_change_password após troca de senha no cliente. */
export default async function portalPasswordHandler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end();
    return null;
  }

  const me = await ensureAuth(req, res);
  if (!me) return null;

  const body = await readBody(req);
  const studentId = String(body.student_id || req.query?.student_id || '').trim();
  if (!studentId) return json(res, 400, { sucesso: false, erro: 'student_id_required' });

  if (!STUDENT_PORTAL_ACCESS_COL) {
    return json(res, 500, { sucesso: false, erro: 'portal_not_configured' });
  }

  try {
    const { access } = await resolvePortalStudentAccess(databases, me.$id, studentId);
    await databases.updateDocument(DB_ID, STUDENT_PORTAL_ACCESS_COL, access.$id, {
      must_change_password: false,
    });
    return json(res, 200, { sucesso: true });
  } catch (e) {
    if (e?.code === PORTAL_FORBIDDEN) {
      return json(res, 403, { sucesso: false, erro: 'forbidden' });
    }
    console.error('[portal-password]', e?.message || e);
    return json(res, 500, { sucesso: false, erro: 'password_flag_failed' });
  }
}
