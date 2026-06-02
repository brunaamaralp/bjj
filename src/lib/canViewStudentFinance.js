import { useEffect, useState } from 'react';
import { teams } from './appwrite.js';
import { useLeadStore } from '../store/useLeadStore.js';

/**
 * Financeiro no perfil do aluno: titular (ownerId) ou admin do time.
 * Recepcionista (member) não vê valores, histórico de pagamentos nem vendas.
 */
export function canViewStudentFinance(userId, academyDoc, membership = null) {
  if (!academyDoc || !userId) return false;
  if (String(academyDoc.ownerId || '').trim() === String(userId || '').trim()) return true;
  const roles = Array.isArray(membership?.roles) ? membership.roles : [];
  return roles.includes('admin') || roles.includes('owner');
}

export function useCanViewStudentFinance(academyDoc) {
  const userId = useLeadStore((s) => s.userId);
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const resolvedDoc =
    academyDoc ||
    (academyList || []).find((a) => a.id === academyId) ||
    null;
  const [membership, setMembership] = useState(null);

  useEffect(() => {
    if (!resolvedDoc?.teamId || !userId) {
      setMembership(null);
      return;
    }
    if (String(resolvedDoc.ownerId || '') === String(userId)) {
      setMembership(null);
      return;
    }
    teams
      .listMemberships(resolvedDoc.teamId)
      .then((res) => {
        const m = (res.memberships || []).find((x) => String(x.userId) === String(userId));
        setMembership(m || null);
      })
      .catch(() => setMembership(null));
  }, [resolvedDoc?.teamId, resolvedDoc?.ownerId, userId]);

  return canViewStudentFinance(userId, resolvedDoc, membership);
}
