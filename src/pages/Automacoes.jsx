import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import HubTabBar from '../components/shared/HubTabBar.jsx';
import { resolveHubTab } from '../lib/hubTabs.js';
import AutomacoesModelosTab from './AutomacoesModelosTab.jsx';
import AutomacoesConfigTab from './AutomacoesConfigTab.jsx';

const TABS = [
  { id: 'modelos', label: 'Modelos' },
  { id: 'configuracoes', label: 'Configurações' },
];

const ALLOWED = new Set(TABS.map((t) => t.id));

export default function Automacoes() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveHubTab(searchParams.get('tab'), ALLOWED, 'modelos');

  useEffect(() => {
    const t = String(searchParams.get('tab') || '').trim().toLowerCase();
    if (!ALLOWED.has(t)) {
      setSearchParams({ tab: activeTab }, { replace: true });
    }
  }, [activeTab, searchParams, setSearchParams]);

  const setTab = (id) => setSearchParams({ tab: id }, { replace: false });

  return (
    <div className="container" style={{ paddingTop: 20, paddingBottom: 30 }}>
      <h1 className="navi-page-title">Automações</h1>
      <p className="navi-subtitle" style={{ marginBottom: 16 }}>
        Modelos de mensagem e gatilhos automáticos do funil.
      </p>
      <HubTabBar tabs={TABS} activeId={activeTab} onChange={setTab} ariaLabel="Automações" />
      <div className="mt-3 animate-in">
        {activeTab === 'modelos' ? <AutomacoesModelosTab /> : null}
        {activeTab === 'configuracoes' ? <AutomacoesConfigTab /> : null}
      </div>
    </div>
  );
}
