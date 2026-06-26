import { databases, DB_ID, ACADEMIES_COL, teams } from './appwrite';
import { Query } from 'appwrite';
import { fetchPortalContext } from './portalApi';

/**
 * Conta academias em que o usuário é dono ou membro de equipe (acesso staff).
 */
export async function countStaffAcademies(userId) {
  const uid = String(userId || '').trim();
  if (!uid) return 0;

  let list = [];
  try {
    const res = await databases.listDocuments(DB_ID, ACADEMIES_COL, [
      Query.equal('ownerId', [uid]),
      Query.limit(50),
    ]);
    list = res.documents || [];
  } catch {
    void 0;
  }

  if (list.length === 0) {
    try {
      const memberships = await teams.list();
      const teamIds = (memberships.teams || []).map((m) => m.$id);
      if (teamIds.length > 0) {
        const memberOf = await databases.listDocuments(DB_ID, ACADEMIES_COL, [
          Query.equal('teamId', teamIds),
          Query.limit(50),
        ]);
        list = memberOf.documents || [];
      }
    } catch {
      void 0;
    }
  }

  return list.length;
}

/** Usuário com portal ativo e sem academia staff. */
export async function probePortalOnlyUser(userId) {
  const staffCount = await countStaffAcademies(userId);
  if (staffCount > 0) return { portalOnly: false, staffCount };
  try {
    await fetchPortalContext();
    return { portalOnly: true, staffCount: 0 };
  } catch {
    return { portalOnly: false, staffCount: 0 };
  }
}

/**
 * Decide destino pós-login para usuários sem rota /portal explícita.
 */
export function resolvePostLoginPath({ portalOnly, requestedPath = '/' }) {
  if (portalOnly) return '/portal';
  if (/^\/portal(\/|$)/.test(requestedPath)) return requestedPath;
  return requestedPath || '/';
}
