import React, { useMemo } from 'react';
import { useLeadStore } from '../store/useLeadStore';
import TaskTemplatesSection from '../components/academy/TaskTemplatesSection.jsx';
import EnrollmentFollowUpSection from '../components/academy/EnrollmentFollowUpSection.jsx';
import FollowupPlaybookSection from '../components/academy/FollowupPlaybookSection.jsx';

/** Aba Processos em Automações — templates e aviso de tarefa legada pós-matrícula. */
export default function AutomacoesProcessosTab() {
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const academy = useMemo(() => {
    const arr = Array.isArray(academyList) ? academyList : [];
    return arr.find((a) => a.id === academyId) || null;
  }, [academyList, academyId]);

  if (!academyId) {
    return <p className="text-small text-muted">Selecione uma academia para configurar processos.</p>;
  }

  return (
    <>
      <TaskTemplatesSection academyId={academyId} teamId={academy?.teamId || ''} />
      <FollowupPlaybookSection academyId={academyId} />
      <EnrollmentFollowUpSection academyId={academyId} />
    </>
  );
}
