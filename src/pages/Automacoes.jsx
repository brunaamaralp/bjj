import React, { useCallback, useEffect, Suspense, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { teams } from '../lib/appwrite';
import HubTabBar from '../components/shared/HubTabBar.jsx';
import { resolveHubTab } from '../lib/hubTabs.js';
import PageHeader from '../components/layout/PageHeader.jsx';
import PageSkeleton from '../components/shared/PageSkeleton.jsx';
import ConfirmDialog from '../components/shared/ConfirmDialog.jsx';
import { lazyWithRetry } from '../lib/lazyWithRetry.js';
import { AUTOMACOES_GATILHOS_TAB_ID, AUTOMACOES_TABS, normalizeAutomacoesTab } from '../lib/automacoesHub.js';
import { AUTOMACOES_COPY } from '../lib/automacoesCopy.js';
import { canEditWhatsappTemplates } from '../lib/canEditWhatsappTemplates.js';
import {
  AUTOMACOES_WIZARD_STEPS,
  readAutomacoesModelosAck,
  resolveWizardSurface,
  resolveWizardPrimaryDisabled,
  tabForWizardStep,
} from '../lib/automacoesSetupWizard.js';
import { useAutomacoesSetupWizard } from '../hooks/useAutomacoesSetupWizard.js';
import AutomacoesSetupWizard from '../components/academy/AutomacoesSetupWizard.jsx';
import AutomacoesSetupWizardComplete from '../components/academy/AutomacoesSetupWizardComplete.jsx';
import { useLeadStore } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';

const AutomacoesModelosTab = lazyWithRetry(() => import('./AutomacoesModelosTab.jsx'));
const AutomacoesConfigTab = lazyWithRetry(() => import('./AutomacoesConfigTab.jsx'));

const TABS = AUTOMACOES_TABS;
const ALLOWED = new Set(TABS.map((t) => t.id));
const MIGRATION_PROCESSOS_KEY = 'navi_migrated_processos_v1';

export default function Automacoes() {
  const navigate = useNavigate();
  const addToast = useUiStore((s) => s.addToast);
  const academyId = useLeadStore((s) => s.academyId);
  const userId = useLeadStore((s) => s.userId);
  const academyList = useLeadStore((s) => s.academyList);
  const academyDoc = useMemo(
    () => (academyList || []).find((a) => a.id === academyId) || null,
    [academyList, academyId]
  );
  const [membership, setMembership] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [modelosAcknowledged, setModelosAcknowledged] = useState(() => readAutomacoesModelosAck(academyId));
  const wizard = useAutomacoesSetupWizard({ modelosAcknowledged });
  const forceWizard = searchParams.get('wizard') === '1';
  const tabParam = String(searchParams.get('tab') || '').trim().toLowerCase();
  const hasExplicitTab = ALLOWED.has(tabParam) || tabParam === 'configuracoes';
  const canEdit = canEditWhatsappTemplates(userId, academyDoc, membership);
  const fallbackTab =
    !wizard.loading && wizard.show && canEdit ? tabForWizardStep(wizard.currentStepId) : 'modelos';
  const activeTab = resolveHubTab(searchParams.get('tab'), ALLOWED, fallbackTab);

  const wizardSurface = useMemo(() => {
    if (!canEdit) return 'hidden';
    if (wizard.loading || wizard.justCompleted || !wizard.show || !wizard.currentStep) return 'hidden';
    return resolveWizardSurface({
      currentStep: wizard.currentStep,
      activeTab,
      forceWizard,
      wizardShow: wizard.show,
    });
  }, [
    canEdit,
    wizard.loading,
    wizard.justCompleted,
    wizard.show,
    wizard.currentStep,
    activeTab,
    forceWizard,
  ]);

  const setupGuideActive = wizardSurface === 'full';

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

    if (t && normalized.tab !== t) {
      setSearchParams({ tab: normalized.tab }, { replace: true });
      return;
    }

    if (!t) {
      setSearchParams({ tab: normalized.tab }, { replace: true });
    }
  }, [addToast, navigate, searchParams, setSearchParams]);

  useEffect(() => {
    if (!canEdit || wizard.loading || !wizard.show || hasExplicitTab) return;
    const targetTab = tabForWizardStep(wizard.currentStepId);
    if (activeTab !== targetTab) {
      setSearchParams({ tab: targetTab }, { replace: true });
    }
  }, [
    canEdit,
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
    const leavingGatilhos = activeTab === AUTOMACOES_GATILHOS_TAB_ID && id !== AUTOMACOES_GATILHOS_TAB_ID;
    if (leavingGatilhos && (configGuard.isDirty || configGuard.isSaving)) {
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
          next.set('tab', tabForWizardStep(wizard.currentStepId) || 'modelos');
        }
        return next;
      },
      { replace: false }
    );
  };

  const showModelosTabIntro = activeTab === 'modelos' && wizardSurface !== 'full';
  const showGatilhosTabIntro = activeTab === AUTOMACOES_GATILHOS_TAB_ID && wizardSurface !== 'full';

  const wizardPrimaryCtaDisabled =
    wizard.currentStep?.id === 'modelos' &&
    resolveWizardPrimaryDisabled(wizard.currentStep, {
      templatesMap: wizard.templatesMap,
      modelosAcknowledged,
    });

  return (
    <div className="container navi-hub-page" style={{ paddingBottom: 30 }}>
      <PageHeader
        title={AUTOMACOES_COPY.hub.title}
        subtitle={AUTOMACOES_COPY.hub.subtitle}
        meta={
          canEdit && wizard.canReopenGuide ? (
            <button type="button" className="edit-link automacoes-reopen-guide" onClick={handleReopenGuide}>
              Ver guia de configuração
            </button>
          ) : null
        }
      />
      <HubTabBar tabs={TABS} activeId={activeTab} onChange={requestTab} ariaLabel="Mensagens do funil" fullWidth />
      {canEdit && wizard.justCompleted ? <AutomacoesSetupWizardComplete /> : null}
      {canEdit && !wizard.justCompleted && wizardSurface === 'full' ? (
        <AutomacoesSetupWizard
          className="automacoes-setup-wizard--below-tabs"
          steps={wizard.steps}
          currentStep={wizard.currentStep}
          activeTab={activeTab}
          doneCount={wizard.doneCount}
          totalSteps={wizard.totalSteps}
          onDismiss={wizard.dismiss}
          onStepAction={handleWizardStepAction}
          primaryCtaDisabled={wizardPrimaryCtaDisabled}
          primaryCtaBlockedHint={
            wizardPrimaryCtaDisabled ? AUTOMACOES_COPY.wizard.modelos.ctaBlockedHint : ''
          }
        />
      ) : null}
      <div className="mt-3 animate-in">
        <Suspense fallback={<PageSkeleton variant="cards" rows={4} />}>
          {visitedTabs.has('modelos') ? (
            <div hidden={activeTab !== 'modelos'} aria-hidden={activeTab !== 'modelos'}>
              <AutomacoesModelosTab
                showTabIntro={showModelosTabIntro}
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
                onGuardStateChange={handleConfigGuardChange}
                setupGuideActive={setupGuideActive}
                showTabIntro={showGatilhosTabIntro}
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
