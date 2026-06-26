import { Query } from 'node-appwrite';
import { DB_ID, STUDENT_PORTAL_ACCESS_COL } from './appwriteCollections.js';

const FORBIDDEN = 'FORBIDDEN';

function forbidden() {
  const err = new Error(FORBIDDEN);
  err.code = FORBIDDEN;
  return err;
}

/**
 * @param {object} student — doc ou objeto UI
 */
export function resolveInviteEmail(student) {
  const type = String(student?.type || 'Adulto').trim() || 'Adulto';
  const minor = type === 'Criança' || type === 'Juniores';
  if (minor) {
    const email = String(student?.email_responsavel || student?.emailResponsavel || '')
      .trim()
      .toLowerCase();
    if (!email) {
      const err = new Error('guardian_email_required');
      err.code = 'guardian_email_required';
      throw err;
    }
    return { email, relationship: 'guardian' };
  }
  const email = String(student?.email || '').trim().toLowerCase();
  if (!email) {
    const err = new Error('student_email_required');
    err.code = 'student_email_required';
    throw err;
  }
  return { email, relationship: 'self' };
}

/**
 * @param {import('node-appwrite').Databases} db
 */
export async function assertPortalAccess(db, authUserId, academyId, studentId) {
  if (!STUDENT_PORTAL_ACCESS_COL || !DB_ID) throw forbidden();
  const uid = String(authUserId || '').trim();
  const aid = String(academyId || '').trim();
  const sid = String(studentId || '').trim();
  if (!uid || !aid || !sid) throw forbidden();

  const list = await db.listDocuments(DB_ID, STUDENT_PORTAL_ACCESS_COL, [
    Query.equal('auth_user_id', uid),
    Query.equal('academy_id', aid),
    Query.equal('student_id', sid),
    Query.equal('status', 'active'),
    Query.limit(1),
  ]);
  const doc = list.documents?.[0];
  if (!doc) throw forbidden();
  return doc;
}

/**
 * @param {import('node-appwrite').Databases} db
 */
export async function listActivePortalAccessForUser(db, authUserId) {
  if (!STUDENT_PORTAL_ACCESS_COL || !DB_ID) return [];
  const uid = String(authUserId || '').trim();
  if (!uid) return [];
  const list = await db.listDocuments(DB_ID, STUDENT_PORTAL_ACCESS_COL, [
    Query.equal('auth_user_id', uid),
    Query.equal('status', 'active'),
    Query.limit(100),
  ]);
  return list.documents || [];
}

/**
 * @param {import('node-appwrite').Databases} db
 */
export async function findPortalAccessByStudent(db, studentId) {
  if (!STUDENT_PORTAL_ACCESS_COL || !DB_ID) return null;
  const sid = String(studentId || '').trim();
  if (!sid) return null;
  const list = await db.listDocuments(DB_ID, STUDENT_PORTAL_ACCESS_COL, [
    Query.equal('student_id', sid),
    Query.limit(5),
  ]);
  return list.documents || [];
}

/**
 * @param {import('node-appwrite').Databases} db
 */
export async function revokePortalAccessForStudent(db, studentId, reason = 'student_deactivated') {
  const rows = await findPortalAccessByStudent(db, studentId);
  const now = new Date().toISOString();
  for (const row of rows) {
    if (String(row.status || '') === 'revoked') continue;
    await db.updateDocument(DB_ID, STUDENT_PORTAL_ACCESS_COL, row.$id, {
      status: 'revoked',
      revoked_at: now,
      revoked_reason: String(reason || '').slice(0, 128),
    });
  }
}

/**
 * Resolve vínculo portal ativo para aluno + usuário autenticado.
 * @param {import('node-appwrite').Databases} db
 */
export async function resolvePortalStudentAccess(db, authUserId, studentId) {
  const sid = String(studentId || '').trim();
  if (!sid) throw forbidden();
  const rows = await listActivePortalAccessForUser(db, authUserId);
  const row = rows.find((r) => String(r.student_id) === sid);
  if (!row) throw forbidden();
  return { access: row, academyId: String(row.academy_id || '').trim() };
}

export { FORBIDDEN as PORTAL_FORBIDDEN };
