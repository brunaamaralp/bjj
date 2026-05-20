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
  const [membership, setMembership] = useState(null);

  useEffect(() => {
    if (!academyDoc?.teamId || !userId) {
      setMembership(null);
      return;
    }
    if (String(academyDoc.ownerId || '') === String(userId)) {
      setMembership(null);
      return;
    }
    teams
      .listMemberships(academyDoc.teamId)
      .then((res) => {
        const m = (res.memberships || []).find((x) => String(x.userId) === String(userId));
        setMembership(m || null);
      })
      .catch(() => setMembership(null));
  }, [academyDoc?.teamId, academyDoc?.ownerId, userId]);

  return canManageStudentPayments(userId, academyDoc, membership);
}
