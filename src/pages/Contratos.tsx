import React, { useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { resolveHubTab } from '../lib/hubTabs';
import HubTabBar from '../components/shared/HubTabBar';
import ContractsPageContent from '../components/contracts/ContractsPageContent';
import RouteFallback from '../components/shared/RouteFallback';

const ContractTemplatesPage = React.lazy(() => import('../components/contracts/ContractTemplatesPage'));

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
    <>
      <HubTabBar tabs={tabs} activeId={activeTab} onChange={setTab} ariaLabel="Contratos" />
      <div style={{ marginTop: 0 }}>
        {activeTab === 'lista' ? <ContractsPageContent /> : null}
        {activeTab === 'modelos' ? (
          <Suspense fallback={<RouteFallback />}>
            <ContractTemplatesPage embedded />
          </Suspense>
        ) : null}
      </div>
    </>
  );
}
