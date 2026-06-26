import { Client, Users, ID, Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, databases, resolveAcademyAccess } from './academyAccess.js';
import { assertOrRepairStudentInAcademy } from './studentAcademyRepair.js';
import {
  DB_ID,
  STUDENTS_COL,
  STUDENT_PORTAL_ACCESS_COL,
  PORTAL_INVITES_COL,
  API_KEY,
  ENDPOINT,
  PROJECT_ID,
} from './appwriteCollections.js';
import {
  resolveInviteEmail,
  findPortalAccessByStudent,
  revokePortalAccessForStudent,
} from './portalAccess.js';
import {
  generateInviteToken,
  hashInviteToken,
  buildActivationUrl,
  generateTempPassword,
  inviteExpiresAt,
} from './portalInviteCore.js';
import { mapAppwriteDocToStudent } from '../../src/lib/mapAppwriteStudentDoc.js';
import { findGuardianAccessMatch, linkSiblingPortalAccess } from './portalSiblingLink.js';

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

const usersApi = API_KEY
  ? new Users(new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY))
  : null;

async function findUserIdByEmail(email) {
  if (!usersApi) return null;
  const e = String(email || '').trim().toLowerCase();
  if (!e) return null;
  try {
    const list = await usersApi.list([Query.equal('email', [e]), Query.limit(1)]);
    return list.users?.[0]?.$id || null;
  } catch {
    return null;
  }
}

async function ensureAppwriteUserForInvite(email, tempPassword) {
  const existing = await findUserIdByEmail(email);
  if (existing) return { userId: existing, created: false };
  if (!usersApi) throw new Error('users_api_unavailable');
  const password = tempPassword || generateTempPassword() + 'a1!';
  const user = await usersApi.create(ID.unique(), email, undefined, password, email.split('@')[0] || 'Aluno');
  return { userId: user.$id, created: true, tempPassword: tempPassword || null };
}

async function staffEmailConflict(academyId, inviteEmail) {
  const userId = await findUserIdByEmail(inviteEmail);
  if (!userId) return false;
  const access = await resolveAcademyAccess(academyId, { $id: userId });
  return Boolean(access);
}

async function upsertPortalAccess({ academyId, studentId, authUserId, relationship, status, mustChangePassword }) {
  const existing = (await findPortalAccessByStudent(databases, studentId)) || [];
  const match = existing.find(
    (r) =>
      String(r.auth_user_id) === String(authUserId) &&
      String(r.academy_id) === String(academyId)
  );
  const now = new Date().toISOString();
  const payload = {
    academy_id: academyId,
    student_id: studentId,
    auth_user_id: authUserId,
    relationship,
    status,
    invited_at: match?.invited_at || now,
    activated_at: status === 'active' ? match?.activated_at || now : null,
    must_change_password: mustChangePassword === true,
  };
  if (match) {
    return databases.updateDocument(DB_ID, STUDENT_PORTAL_ACCESS_COL, match.$id, payload);
  }
  return databases.createDocument(DB_ID, STUDENT_PORTAL_ACCESS_COL, ID.unique(), payload);
}

export default async function portalInviteHandler(req, res) {
  if (req.method === 'GET') {
    const me = await ensureAuth(req, res);
    if (!me) return null;
    const access = await ensureAcademyAccess(req, res, me);
    if (!access) return null;
    const studentId = String(req.query?.student_id || '').trim();
    if (!studentId) return json(res, 400, { sucesso: false, erro: 'student_id_required' });
    try {
      await assertOrRepairStudentInAcademy(databases, DB_ID, STUDENTS_COL, studentId, access.academyId);
      const rows = (await findPortalAccessByStudent(databases, studentId)) || [];
      const row = rows.find((r) => String(r.academy_id) === String(access.academyId));
      if (!row) {
        return json(res, 200, { sucesso: true, access_status: 'none' });
      }
      return json(res, 200, {
        sucesso: true,
        access_status: String(row.status || 'pending'),
        relationship: row.relationship || null,
        activated_at: row.activated_at || null,
      });
    } catch (e) {
      console.error('[portal-invite GET]', e?.message || e);
      return json(res, 500, { sucesso: false, erro: 'status_failed' });
    }
  }

  if (req.method === 'DELETE') {
    const me = await ensureAuth(req, res);
    if (!me) return null;
    const access = await ensureAcademyAccess(req, res, me);
    if (!access) return null;
    const body = await readBody(req);
    const studentId = String(body.student_id || req.query?.student_id || '').trim();
    if (!studentId) return json(res, 400, { sucesso: false, erro: 'student_id_required' });
    try {
      await assertOrRepairStudentInAcademy(databases, DB_ID, STUDENTS_COL, studentId, access.academyId);
      await revokePortalAccessForStudent(databases, studentId, 'revoked_by_staff');
      return json(res, 200, { sucesso: true });
    } catch (e) {
      console.error('[portal-invite DELETE]', e?.message || e);
      return json(res, 500, { sucesso: false, erro: 'revoke_failed' });
    }
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end();
    return null;
  }

  const me = await ensureAuth(req, res);
  if (!me) return null;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return null;

  if (!STUDENT_PORTAL_ACCESS_COL || !PORTAL_INVITES_COL) {
    return json(res, 500, { sucesso: false, erro: 'portal_not_configured' });
  }

  const body = await readBody(req);
  const studentId = String(body.student_id || '').trim();
  const inviteType = String(body.invite_type || 'link').trim() === 'temp_password' ? 'temp_password' : 'link';

  if (!studentId) return json(res, 400, { sucesso: false, erro: 'student_id_required' });

  try {
    const doc = await assertOrRepairStudentInAcademy(databases, DB_ID, STUDENTS_COL, studentId, access.academyId);
    const student = mapAppwriteDocToStudent(doc);
    const { email, relationship } = resolveInviteEmail(student);

    if (await staffEmailConflict(access.academyId, email)) {
      return json(res, 409, { sucesso: false, erro: 'staff_email_conflict' });
    }

    const guardianMatch = await findGuardianAccessMatch(databases, access.academyId, email);
    if (guardianMatch) {
      await linkSiblingPortalAccess(databases, {
        academyId: access.academyId,
        studentId,
        authUserId: guardianMatch.authUserId,
        relationship,
      });
      return json(res, 200, {
        sucesso: true,
        access_status: 'active',
        email,
        relationship,
        linked_sibling: true,
      });
    }

    const tempPassword = inviteType === 'temp_password' ? generateTempPassword() : null;
    const { userId, tempPassword: issuedPassword } = await ensureAppwriteUserForInvite(
      email,
      tempPassword
    );

    const token = generateInviteToken();
    const tokenHash = hashInviteToken(token);
    const now = new Date().toISOString();

    await upsertPortalAccess({
      academyId: access.academyId,
      studentId,
      authUserId: userId,
      relationship,
      status: inviteType === 'temp_password' ? 'active' : 'pending',
      mustChangePassword: inviteType === 'temp_password',
    });

    await databases.createDocument(DB_ID, PORTAL_INVITES_COL, ID.unique(), {
      academy_id: access.academyId,
      student_id: studentId,
      email,
      invite_type: inviteType,
      token_hash: tokenHash,
      expires_at: inviteExpiresAt(7),
      used_at: inviteType === 'temp_password' ? now : null,
      created_by_user_id: me.$id,
      status: inviteType === 'temp_password' ? 'used' : 'pending',
    });

    const response = {
      sucesso: true,
      access_status: inviteType === 'temp_password' ? 'active' : 'pending',
      email,
      relationship,
    };

    if (inviteType === 'link') {
      response.activation_url = buildActivationUrl(token);
    } else {
      response.temp_password = issuedPassword || tempPassword;
      response.activation_url = null;
    }

    return json(res, 200, response);
  } catch (e) {
    const code = String(e?.code || e?.message || '');
    if (code === 'guardian_email_required' || code === 'student_email_required') {
      return json(res, 400, { sucesso: false, erro: code });
    }
    console.error('[portal-invite POST]', e?.message || e);
    return json(res, 500, { sucesso: false, erro: 'invite_failed' });
  }
}
