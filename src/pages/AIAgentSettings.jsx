import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useLeadStore } from '../store/useLeadStore';
import { useUserRole } from '../lib/useUserRole';
import AgenteIASection from '../components/academy/AgenteIASection';
import PageHeader from '../components/layout/PageHeader.jsx';

export default function AIAgentSettings() {
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const academyDoc = useMemo(() => {
    const arr = Array.isArray(academyList) ? academyList : [];
    return arr.find((a) => a.id === academyId) || { ownerId: '', teamId: '' };
  }, [academyList, academyId]);
  const role = useUserRole(academyDoc);

  return (
    <div className="container navi-hub-page" style={{ paddingTop: 20, paddingBottom: 30 }}>
      <PageHeader
        title="Agente de atendimento"
        subtitle="Defina respostas automáticas no WhatsApp."
        prefix={
          <Link
            to="/inbox"
            className="edit-link"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10, textDecoration: 'none' }}
          >
            <ChevronLeft size={18} strokeWidth={2} aria-hidden />
            Voltar para conversas
          </Link>
        }
      />
      <AgenteIASection academyId={academyId} role={role} academyDoc={academyDoc} />
    </div>
  );
}
