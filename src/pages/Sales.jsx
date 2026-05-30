import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import SalesNewSaleTab from '../components/sales/SalesNewSaleTab';
import SalesHistoryTab from '../components/sales/SalesHistoryTab';
import SalesSettingsSection from '../components/academy/SalesSettingsSection.jsx';
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
  const wantsConfig = String(searchParams.get('config') || '').trim() === '1';
  const [salesConfigOpen, setSalesConfigOpen] = useState(wantsConfig);

  useEffect(() => {
    if (wantsConfig) setSalesConfigOpen(true);
  }, [wantsConfig]);

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

      {academyId ? (
        <div className="mt-4" style={{ borderTop: '1px solid var(--border-light)', paddingTop: 16 }}>
          <button
            type="button"
            className="btn-outline"
            onClick={() => setSalesConfigOpen((v) => !v)}
            aria-expanded={salesConfigOpen}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            Configurações de vendas
            {salesConfigOpen ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
          </button>
          {salesConfigOpen ? (
            <div className="mt-3 animate-in">
              <SalesSettingsSection academyId={academyId} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default Sales;
