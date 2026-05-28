import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import SalesNewSaleTab from '../components/sales/SalesNewSaleTab';
import SalesHistoryTab from '../components/sales/SalesHistoryTab';
import NlCommandBar, { NlCommandBarTrigger } from '../components/NlCommandBar';
import { useLeadStore } from '../store/useLeadStore';
import {
  lojaVendasTabParams,
  resolveSalesSubtab,
  salesSubtabNeedsNormalize,
} from '../lib/lojaSalesTabs';
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
  const subtab = resolveSalesSubtab(searchParams);
  useEffect(() => {
    if (!salesSubtabNeedsNormalize(searchParams)) return;
    setSearchParams(lojaVendasTabParams(resolveSalesSubtab(searchParams), searchParams), {
      replace: true,
    });
  }, [searchParams, setSearchParams]);
  const setSubtab = (id) => {
    setSearchParams(lojaVendasTabParams(id, searchParams), { replace: false });
  };

  return (
    <div className="container sales-page navi-hub-page" style={{ paddingTop: 20, paddingBottom: 20 }}>
      <PageHeader
        title="Vendas"
        subtitle="Registre vendas e consulte comprovantes."
        meta={subtab === 'history' ? 'Histórico e cancelamentos' : null}
        toolbar={<NlCommandBarTrigger onClick={() => setNlOpen(true)} />}
      />

      <HubTabBar
        tabs={tabs}
        activeId={subtab}
        onChange={setSubtab}
        ariaLabel="Vendas"
        variant="secondary"
        fullWidth
        className="mt-4"
      />

      {subtab === 'new' ? (
        <SalesNewSaleTab />
      ) : (
        <SalesHistoryTab onSwitchTab={setSubtab} />
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
