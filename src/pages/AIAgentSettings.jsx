import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
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
    <div className="container" style={{ paddingTop: 20, paddingBottom: 30 }}>
      <div className="animate-in">
        <Link
          to="/inbox"
          className="edit-link"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10, textDecoration: 'none' }}
        >
          <ChevronLeft size={18} strokeWidth={2} aria-hidden />
          Voltar para conversas
        </Link>
        <h2 className="navi-page-title">Agente IA</h2>
        <p className="navi-eyebrow" style={{ marginTop: 6 }}>Configuração dedicada do agente</p>
      </div>
      <AgenteIASection academyId={academyId} role={role} />
    </div>
  );
}
