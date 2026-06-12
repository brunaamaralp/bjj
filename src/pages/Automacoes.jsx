import React, { useCallback, useEffect, Suspense, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import HubTabBar from '../components/shared/HubTabBar.jsx';
import { resolveHubTab } from '../lib/hubTabs.js';
import PageHeader from '../components/layout/PageHeader.jsx';
import PageSkeleton from '../components/shared/PageSkeleton.jsx';
import ConfirmDialog from '../components/shared/ConfirmDialog.jsx';
import { lazyWithRetry } from '../lib/lazyWithRetry.js';
import { AUTOMACOES_TABS, AUTOMACOES_TAB_HINTS } from '../lib/automacoesHub.js';
import {
  AUTOMACOES_WIZARD_STEPS,
  readAutomacoesModelosVisited,
  writeAutomacoesModelosVisited,
  shouldShowSetupWizardOnTab,
} from '../lib/automacoesSetupWizard.js';
import { useAutomacoesSetupWizard } from '../hooks/useAutomacoesSetupWizard.js';
import AutomacoesSetupWizard from '../components/academy/AutomacoesSetupWizard.jsx';
import AutomacoesSetupWizardComplete from '../components/academy/AutomacoesSetupWizardComplete.jsx';
import { useLeadStore } from '../store/useLeadStore';

const AutomacoesProcessosTab = lazyWithRetry(() => import('./AutomacoesProcessosTab.jsx'));
const AutomacoesModelosTab = lazyWithRetry(() => import('./AutomacoesModelosTab.jsx'));
const AutomacoesConfigTab = lazyWithRetry(() => import('./AutomacoesConfigTab.jsx'));

const TABS = AUTOMACOES_TABS;
const ALLOWED = new Set(TABS.map((t) => t.id));

export default function Automacoes() {
  const navigate = useNavigate();
  const academyId = useLeadStore((s) => s.academyId);
  const [searchParams, setSearchParams] = useSearchParams();
  const [modelosTabVisited, setModelosTabVisited] = useState(() => readAutomacoesModelosVisited(academyId));
  const wizard = useAutomacoesSetupWizard({ modelosTabVisited });
  const tabParam = String(searchParams.get('tab') || '').trim().toLowerCase();
  const hasExplicitTab = ALLOWED.has(tabParam);
  const fallbackTab = !wizard.loading && wizard.show ? wizard.currentStepId : 'configuracoes';
  const activeTab = resolveHubTab(searchParams.get('tab'), ALLOWED, fallbackTab);
  const setupGuideVisible =
    !wizard.loading && wizard.show && shouldShowSetupWizardOnTab(wizard.currentStep, activeTab);
  const setupGuideActive = setupGuideVisible;
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([activeTab]));
  const [prevActiveTab, setPrevActiveTab] = useState(activeTab);
  const [configGuard, setConfigGuard] = useState({ isDirty: false, isSaving: false });
  const [pendingTab, setPendingTab] = useState(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  const handleConfigGuardChange = useCallback((next) => {
    setConfigGuard((prev) => {
      if (prev.isDirty === next.isDirty && prev.isSaving === next.isSaving) return prev;
      return next;
    });
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
    setModelosTabVisited(readAutomacoesModelosVisited(academyId));
  }, [academyId]);

  useEffect(() => {
    if (activeTab !== 'modelos' || !academyId) return;
    writeAutomacoesModelosVisited(academyId);
    setModelosTabVisited(true);
  }, [activeTab, academyId]);

  useEffect(() => {
    const t = String(searchParams.get('tab') || '').trim().toLowerCase();
    if (t === 'agente') {
      navigate('/agente-ia', { replace: true });
      return;
    }
    if (!ALLOWED.has(t)) {
      setSearchParams({ tab: activeTab }, { replace: true });
    }
  }, [activeTab, navigate, searchParams, setSearchParams]);

  useEffect(() => {
    if (wizard.loading || !wizard.show || hasExplicitTab) return;
    if (activeTab !== wizard.currentStepId) {
      setSearchParams({ tab: wizard.currentStepId }, { replace: true });
    }
  }, [
    wizard.loading,
    wizard.show,
    wizard.currentStepId,
    hasExplicitTab,
    activeTab,
    setSearchParams,
  ]);

  const applyTab = (id) => setSearchParams({ tab: id }, { replace: false });

  const requestTab = (id) => {
    if (id === activeTab) return;
    const leavingConfig = activeTab === 'configuracoes' && id !== 'configuracoes';
    if (leavingConfig && (configGuard.isDirty || configGuard.isSaving)) {
      setPendingTab(id);
      setLeaveConfirmOpen(true);
      return;
    }
    applyTab(id);
  };

  const handleWizardStepAction = (stepId) => {
    const step = AUTOMACOES_WIZARD_STEPS.find((s) => s.id === stepId);
    if (!step) return;
    if (step.path) {
      navigate(step.path);
      return;
    }
    if (step.tab) requestTab(step.tab);
  };

  const confirmLeaveConfig = () => {
    const next = pendingTab;
    setLeaveConfirmOpen(false);
    setPendingTab(null);
    if (next) applyTab(next);
  };

  const leaveConfirmDescription = configGuard.isSaving
    ? 'Uma alteração ainda está sendo salva. Se sair agora, a configuração pode ficar inconsistente.'
    : 'A última alteração não foi salva. Se sair agora, ela será descartada.';

  const handleReopenGuide = () => {
    wizard.reopenGuide();
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('wizard', '1');
        if (!ALLOWED.has(String(next.get('tab') || '').trim().toLowerCase())) {
          next.set('tab', wizard.currentStepId || 'modelos');
        }
        return next;
      },
      { replace: false }
    );
  };

  return (
    <div className="container navi-hub-page" style={{ paddingBottom: 30 }}>
      <PageHeader
        title="Automações"
        subtitle={AUTOMACOES_TAB_HINTS[activeTab]}
        meta={
          wizard.canReopenGuide ? (
            <button type="button" className="edit-link automacoes-reopen-guide" onClick={handleReopenGuide}>
              Ver guia de configuração
            </button>
          ) : null
        }
      />
      <HubTabBar tabs={TABS} activeId={activeTab} onChange={requestTab} ariaLabel="Automações" fullWidth />
      {wizard.justCompleted ? <AutomacoesSetupWizardComplete /> : null}
      {!wizard.justCompleted && setupGuideVisible ? (
        <AutomacoesSetupWizard
          className="automacoes-setup-wizard--below-tabs"
          steps={wizard.steps}
          currentStep={wizard.currentStep}
          activeTab={activeTab}
          doneCount={wizard.doneCount}
          totalSteps={wizard.totalSteps}
          onDismiss={wizard.dismiss}
          onStepAction={handleWizardStepAction}
        />
      ) : null}
      <div className="mt-3 animate-in">
        <Suspense fallback={<PageSkeleton variant="cards" rows={4} />}>
          {visitedTabs.has('processos') ? (
            <div hidden={activeTab !== 'processos'} aria-hidden={activeTab !== 'processos'}>
              <AutomacoesProcessosTab />
            </div>
          ) : null}
          {visitedTabs.has('modelos') ? (
            <div hidden={activeTab !== 'modelos'} aria-hidden={activeTab !== 'modelos'}>
              <AutomacoesModelosTab />
            </div>
          ) : null}
          {visitedTabs.has('configuracoes') ? (
            <div hidden={activeTab !== 'configuracoes'} aria-hidden={activeTab !== 'configuracoes'}>
              <AutomacoesConfigTab
                onGuardStateChange={handleConfigGuardChange}
                setupGuideActive={setupGuideActive}
              />
            </div>
          ) : null}
        </Suspense>
      </div>

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
          setPendingTab(null);
        }}
      />
    </div>
  );
}
