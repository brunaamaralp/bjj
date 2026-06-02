import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import HubTabBar from '../components/shared/HubTabBar.jsx';
import { resolveHubTab } from '../lib/hubTabs.js';
import AutomacoesProcessosTab from './AutomacoesProcessosTab.jsx';
import AutomacoesModelosTab from './AutomacoesModelosTab.jsx';
import AutomacoesConfigTab from './AutomacoesConfigTab.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';

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
        subtitle="Configure processos, modelos de mensagem e gatilhos do funil."
      />
      <HubTabBar tabs={TABS} activeId={activeTab} onChange={setTab} ariaLabel="Automações" fullWidth />
      <div className="mt-3 animate-in">
        {activeTab === 'processos' ? <AutomacoesProcessosTab /> : null}
        {activeTab === 'modelos' ? <AutomacoesModelosTab /> : null}
        {activeTab === 'configuracoes' ? <AutomacoesConfigTab /> : null}
      </div>
    </div>
  );
}
