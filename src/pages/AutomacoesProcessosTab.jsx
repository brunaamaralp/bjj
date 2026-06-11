import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLeadStore } from '../store/useLeadStore';
import { getAcademyDocument } from '../lib/getAcademyDocument.js';
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

  const [academySettings, setAcademySettings] = useState(undefined);
  const [settingsLoading, setSettingsLoading] = useState(Boolean(academyId));

  useEffect(() => {
    if (!academyId) {
      setAcademySettings(undefined);
      setSettingsLoading(false);
      return undefined;
    }

    let cancelled = false;
    setSettingsLoading(true);
    getAcademyDocument(academyId)
      .then((doc) => {
        if (!cancelled) setAcademySettings(doc.settings);
      })
      .catch((e) => {
        console.error('[AutomacoesProcessos]', e);
        if (!cancelled) setAcademySettings(null);
      })
      .finally(() => {
        if (!cancelled) setSettingsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [academyId]);

  const handleSettingsSaved = useCallback((nextSettings) => {
    setAcademySettings(nextSettings);
  }, []);

  if (!academyId) {
    return <p className="text-small text-muted">Selecione uma academia para configurar processos.</p>;
  }

  return (
    <>
      <TaskTemplatesSection academyId={academyId} teamId={academy?.teamId || ''} />
      <FollowupPlaybookSection
        academyId={academyId}
        academySettings={academySettings}
        settingsLoading={settingsLoading}
        onSettingsSaved={handleSettingsSaved}
      />
      <EnrollmentFollowUpSection
        academyId={academyId}
        academySettings={academySettings}
        settingsLoading={settingsLoading}
        onSettingsSaved={handleSettingsSaved}
      />
    </>
  );
}
