import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import HubTabBar from '../components/shared/HubTabBar.jsx';
import { resolveHubTab } from '../lib/hubTabs.js';
import { useLeadStore } from '../store/useLeadStore';
import ControlIdCatracaSection from '../components/academy/ControlIdCatracaSection.jsx';
import ContractsAutentiqueSection from '../components/academy/ContractsAutentiqueSection.jsx';

const TABS = [
  { id: 'catraca', label: 'Catraca' },
  { id: 'autentique', label: 'Autentique' },
];

const ALLOWED = new Set(TABS.map((t) => t.id));

export default function Integracoes() {
  const academyId = useLeadStore((s) => s.academyId);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveHubTab(searchParams.get('tab'), ALLOWED, 'catraca');

  useEffect(() => {
    const t = String(searchParams.get('tab') || '').trim().toLowerCase();
    if (!ALLOWED.has(t)) {
      setSearchParams({ tab: activeTab }, { replace: true });
    }
  }, [activeTab, searchParams, setSearchParams]);

  const setTab = (id) => setSearchParams({ tab: id }, { replace: false });

  return (
    <div className="container" style={{ paddingTop: 20, paddingBottom: 30 }}>
      <div className="animate-in">
        <h1 className="navi-page-title">Integrações</h1>
        <p className="navi-subtitle" style={{ marginTop: 6, marginBottom: 16 }}>
          Catraca Control iD e assinatura digital Autentique.
        </p>
      </div>

      <HubTabBar tabs={TABS} activeId={activeTab} onChange={setTab} ariaLabel="Integrações" />

      <div className="mt-3 animate-in">
        {!academyId ? (
          <p className="text-small text-muted">Selecione uma academia para configurar integrações.</p>
        ) : null}
        {academyId && activeTab === 'catraca' ? <ControlIdCatracaSection academyId={academyId} /> : null}
        {academyId && activeTab === 'autentique' ? (
          <section className="empresa-section mt-2">
            <p className="text-small text-muted mb-3" style={{ lineHeight: 1.45 }}>
              Serviços opcionais que exigem configuração fora do Nave.
            </p>
            <ContractsAutentiqueSection />
          </section>
        ) : null}
      </div>
    </div>
  );
}
