import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';
import { ensurePortalToken } from './ensurePortalToken.js';

/**
 * Auth staff (Appwrite JWT) ou portal token do aluno para rotas PagBank.
 * @returns {Promise<{ academyId: string, studentContext: object | null } | null>}
 */
export async function resolvePagbankRequestAuth(req, res) {
  const portal = await ensurePortalToken(req, null);

  if (portal.payload) {
    return {
      academyId: String(portal.payload.academy_id || '').trim(),
      studentContext: portal.payload,
    };
  }

  if (portal.hadToken && portal.error) {
    res.status(401).json({ error: portal.error });
    return null;
  }

  const me = await ensureAuth(req, res);
  if (!me) return null;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return null;

  return {
    academyId: access.academyId,
    studentContext: null,
  };
}
