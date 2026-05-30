import React, { useEffect, useMemo, useState } from 'react';
import { useLeadStore } from '../store/useLeadStore';
import { createSessionJwt } from '../lib/appwrite';
import TaskTemplatesSection from '../components/academy/TaskTemplatesSection.jsx';
import EnrollmentFollowUpSection from '../components/academy/EnrollmentFollowUpSection.jsx';
import { TASK_TEMPLATE_TRIGGERS } from '../lib/taskTemplates.js';

/** Aba Processos em Automações — templates e tarefa legada pós-matrícula. */
export default function AutomacoesProcessosTab() {
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const academy = useMemo(() => {
    const arr = Array.isArray(academyList) ? academyList : [];
    return arr.find((a) => a.id === academyId) || null;
  }, [academyList, academyId]);

  const [templatesMeta, setTemplatesMeta] = useState({
    configurado: true,
    hasEnrollmentTemplate: false,
  });

  useEffect(() => {
    if (!academyId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const jwt = await createSessionJwt();
        if (!jwt || cancelled) return;
        const res = await fetch('/api/task-templates?include_disabled=1', {
          headers: {
            Authorization: `Bearer ${jwt}`,
            'x-academy-id': academyId,
          },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        const list = data.templates || [];
        setTemplatesMeta({
          configurado: data.configurado !== false,
          hasEnrollmentTemplate: list.some(
            (t) => t.trigger === TASK_TEMPLATE_TRIGGERS.ENROLLMENT && t.enabled !== false
          ),
        });
      } catch {
        if (!cancelled) {
          setTemplatesMeta({ configurado: false, hasEnrollmentTemplate: false });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  if (!academyId) {
    return <p className="text-small text-muted">Selecione uma academia para configurar processos.</p>;
  }

  return (
    <>
      <TaskTemplatesSection academyId={academyId} teamId={academy?.teamId || ''} />
      <EnrollmentFollowUpSection
        academyId={academyId}
        hasEnrollmentTemplate={templatesMeta.hasEnrollmentTemplate}
        templatesConfigurado={templatesMeta.configurado}
        embedded
      />
    </>
  );
}
