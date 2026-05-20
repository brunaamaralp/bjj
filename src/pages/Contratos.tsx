import React, { useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { resolveHubTab } from '../lib/hubTabs';
import HubTabBar from '../components/shared/HubTabBar';
import ContractsPageContent from '../components/contracts/ContractsPageContent';
import RouteFallback from '../components/shared/RouteFallback';
import { lazyWithRetry } from '../lib/lazyWithRetry.js';

const ContractTemplatesPage = lazyWithRetry(() => import('../components/contracts/ContractTemplatesPage'));

const TABS = new Set(['lista', 'modelos']);

export default function Contratos() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab = resolveHubTab(rawTab, TABS, 'lista');

  useEffect(() => {
    const t = String(searchParams.get('tab') || '').trim().toLowerCase();
    if (!TABS.has(t)) {
      setSearchParams({ tab: activeTab }, { replace: true });
    }
  }, [activeTab, searchParams, setSearchParams]);

  const tabs = useMemo(
    () => [
      { id: 'lista', label: 'Contratos' },
      { id: 'modelos', label: 'Modelos' },
    ],
    []
  );

  const setTab = (id: string) => setSearchParams({ tab: id }, { replace: false });

  return (
    <div className="container navi-hub-page" style={{ paddingTop: 20, paddingBottom: 40 }}>
      <header className="navi-hub-page__head">
        <h1 className="navi-page-title" style={{ margin: 0 }}>
          Contratos
        </h1>
        <p className="navi-eyebrow" style={{ marginTop: 6, marginBottom: 0 }}>
          Lista de contratos e modelos para assinatura digital
        </p>
      </header>
      <HubTabBar tabs={tabs} activeId={activeTab} onChange={setTab} ariaLabel="Contratos" />
      <div className="navi-hub-page__body">
        {activeTab === 'lista' ? <ContractsPageContent embedded /> : null}
        {activeTab === 'modelos' ? (
          <Suspense fallback={<RouteFallback />}>
            <ContractTemplatesPage embedded />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}
