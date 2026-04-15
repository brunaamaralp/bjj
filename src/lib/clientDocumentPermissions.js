import { Permission, Role } from 'appwrite';

/**
 * Permissões de documento que o SDK web (sessão JWT) pode atribuir no create.
 * Não use Role.user(ownerId) com ownerId ≠ usuário logado — o Appwrite rejeita o create.
 *
 * Além disso, na collection (Console): habilite **Create** (e Read) para "Users"
 * em `lead_events` e em `leads` se ainda não estiver.
 */
export function buildClientDocumentPermissions({ teamId = '', userId = '' } = {}) {
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
    perms.push(
      Permission.read(Role.users()),
      Permission.update(Role.users()),
      Permission.delete(Role.users())
    );
  }
  return perms;
}
