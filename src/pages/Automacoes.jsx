import React, { useEffect, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import HubTabBar from '../components/shared/HubTabBar.jsx';
import { resolveHubTab } from '../lib/hubTabs.js';
import PageHeader from '../components/layout/PageHeader.jsx';
import PageSkeleton from '../components/shared/PageSkeleton.jsx';
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
  const activeTab = resolveHubTab(searchParams.get('tab'), ALLOWED, 'processos');

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

  const setTab = (id) => setSearchParams({ tab: id }, { replace: false });

  return (
    <div className="container navi-hub-page" style={{ paddingBottom: 30 }}>
      <PageHeader
        title="Automações"
        subtitle="Os gatilhos do funil começam desligados — ative em Configurações após conectar o WhatsApp."
      />
      <HubTabBar tabs={TABS} activeId={activeTab} onChange={setTab} ariaLabel="Automações" fullWidth />
      <div className="mt-3 animate-in">
        <Suspense fallback={<PageSkeleton variant="cards" rows={4} />}>
          {activeTab === 'processos' ? <AutomacoesProcessosTab /> : null}
          {activeTab === 'modelos' ? <AutomacoesModelosTab /> : null}
          {activeTab === 'configuracoes' ? <AutomacoesConfigTab /> : null}
        </Suspense>
      </div>
    </div>
  );
}
