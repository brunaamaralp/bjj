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

  const [settingsLoad, setSettingsLoad] = useState({ academyId: '', settings: undefined });

  const academySettings = academyId
    ? settingsLoad.academyId === academyId
      ? settingsLoad.settings
      : undefined
    : undefined;
  const settingsLoading = Boolean(academyId) && settingsLoad.academyId !== academyId;

  useEffect(() => {
    if (!academyId) return undefined;

    let cancelled = false;
    void getAcademyDocument(academyId)
      .then((doc) => {
        if (!cancelled) {
          setSettingsLoad({ academyId, settings: doc.settings });
        }
      })
      .catch((e) => {
        console.error('[AutomacoesProcessos]', e);
        if (!cancelled) {
          setSettingsLoad({ academyId, settings: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [academyId]);

  const handleSettingsSaved = useCallback((nextSettings) => {
    setSettingsLoad((prev) => ({ ...prev, settings: nextSettings }));
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
