import React, { useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useLeadStore } from '../../store/useLeadStore';
import { useUserRole } from '../../lib/useUserRole';
import Finance from '../../pages/Finance';

/** Rota /finance (Contabilidade): apenas dono da academia; demais perfis vão para /caixa. */
export default function RequireFinanceOwner() {
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const academy = useMemo(() => {
    if (!academyId) return null;
    const a = (academyList || []).find((x) => x.id === academyId);
    if (!a) return null;
    return { ownerId: String(a.ownerId || ''), teamId: String(a.teamId || '') };
  }, [academyList, academyId]);
  const role = useUserRole(academy);
  if (role !== 'owner') {
    return <Navigate to="/caixa" replace />;
  }
  return <Finance />;
}
