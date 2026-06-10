import { useEffect, useState } from 'react';
import { teams } from './appwrite.js';
import { useLeadStore } from '../store/useLeadStore.js';

/** Titular (ownerId) ou membro do time com papel admin/owner. */
export function canManageStudentPayments(userId, academyDoc, membership = null) {
  if (!academyDoc || !userId) return false;
  if (String(academyDoc.ownerId || '').trim() === String(userId || '').trim()) return true;
  const roles = Array.isArray(membership?.roles) ? membership.roles : [];
  return roles.includes('admin') || roles.includes('owner');
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

  return canManageStudentPayments(userId, academyDoc, membership);
}
