import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLeadStore } from '../store/useLeadStore';
import { getAcademyDocument } from '../lib/getAcademyDocument.js';
import { readEnrollmentFollowUpTask } from '../lib/enrollmentSettings';
import {
  PROCESSOS_DEFAULT_SECTION,
  PROCESSOS_SETTINGS_SECTIONS,
  isProcessosSettingsSection,
  resolveProcessosNavState,
} from '../lib/processosSettingsSections.js';
import AcademyTabSettingsLayout from '../components/academy/settings/AcademyTabSettingsLayout.jsx';
import TaskTemplatesSection from '../components/academy/TaskTemplatesSection.jsx';
import EnrollmentFollowUpSection from '../components/academy/EnrollmentFollowUpSection.jsx';
import FollowupPlaybookSection from '../components/academy/FollowupPlaybookSection.jsx';
import '../components/finance/finance.css';

/** Aba Processos da equipe em /tarefas?tab=processos — templates e playbook CRM. */
export default function TaskProcessosTab() {
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const [searchParams, setSearchParams] = useSearchParams();
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

  const hasLegadoFollowUp = useMemo(() => {
    if (settingsLoading || academySettings === undefined) return false;
    return Boolean(readEnrollmentFollowUpTask(academySettings));
  }, [academySettings, settingsLoading]);

  const navState = resolveProcessosNavState(searchParams.get('section'), {
    showLegado: hasLegadoFollowUp,
  });
  const { section: activeSection, meta: sectionMeta, items: navItems } = navState;

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
        console.error('[TaskProcessos]', e);
        if (!cancelled) {
          setSettingsLoad({ academyId, settings: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [academyId]);

  useEffect(() => {
    const resolved = isProcessosSettingsSection(searchParams.get('section'));
    const validIds = new Set(navItems.map((item) => item.id));
    const target =
      resolved && validIds.has(resolved) ? resolved : PROCESSOS_DEFAULT_SECTION;
    if (searchParams.get('section') !== target) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('tab', 'processos');
          next.set('section', target);
          return next;
        },
        { replace: true }
      );
    }
  }, [navItems, searchParams, setSearchParams]);

  const handleSettingsSaved = useCallback((nextSettings) => {
    setSettingsLoad((prev) => ({ ...prev, settings: nextSettings }));
  }, []);

  const goSection = useCallback(
    (sectionId) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('tab', 'processos');
          next.set('section', sectionId);
          return next;
        },
        { replace: false }
      );
    },
    [setSearchParams]
  );

  if (!academyId) {
    return <p className="text-small text-muted">Selecione uma academia para configurar processos.</p>;
  }

  let sectionBody = null;
  if (activeSection === PROCESSOS_SETTINGS_SECTIONS.TEMPLATES) {
    sectionBody = (
      <TaskTemplatesSection
        embeddedInLayout
        academyId={academyId}
        teamId={academy?.teamId || ''}
      />
    );
  } else if (activeSection === PROCESSOS_SETTINGS_SECTIONS.PLAYBOOK) {
    sectionBody = (
      <FollowupPlaybookSection
        embeddedInLayout
        academyId={academyId}
        academySettings={academySettings}
        settingsLoading={settingsLoading}
        onSettingsSaved={handleSettingsSaved}
      />
    );
  } else if (activeSection === PROCESSOS_SETTINGS_SECTIONS.MATRICULA_LEGADO) {
    sectionBody = (
      <EnrollmentFollowUpSection
        embeddedInLayout
        academyId={academyId}
        academySettings={academySettings}
        settingsLoading={settingsLoading}
        onSettingsSaved={handleSettingsSaved}
      />
    );
  }

  return (
    <section className="processos-settings-section animate-in">
      <AcademyTabSettingsLayout
        navLabel="Processos da equipe"
        items={navItems}
        activeId={activeSection}
        onSelect={goSection}
        title={sectionMeta?.panelTitle}
        subtitle={sectionMeta?.hint}
      >
        {sectionBody}
      </AcademyTabSettingsLayout>
    </section>
  );
}
