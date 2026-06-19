import React, { useMemo } from 'react';
import { useLeadStore } from '../../store/useLeadStore';
import { useUserRole } from '../../lib/useUserRole.js';
import WhatsAppConnectionPanel from './WhatsAppConnectionPanel.jsx';

export default function IntegracoesWhatsAppSection({ academyId, embeddedInLayout = false }) {
  const academyList = useLeadStore((s) => s.academyList);
  const academyDoc = useMemo(() => {
    const arr = Array.isArray(academyList) ? academyList : [];
    return arr.find((a) => a.id === academyId) || { ownerId: '', teamId: '' };
  }, [academyList, academyId]);
  const role = useUserRole(academyDoc);
  const isOwner = role === 'owner';

  if (!academyId) {
    return (
      <p className="text-small text-muted">Selecione uma academia para configurar o WhatsApp.</p>
    );
  }

  return (
    <div className={embeddedInLayout ? '' : 'integracoes-wa-section'}>
      <WhatsAppConnectionPanel academyId={academyId} isOwner={isOwner} />
    </div>
  );
}
