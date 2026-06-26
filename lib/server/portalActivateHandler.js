import { Query, ID } from 'node-appwrite';
import { databases } from './academyAccess.js';
import { DB_ID, PORTAL_INVITES_COL, STUDENT_PORTAL_ACCESS_COL } from './appwriteCollections.js';
import { hashInviteToken } from './portalInviteCore.js';
import { findPortalAccessByStudent } from './portalAccess.js';

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

export default async function portalActivateHandler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end();
    return null;
  }

  if (!PORTAL_INVITES_COL || !STUDENT_PORTAL_ACCESS_COL) {
    return json(res, 500, { sucesso: false, erro: 'portal_not_configured' });
  }

  const body = await readBody(req);
  const token = String(body.token || req.query?.token || '').trim();
  if (!token) return json(res, 400, { sucesso: false, erro: 'token_required' });

  const tokenHash = hashInviteToken(token);
  const list = await databases.listDocuments(DB_ID, PORTAL_INVITES_COL, [
    Query.equal('token_hash', tokenHash),
    Query.limit(1),
  ]);
  const invite = list.documents?.[0];
  if (!invite) return json(res, 404, { sucesso: false, erro: 'invalid_token' });
  if (String(invite.status) === 'used') {
    return json(res, 409, { sucesso: false, erro: 'token_already_used' });
  }
  if (new Date(invite.expires_at) < new Date()) {
    return json(res, 410, { sucesso: false, erro: 'token_expired' });
  }

  const now = new Date().toISOString();
  const studentId = String(invite.student_id || '').trim();
  const academyId = String(invite.academy_id || '').trim();

  const accessRows = (await findPortalAccessByStudent(databases, studentId)) || [];
  const access = accessRows.find((r) => String(r.academy_id) === academyId);
  if (access) {
    await databases.updateDocument(DB_ID, STUDENT_PORTAL_ACCESS_COL, access.$id, {
      status: 'active',
      activated_at: now,
    });
  }

  await databases.updateDocument(DB_ID, PORTAL_INVITES_COL, invite.$id, {
    status: 'used',
    used_at: now,
  });

  return json(res, 200, {
    sucesso: true,
    next: 'login',
    email: invite.email,
    student_id: studentId,
    academy_id: academyId,
  });
}
