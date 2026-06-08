import { Permission, Role } from 'node-appwrite';

export class AcademyPermissionError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'AcademyPermissionError';
    this.code = code;
  }
}

/**
 * Permissões de documento restritas a owner + team da academia.
 * Sem fallback Role.users() — exige teamId quando requireTeam=true.
 *
 * @param {object} academyDoc
 * @param {{ requireTeam?: boolean }} [opts]
 * @returns {import('node-appwrite').Permission[]}
 */
export function buildAcademyDocumentPermissions(academyDoc, { requireTeam = true } = {}) {
  const ownerId = String(academyDoc?.ownerId || '').trim();
  const teamId = String(academyDoc?.teamId || academyDoc?.team_id || '').trim();
  const perms = [];

  if (ownerId) {
    perms.push(
      Permission.read(Role.user(ownerId)),
      Permission.update(Role.user(ownerId)),
      Permission.delete(Role.user(ownerId))
    );
  }
  if (teamId) {
    perms.push(
      Permission.read(Role.team(teamId)),
      Permission.update(Role.team(teamId)),
      Permission.delete(Role.team(teamId))
    );
  }

  if (requireTeam && !teamId) {
    throw new AcademyPermissionError(
      'team_not_configured',
      'Academia sem time configurado. Configure o time em Configurações da academia.'
    );
  }
  if (perms.length === 0) {
    throw new AcademyPermissionError(
      'permissions_unavailable',
      'Não foi possível definir permissões para o documento.'
    );
  }
  return perms;
}
