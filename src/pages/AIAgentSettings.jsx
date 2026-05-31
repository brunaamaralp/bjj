import React, { useMemo } from 'react';
import { useLeadStore } from '../store/useLeadStore';
import { useUserRole } from '../lib/useUserRole';
import AgenteIASection from '../components/academy/AgenteIASection';

export default function AIAgentSettings() {
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const academyDoc = useMemo(() => {
    const arr = Array.isArray(academyList) ? academyList : [];
    return arr.find((a) => a.id === academyId) || { ownerId: '', teamId: '' };
  }, [academyList, academyId]);
  const role = useUserRole(academyDoc);

  return (
    <div className="container navi-hub-page">
      <AgenteIASection academyId={academyId} role={role} academyDoc={academyDoc} showPageHeader />
    </div>
  );
}
