import React, { useCallback, useEffect, Suspense, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/layout/PageHeader.jsx';
import PageSkeleton from '../components/shared/PageSkeleton.jsx';
import ConfirmDialog from '../components/shared/ConfirmDialog.jsx';
import AcademyTabSettingsLayout from '../components/academy/settings/AcademyTabSettingsLayout.jsx';
import { lazyWithRetry } from '../lib/lazyWithRetry.js';
import { AUTOMACOES_GATILHOS_TAB_ID, normalizeAutomacoesTab } from '../lib/automacoesHub.js';
import { AUTOMACOES_COPY } from '../lib/automacoesCopy.js';
import {
  AUTOMACOES_SETTINGS_NAV_ITEMS,
  getAutomacoesDefaultSection,
  parseAutomacoesSettingsNavId,
  resolveAutomacoesNavState,
  resolveAutomacoesSection,
} from '../lib/automacoesSettingsSections.js';
import { readAutomacoesModelosAck } from '../lib/automacoesSetupWizard.js';
import { useLeadStore } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import '../components/finance/finance.css';

const AutomacoesModelosTab = lazyWithRetry(() => import('./AutomacoesModelosTab.jsx'));
const AutomacoesConfigTab = lazyWithRetry(() => import('./AutomacoesConfigTab.jsx'));

const MIGRATION_PROCESSOS_KEY = 'navi_migrated_processos_v1';

export default function Automacoes() {
  const navigate = useNavigate();
  const addToast = useUiStore((s) => s.addToast);
  const academyId = useLeadStore((s) => s.academyId);
  const [searchParams, setSearchParams] = useSearchParams();
  const [modelosAcknowledged, setModelosAcknowledged] = useState(() => readAutomacoesModelosAck(academyId));

  const normalizedTab = normalizeAutomacoesTab(searchParams.get('tab') || 'modelos');
  const tabForState = normalizedTab.kind === 'tab' ? normalizedTab.tab : 'modelos';
  const navState = resolveAutomacoesNavState(tabForState, searchParams.get('section'));
  const { tab: activeTab, section: activeSection, navId: activeNavId, meta: sectionMeta } = navState;

  const [visitedTabs, setVisitedTabs] = useState(() => new Set([activeTab]));
  const [prevActiveTab, setPrevActiveTab] = useState(activeTab);
  const [configGuard, setConfigGuard] = useState({ isDirty: false, isSaving: false });
  const [pendingNavId, setPendingNavId] = useState(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  const handleConfigGuardChange = useCallback((next) => {
    setConfigGuard((prev) => {
      if (prev.isDirty === next.isDirty && prev.isSaving === next.isSaving) return prev;
      return next;
    });
  }, []);

  const handleModelosAckChange = useCallback((ack) => {
    setModelosAcknowledged(Boolean(ack));
  }, []);

  if (activeTab !== prevActiveTab) {
    setPrevActiveTab(activeTab);
    if (!visitedTabs.has(activeTab)) {
      setVisitedTabs((prev) => {
        if (prev.has(activeTab)) return prev;
        const next = new Set(prev);
        next.add(activeTab);
        return next;
      });
    }
  }

  useEffect(() => {
    setModelosAcknowledged(readAutomacoesModelosAck(academyId));
  }, [academyId]);

  useEffect(() => {
    const t = String(searchParams.get('tab') || '').trim().toLowerCase();
    if (t === 'agente') {
      navigate('/agente-ia', { replace: true });
      return;
    }

    const normalized = normalizeAutomacoesTab(t);
    if (normalized.kind === 'redirect') {
      try {
        if (!sessionStorage.getItem(MIGRATION_PROCESSOS_KEY)) {
          sessionStorage.setItem(MIGRATION_PROCESSOS_KEY, '1');
          addToast?.({ type: 'info', message: AUTOMACOES_COPY.migration.processosMoved });
        }
      } catch {
        void 0;
      }
      navigate(normalized.to, { replace: true });
      return;
    }

    const tab = normalized.tab;
    const section =
      resolveAutomacoesSection(tab, searchParams.get('section')) || getAutomacoesDefaultSection(tab);

    if (t && normalized.tab !== t) {
      setSearchParams({ tab, section }, { replace: true });
      return;
    }

    if (!t) {
      setSearchParams({ tab, section }, { replace: true });
      return;
    }

    if (searchParams.get('section') !== section) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('tab', tab);
          next.set('section', section);
          return next;
        },
        { replace: true }
      );
    }
  }, [addToast, navigate, searchParams, setSearchParams]);

  const applyNav = useCallback(
    (navId) => {
      const { tab, section } = parseAutomacoesSettingsNavId(navId);
      setSearchParams({ tab, section }, { replace: false });
    },
    [setSearchParams]
  );

  const requestNav = (navId) => {
    if (navId === activeNavId) return;
    const { tab } = parseAutomacoesSettingsNavId(navId);
    const leavingGatilhos = activeTab === AUTOMACOES_GATILHOS_TAB_ID && tab !== AUTOMACOES_GATILHOS_TAB_ID;
    if (leavingGatilhos && (configGuard.isDirty || configGuard.isSaving)) {
      setPendingNavId(navId);
      setLeaveConfirmOpen(true);
      return;
    }
    applyNav(navId);
  };

  const confirmLeaveConfig = () => {
    const next = pendingNavId;
    setLeaveConfirmOpen(false);
    setPendingNavId(null);
    if (next) applyNav(next);
  };

  const leaveConfirmDescription = configGuard.isSaving
    ? 'Uma alteração ainda está sendo salva. Se sair agora, a configuração pode ficar inconsistente.'
    : 'A última alteração não foi salva. Se sair agora, ela será descartada.';

  return (
    <div className="container navi-hub-page automacoes-hub-page" style={{ paddingBottom: 30 }}>
      <PageHeader title={AUTOMACOES_COPY.hub.title} subtitle={AUTOMACOES_COPY.hub.subtitle} />
      <section className="automacoes-settings-section animate-in mt-3">
        <AcademyTabSettingsLayout
          navLabel="Mensagens do funil"
          items={AUTOMACOES_SETTINGS_NAV_ITEMS}
          activeId={activeNavId}
          onSelect={requestNav}
          title={sectionMeta?.panelTitle}
          subtitle={sectionMeta?.panelHint}
        >
          <Suspense fallback={<PageSkeleton variant="cards" rows={4} />}>
            {visitedTabs.has('modelos') ? (
              <div hidden={activeTab !== 'modelos'} aria-hidden={activeTab !== 'modelos'}>
                <AutomacoesModelosTab
                  embeddedInLayout
                  activeGroupId={activeTab === 'modelos' ? activeSection : null}
                  modelosAcknowledged={modelosAcknowledged}
                  onModelosAckChange={handleModelosAckChange}
                />
              </div>
            ) : null}
            {visitedTabs.has(AUTOMACOES_GATILHOS_TAB_ID) ? (
              <div
                hidden={activeTab !== AUTOMACOES_GATILHOS_TAB_ID}
                aria-hidden={activeTab !== AUTOMACOES_GATILHOS_TAB_ID}
              >
                <AutomacoesConfigTab
                  embeddedInLayout
                  activeGroupSection={activeTab === AUTOMACOES_GATILHOS_TAB_ID ? activeSection : null}
                  onGuardStateChange={handleConfigGuardChange}
                />
              </div>
            ) : null}
          </Suspense>
        </AcademyTabSettingsLayout>
      </section>

      <ConfirmDialog
        open={leaveConfirmOpen}
        title={configGuard.isSaving ? 'Salvando alterações' : 'Descartar alterações?'}
        description={leaveConfirmDescription}
        confirmLabel={configGuard.isSaving ? 'Sair mesmo assim' : 'Descartar e sair'}
        cancelLabel="Continuar aqui"
        confirmVariant="danger"
        loading={false}
        onConfirm={confirmLeaveConfig}
        onClose={() => {
          setLeaveConfirmOpen(false);
          setPendingNavId(null);
        }}
      />
    </div>
  );
}
