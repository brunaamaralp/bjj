import { membershipRoleDisplayLabel } from './teamMembershipLabel.js';

/** Papel interno: owner | admin | receptionist */
export function membershipTeamRole(m, academyOwnerId) {
  const roles = Array.isArray(m?.roles) ? m.roles : [];
  const userId = String(m?.userId || '').trim();
  const ownerId = String(academyOwnerId || '').trim();
  if (roles.includes('owner') || (ownerId && userId && userId === ownerId)) return 'owner';
  if (roles.includes('admin')) return 'admin';
  return 'receptionist';
}

export function roleLabelPt(role) {
  if (role === 'admin') return 'Administrador';
  if (role === 'receptionist') return 'Recepcionista';
  if (role === 'owner') return 'Titular';
  return role;
}

export function appwriteRolesForTeamRole(teamRole) {
  if (teamRole === 'admin') return ['admin'];
  return ['member'];
}

export function teamRoleFromBody(role) {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'admin' || r === 'administrador') return 'admin';
  return 'receptionist';
}

export function canViewTeamManagement(actorRole) {
  return actorRole === 'owner' || actorRole === 'admin';
}

export function canAddTeamMember(actorRole, newTeamRole) {
  if (actorRole === 'owner') return newTeamRole !== 'owner';
  if (actorRole === 'admin') return newTeamRole === 'receptionist';
  return false;
}

export function canEditTeamMember(actorRole, targetRole, actorUserId, targetUserId) {
  if (!canViewTeamManagement(actorRole)) return false;
  if (targetRole === 'owner') return false;
  if (actorRole === 'admin') {
    if (targetRole !== 'receptionist') return false;
    if (String(actorUserId) === String(targetUserId)) return false;
    return true;
  }
  return actorRole === 'owner';
}

export function canRemoveTeamMember(actorRole, targetRole, actorUserId, targetUserId) {
  if (!canEditTeamMember(actorRole, targetRole, actorUserId, targetUserId)) return false;
  if (String(actorUserId) === String(targetUserId)) return false;
  return true;
}

export function canResetTeamPassword(actorRole, targetRole, actorUserId, targetUserId) {
  if (!canEditTeamMember(actorRole, targetRole, actorUserId, targetUserId)) return false;
  if (String(actorUserId) === String(targetUserId)) return false;
  return Boolean(String(targetUserId || '').trim());
}

export function canEditField(actorRole, targetRole, field, actorUserId, targetUserId) {
  if (field === 'role') {
    if (actorRole === 'admin') return false;
    if (targetRole === 'owner') return false;
    return actorRole === 'owner';
  }
  return canEditTeamMember(actorRole, targetRole, actorUserId, targetUserId);
}

export function resolveActorRoleFromMemberships(memberships, academy, userId) {
  const uid = String(userId || '').trim();
  if (!uid || !academy) return 'guest';
  if (String(academy.ownerId || '') === uid) return 'owner';
  const m = (memberships || []).find((x) => String(x.userId || '') === uid);
  if (!m) return 'guest';
  return membershipTeamRole(m, academy.ownerId);
}

export function memberDisplayRole(m, academyOwnerId) {
  return membershipRoleDisplayLabel(m, academyOwnerId);
}
