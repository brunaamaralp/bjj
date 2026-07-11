import { useEffect, useState } from 'react';
import { teams } from './appwrite.js';
import { useLeadStore } from '../store/useLeadStore.js';

/** Titular (ownerId) ou membro do time com papel admin/owner. */
function teamHasAdminRole(roles) {
  if (!Array.isArray(roles)) return false;
  return roles.some((r) => {
    const role = String(r || '').trim().toLowerCase();
    return role === 'admin' || role === 'administrador' || role === 'owner';
  });
}

export function canManageStudentPayments(userId, academyDoc, membership = null) {
  if (!academyDoc || !userId) return false;
  if (String(academyDoc.ownerId || '').trim() === String(userId || '').trim()) return true;
  const roles = Array.isArray(membership?.roles) ? membership.roles : [];
  return teamHasAdminRole(roles);
}

export function useCanManageStudentPayments(academyDoc) {
  const userId = useLeadStore((s) => s.userId);
  const teamId = academyDoc?.teamId;
  const isOwner = String(academyDoc?.ownerId || '') === String(userId || '');
  const shouldFetch = Boolean(teamId && userId && !isOwner);
  const fetchKey = shouldFetch ? `${teamId}:${userId}` : '';
  const [membershipState, setMembershipState] = useState({ key: '', value: null });

  useEffect(() => {
    if (!shouldFetch) return undefined;
    let cancelled = false;
    teams
      .listMemberships(teamId)
      .then((res) => {
        if (cancelled) return;
        const m = (res.memberships || []).find((x) => String(x.userId) === String(userId));
        setMembershipState({ key: fetchKey, value: m || null });
      })
      .catch(() => {
        if (!cancelled) setMembershipState({ key: fetchKey, value: null });
      });
    return () => {
      cancelled = true;
    };
  }, [shouldFetch, teamId, userId, fetchKey]);

  const membership =
    membershipState.key === fetchKey ? membershipState.value : null;
  const membershipResolved = !shouldFetch || membershipState.key === fetchKey;

  const canManage = membershipResolved
    ? canManageStudentPayments(userId, academyDoc, membership)
    : false;

  return canManage;
}

/** Mesma regra do servidor em alterar_item / cancelar venda (titular ou admin do time). */
export const canManageAcademySales = canManageStudentPayments;
export const useCanManageAcademySales = useCanManageStudentPayments;
