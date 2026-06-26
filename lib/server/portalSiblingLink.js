import { Query, ID } from 'node-appwrite';
import { Client, Users } from 'node-appwrite';
import {
  DB_ID,
  STUDENT_PORTAL_ACCESS_COL,
  API_KEY,
  ENDPOINT,
  PROJECT_ID,
} from './appwriteCollections.js';
import { listActivePortalAccessForUser } from './portalAccess.js';

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

/**
 * Busca vínculo portal ativo de responsável com o mesmo e-mail na academia.
 * @param {import('node-appwrite').Databases} databases
 */
export async function findGuardianAccessMatch(databases, academyId, email, _cpf = '') {
  if (!STUDENT_PORTAL_ACCESS_COL || !DB_ID) return null;
  const aid = String(academyId || '').trim();
  const e = String(email || '').trim().toLowerCase();
  if (!aid || !e) return null;

  const userId = await findUserIdByEmail(e);
  if (!userId) return null;

  const rows = await listActivePortalAccessForUser(databases, userId);
  const match = rows.find((r) => String(r.academy_id) === aid && String(r.status) === 'active');
  if (!match) return null;

  return { authUserId: userId, access: match, email: e };
}

/**
 * Vincula aluno ao mesmo auth_user_id de um responsável existente.
 * @param {import('node-appwrite').Databases} databases
 */
export async function linkSiblingPortalAccess(databases, { academyId, studentId, authUserId, relationship = 'guardian' }) {
  if (!STUDENT_PORTAL_ACCESS_COL || !DB_ID) {
    throw Object.assign(new Error('portal_not_configured'), { code: 'portal_not_configured' });
  }
  const aid = String(academyId || '').trim();
  const sid = String(studentId || '').trim();
  const uid = String(authUserId || '').trim();
  if (!aid || !sid || !uid) {
    throw Object.assign(new Error('invalid_params'), { code: 'invalid_params' });
  }

  const now = new Date().toISOString();
  const list = await databases.listDocuments(DB_ID, STUDENT_PORTAL_ACCESS_COL, [
    Query.equal('student_id', sid),
    Query.equal('academy_id', aid),
    Query.limit(5),
  ]);
  const existing = (list.documents || []).find((r) => String(r.auth_user_id) === uid);
  const payload = {
    academy_id: aid,
    student_id: sid,
    auth_user_id: uid,
    relationship,
    status: 'active',
    invited_at: existing?.invited_at || now,
    activated_at: now,
    must_change_password: false,
  };

  if (existing) {
    return databases.updateDocument(DB_ID, STUDENT_PORTAL_ACCESS_COL, existing.$id, payload);
  }
  return databases.createDocument(DB_ID, STUDENT_PORTAL_ACCESS_COL, ID.unique(), payload);
}
