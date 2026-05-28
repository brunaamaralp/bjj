import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import SalesNewSaleTab from '../components/sales/SalesNewSaleTab';
import SalesHistoryTab from '../components/sales/SalesHistoryTab';
import NlCommandBar, { NlCommandBarTrigger } from '../components/NlCommandBar';
import { useLeadStore } from '../store/useLeadStore';
import { resolveHubTab } from '../lib/hubTabs';
import HubTabBar from '../components/shared/HubTabBar';
import PageHeader from '../components/layout/PageHeader.jsx';

const Sales = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const [nlOpen, setNlOpen] = useState(false);
  const academyName = useMemo(() => {
    const cur = (academyList || []).find((a) => a.id === academyId);
    return String(cur?.name || '').trim();
  }, [academyList, academyId]);
  const tabs = useMemo(
    () => [
      { id: 'new', label: 'Nova venda' },
      { id: 'history', label: 'Histórico' },
    ],
    []
  );
  const allowed = useMemo(() => new Set(['new', 'history']), []);
  const tab = resolveHubTab(
    searchParams.get('tab') === 'historico' ? 'history' : searchParams.get('tab'),
    allowed,
    'new'
  );
  useEffect(() => {
    const raw = String(searchParams.get('tab') || '').trim().toLowerCase();
    const normalized = raw === 'historico' ? 'history' : raw;
    if (!allowed.has(normalized) || normalized !== tab) {
      setSearchParams({ tab }, { replace: true });
    }
  }, [allowed, searchParams, setSearchParams, tab]);

  return (
    <div className="container sales-page navi-hub-page" style={{ paddingTop: 20, paddingBottom: 20 }}>
      <PageHeader
        title="Vendas"
        subtitle="Registre vendas e consulte comprovantes."
        meta={tab === 'history' ? 'Histórico e cancelamentos' : null}
        toolbar={<NlCommandBarTrigger onClick={() => setNlOpen(true)} />}
      />

      <HubTabBar
        tabs={tabs}
        activeId={tab}
        onChange={(id) => setSearchParams({ tab: id }, { replace: false })}
        ariaLabel="Vendas"
        variant="secondary"
        fullWidth
        className="mt-4"
      />

      {tab === 'new' ? (
        <SalesNewSaleTab />
      ) : (
        <SalesHistoryTab onSwitchTab={(id) => setSearchParams({ tab: id }, { replace: false })} />
      )}
      <NlCommandBar
        open={nlOpen}
        onOpenChange={setNlOpen}
        academyName={academyName}
        context="vendas"
      />
    </div>
  );
};

export default Sales;
