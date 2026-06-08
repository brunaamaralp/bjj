import { Permission, Role } from 'appwrite';

export class LeadPermissionError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'LeadPermissionError';
    this.code = code;
  }
}

/**
 * Permissões estritas para leads — exige teamId, sem fallback Role.users().
 * @param {{ teamId?: string; userId?: string }} opts
 */
export function buildLeadDocumentPermissions({ teamId = '', userId = '' } = {}) {
  const tid = String(teamId || '').trim();
  if (!tid) {
    throw new LeadPermissionError(
      'team_not_configured',
      'Academia sem time configurado. Configure o time em Configurações da academia.'
    );
  }
  return buildClientDocumentPermissions({ teamId: tid, userId, allowUsersFallback: false });
}

/**
 * Permissões de documento que o SDK web (sessão JWT) pode atribuir no create.
 * Não use Role.user(ownerId) com ownerId ≠ usuário logado — o Appwrite rejeita o create.
 *
 * Além disso, na collection (Console): habilite **Create** (e Read) para "Users"
 * em `lead_events` e em `leads` se ainda não estiver.
 */
export function buildClientDocumentPermissions({ teamId = '', userId = '', allowUsersFallback = true } = {}) {
  const perms = [];
  const tid = String(teamId || '').trim();
  const uid = String(userId || '').trim();

  if (tid) {
    perms.push(
      Permission.read(Role.team(tid)),
      Permission.update(Role.team(tid)),
      Permission.delete(Role.team(tid))
    );
  }
  if (uid) {
    perms.push(
      Permission.read(Role.user(uid)),
      Permission.update(Role.user(uid)),
      Permission.delete(Role.user(uid))
    );
  }
  if (perms.length === 0) {
    if (!allowUsersFallback) {
      throw new LeadPermissionError(
        'permissions_unavailable',
        'Não foi possível definir permissões para o documento.'
      );
    }
    perms.push(
      Permission.read(Role.users()),
      Permission.update(Role.users()),
      Permission.delete(Role.users())
    );
  }
  return perms;
}
