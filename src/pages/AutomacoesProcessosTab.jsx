import React from 'react';
import { useLeadStore } from '../store/useLeadStore';
import TaskTemplatesSection from '../components/academy/TaskTemplatesSection.jsx';

/** Aba Processos em Automações — hospeda TaskTemplatesSection sem alterar o componente. */
export default function AutomacoesProcessosTab() {
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const academy = React.useMemo(() => {
    const arr = Array.isArray(academyList) ? academyList : [];
    return arr.find((a) => a.id === academyId) || null;
  }, [academyList, academyId]);

  if (!academyId) {
    return <p className="text-small text-muted">Selecione uma academia para configurar processos.</p>;
  }

  return <TaskTemplatesSection academyId={academyId} teamId={academy?.teamId || ''} />;
}
