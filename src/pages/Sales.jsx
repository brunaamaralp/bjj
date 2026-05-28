import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import SalesNewSaleTab from '../components/sales/SalesNewSaleTab';
import SalesHistoryTab from '../components/sales/SalesHistoryTab';
import NlCommandBar, { NlCommandBarTrigger } from '../components/NlCommandBar';
import { useLeadStore } from '../store/useLeadStore';
import { resolveHubTab } from '../lib/hubTabs';
import HubTabBar from '../components/shared/HubTabBar';

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
    <div className="container sales-page" style={{ paddingTop: 20, paddingBottom: 20 }}>
      <div className="animate-in">
        <h1 className="navi-page-title">Vendas</h1>
        {tab === 'history' ? (
          <p className="navi-subtitle" style={{ marginTop: 6 }}>
            Histórico e cancelamentos
          </p>
        ) : null}
        <div className="page-header-card" style={{ marginTop: 12 }}>
          <NlCommandBarTrigger onClick={() => setNlOpen(true)} />
        </div>
      </div>

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
