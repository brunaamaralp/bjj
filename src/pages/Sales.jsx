import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Settings } from 'lucide-react';
import SalesNewSaleTab from '../components/sales/SalesNewSaleTab';
import SalesHistoryTab from '../components/sales/SalesHistoryTab';
import SalesSettingsSection from '../components/academy/SalesSettingsSection.jsx';
import { useLeadStore } from '../store/useLeadStore';
import {
  lojaVendasTabParams,
  resolveSalesSubtab,
  salesSubtabNeedsNormalize,
} from '../lib/lojaSalesTabs';
import HubTabBar from '../components/shared/HubTabBar';

const Sales = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const academyId = useLeadStore((s) => s.academyId);
  const configRef = useRef(null);
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
    if (wantsConfig) {
      setSalesConfigOpen(true);
      const t = window.setTimeout(() => {
        configRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
      return () => window.clearTimeout(t);
    }
    return undefined;
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

  const openConfig = () => {
    setSalesConfigOpen(true);
    window.setTimeout(() => {
      configRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  return (
    <div className="container sales-page navi-hub-page" style={{ paddingBottom: 20 }}>
      <div className="loja-subnav sales-subnav">
        <HubTabBar
          tabs={tabs}
          activeId={subtab}
          onChange={setSubtab}
          ariaLabel="Vendas"
          variant="secondary"
          fullWidth
          className="loja-subnav__tabs"
        />
        {academyId ? (
          <div className="loja-subnav__actions">
            <button
              type="button"
              className="btn-outline"
              onClick={openConfig}
              aria-expanded={salesConfigOpen}
              aria-controls="sales-config-panel"
              title="Configurações de vendas"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <Settings size={16} aria-hidden />
              Configurações
            </button>
          </div>
        ) : null}
      </div>

      {subtab === 'new' ? <SalesNewSaleTab /> : <SalesHistoryTab onSwitchTab={setSubtab} />}

      {academyId && salesConfigOpen ? (
        <div id="sales-config-panel" ref={configRef} className="mt-4 animate-in">
          <SalesSettingsSection academyId={academyId} />
        </div>
      ) : null}
    </div>
  );
};

export default Sales;
