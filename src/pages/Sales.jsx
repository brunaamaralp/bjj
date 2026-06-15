import '../styles/sales.css';
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { Settings, Monitor, History } from 'lucide-react';
import SalesNewSaleTab from '../components/sales/SalesNewSaleTab';
import SalesHistoryTab from '../components/sales/SalesHistoryTab';
import SalesSettingsSection from '../components/academy/SalesSettingsSection.jsx';
import { useLeadStore } from '../store/useLeadStore';
import {
  lojaVendasTabParams,
  lojaVendasPdvParams,
  resolveSalesSubtab,
  resolveSalesPdvMode,
  salesSubtabNeedsNormalize,
  readSalesPdvPreference,
  writeSalesPdvPreference,
} from '../lib/lojaSalesTabs';
import HubTabBar from '../components/shared/HubTabBar';

const Sales = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const academyId = useLeadStore((s) => s.academyId);
  const configRef = useRef(null);
  const appliedPdvPrefRef = useRef(false);
  const navStateConsumedRef = useRef(false);
  const tabs = useMemo(
    () => [
      { id: 'new', label: 'Nova venda' },
      { id: 'history', label: 'Histórico' },
    ],
    []
  );
  const subtab = resolveSalesSubtab(searchParams);
  const pdvMode = resolveSalesPdvMode(searchParams);
  const wantsConfig = String(searchParams.get('config') || '').trim() === '1';
  const [salesConfigUserOpen, setSalesConfigUserOpen] = useState(false);
  const salesConfigOpen = salesConfigUserOpen || wantsConfig;
  const [historyPeriodFromNav, setHistoryPeriodFromNav] = useState(null);
  const [navStateMarker, setNavStateMarker] = useState(location.state);

  if (location.state !== navStateMarker && !navStateConsumedRef.current) {
    const st = location.state;
    if (st?.dateFrom && st?.dateTo) {
      navStateConsumedRef.current = true;
      setNavStateMarker(location.state);
      setHistoryPeriodFromNav({
        from: st.dateFrom,
        to: st.dateTo,
        subtab: st.subtab,
      });
    }
  }

  useEffect(() => {
    if (!historyPeriodFromNav) return undefined;
    const subtabId =
      historyPeriodFromNav.subtab === 'historico' ? 'history' : resolveSalesSubtab(searchParams);
    if (subtabId !== resolveSalesSubtab(searchParams)) {
      setSearchParams(lojaVendasTabParams(subtabId, searchParams), { replace: true });
    }
    navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
    return undefined;
  }, [historyPeriodFromNav, location.pathname, location.search, navigate, searchParams, setSearchParams]);

  useEffect(() => {
    if (appliedPdvPrefRef.current) return;
    if (subtab !== 'new') return;
    if (searchParams.get('pdv')) {
      appliedPdvPrefRef.current = true;
      return;
    }
    if (readSalesPdvPreference()) {
      appliedPdvPrefRef.current = true;
      setSearchParams(lojaVendasPdvParams(true, searchParams), { replace: true });
    } else {
      appliedPdvPrefRef.current = true;
    }
  }, [searchParams, setSearchParams, subtab]);

  useEffect(() => {
    if (!wantsConfig) return undefined;
    const t = window.setTimeout(() => {
      configRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(t);
  }, [wantsConfig]);

  useEffect(() => {
    if (!salesSubtabNeedsNormalize(searchParams)) return;
    setSearchParams(lojaVendasTabParams(resolveSalesSubtab(searchParams), searchParams), {
      replace: true,
    });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    if (pdvMode && subtab === 'new') {
      document.body.dataset.salesPdv = '1';
    } else {
      document.body.dataset.salesPdv = '0';
    }
    return () => {
      document.body.dataset.salesPdv = '0';
    };
  }, [pdvMode, subtab]);

  const setSubtab = (id) => {
    setSearchParams(lojaVendasTabParams(id, searchParams), { replace: false });
  };

  const togglePdvMode = () => {
    const next = !pdvMode;
    writeSalesPdvPreference(next);
    setSearchParams(lojaVendasPdvParams(next, searchParams), { replace: false });
  };

  const openConfig = () => {
    setSalesConfigUserOpen(true);
    window.setTimeout(() => {
      configRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  return (
    <div
      className={`container sales-page navi-hub-page sales-page--padded${
        pdvMode && subtab === 'new' ? ' sales-page--pdv' : ''
      }`}
    >
      <div className={`loja-subnav sales-subnav${pdvMode && subtab === 'new' ? ' sales-subnav--pdv' : ''}`}>
        {!(pdvMode && subtab === 'new') ? (
          <HubTabBar
            tabs={tabs}
            activeId={subtab}
            onChange={setSubtab}
            ariaLabel="Vendas"
            variant="underline"
            size="sm"
            className="loja-subnav__tabs"
          />
        ) : (
          <div className="sales-pdv-toolbar">
            <strong className="sales-pdv-toolbar__title">Modo PDV</strong>
            <button
              type="button"
              className="btn-ghost sales-pdv-toolbar__link"
              onClick={() => setSubtab('history')}
            >
              <History size={16} aria-hidden />
              Histórico
            </button>
          </div>
        )}
        {academyId ? (
          <div className="loja-subnav__actions">
            {subtab === 'new' ? (
              <button
                type="button"
                className={`btn-outline sales-config-btn${pdvMode ? ' sales-config-btn--active' : ''}`}
                onClick={togglePdvMode}
                aria-pressed={pdvMode}
                title={pdvMode ? 'Sair do modo PDV' : 'Entrar no modo PDV'}
              >
                <Monitor size={16} aria-hidden />
                {pdvMode ? 'Sair do PDV' : 'Modo PDV'}
              </button>
            ) : null}
            {!(pdvMode && subtab === 'new') ? (
              <button
                type="button"
                className="btn-outline sales-config-btn"
                onClick={openConfig}
                aria-expanded={salesConfigOpen}
                aria-controls="sales-config-panel"
                title="Configurações de vendas"
              >
                <Settings size={16} aria-hidden />
                Configurações
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="sales-page__body">
        {subtab === 'new' ? (
          <SalesNewSaleTab pdvMode={pdvMode} />
        ) : (
          <SalesHistoryTab onSwitchTab={setSubtab} initialPeriod={historyPeriodFromNav} />
        )}

        {academyId && salesConfigOpen && !(pdvMode && subtab === 'new') ? (
          <div id="sales-config-panel" ref={configRef} className="mt-4 animate-in">
            <SalesSettingsSection academyId={academyId} />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default Sales;
