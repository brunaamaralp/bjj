import React, { useMemo, Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import { useLeadStore } from '../../store/useLeadStore';
import { useUserRole } from '../../lib/useUserRole';
import RouteFallback from '../shared/RouteFallback.jsx';

import { lazyWithRetry } from '../../lib/lazyWithRetry.js';

const Finance = lazyWithRetry(() => import('../../pages/Finance'));

/** Legado: redireciona para /caixa (abas owner ficam no hub Caixa). */
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
  return (
    <Suspense fallback={<RouteFallback />}>
      <Finance />
    </Suspense>
  );
}
