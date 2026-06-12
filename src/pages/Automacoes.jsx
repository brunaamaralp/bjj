import React, { useCallback, useEffect, Suspense, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import HubTabBar from '../components/shared/HubTabBar.jsx';
import { resolveHubTab } from '../lib/hubTabs.js';
import PageHeader from '../components/layout/PageHeader.jsx';
import PageSkeleton from '../components/shared/PageSkeleton.jsx';
import ConfirmDialog from '../components/shared/ConfirmDialog.jsx';
import { lazyWithRetry } from '../lib/lazyWithRetry.js';

const AutomacoesProcessosTab = lazyWithRetry(() => import('./AutomacoesProcessosTab.jsx'));
const AutomacoesModelosTab = lazyWithRetry(() => import('./AutomacoesModelosTab.jsx'));
const AutomacoesConfigTab = lazyWithRetry(() => import('./AutomacoesConfigTab.jsx'));

const TABS = [
  { id: 'processos', label: 'Processos' },
  { id: 'modelos', label: 'Modelos de Mensagem' },
  { id: 'configuracoes', label: 'Configurações' },
];

const ALLOWED = new Set(TABS.map((t) => t.id));

export default function Automacoes() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveHubTab(searchParams.get('tab'), ALLOWED, 'configuracoes');
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
    const t = String(searchParams.get('tab') || '').trim().toLowerCase();
    if (t === 'agente') {
      navigate('/agente-ia', { replace: true });
      return;
    }
    if (!ALLOWED.has(t)) {
      setSearchParams({ tab: activeTab }, { replace: true });
    }
  }, [activeTab, navigate, searchParams, setSearchParams]);

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

  const confirmLeaveConfig = () => {
    const next = pendingTab;
    setLeaveConfirmOpen(false);
    setPendingTab(null);
    if (next) applyTab(next);
  };

  const leaveConfirmDescription = configGuard.isSaving
    ? 'Uma alteração ainda está sendo salva. Se sair agora, a configuração pode ficar inconsistente.'
    : 'A última alteração não foi salva. Se sair agora, ela será descartada.';

  return (
    <div className="container navi-hub-page" style={{ paddingBottom: 30 }}>
      <PageHeader
        title="Automações"
        subtitle="Os gatilhos do funil começam desligados — ative em Configurações após conectar o WhatsApp."
      />
      <HubTabBar tabs={TABS} activeId={activeTab} onChange={requestTab} ariaLabel="Automações" fullWidth />
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
              <AutomacoesConfigTab onGuardStateChange={handleConfigGuardChange} />
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
