import React, { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLeadStore } from '../store/useLeadStore';
import { resolveHubTab } from '../lib/hubTabs';
import HubTabBar from '../components/shared/HubTabBar';
import Sales from './Sales';
import Products from './Products';
import Inventory from './Inventory';

export default function Loja() {
  const modules = useLeadStore((s) => s.modules);
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs = useMemo(() => {
    const items = [];
    if (modules.sales === true) items.push({ id: 'vendas', label: 'Vendas' });
    if (modules.inventory === true || modules.sales === true) {
      items.push({ id: 'produtos', label: 'Produtos' });
    }
    if (modules.inventory === true) items.push({ id: 'estoque', label: 'Estoque' });
    return items;
  }, [modules.sales, modules.inventory]);

  const allowed = useMemo(() => new Set(tabs.map((t) => t.id)), [tabs]);
  const fallback = tabs[0]?.id || 'vendas';
  const activeTab = resolveHubTab(searchParams.get('tab'), allowed, fallback);

  useEffect(() => {
    const t = String(searchParams.get('tab') || '').trim().toLowerCase();
    if (!allowed.has(t) && fallback) {
      setSearchParams({ tab: activeTab }, { replace: true });
    }
  }, [activeTab, allowed, fallback, searchParams, setSearchParams]);

  if (tabs.length === 0) {
    return (
      <div className="container" style={{ paddingTop: 20 }}>
        <p className="navi-subtitle">Módulo de loja não está ativo nesta academia.</p>
      </div>
    );
  }

  const setTab = (id) => setSearchParams({ tab: id }, { replace: false });

  return (
    <div>
      <div className="container" style={{ paddingTop: 12, paddingBottom: 0 }}>
        <HubTabBar tabs={tabs} activeId={activeTab} onChange={setTab} ariaLabel="Vendas" />
      </div>
      {activeTab === 'vendas' && modules.sales === true ? <Sales /> : null}
      {activeTab === 'produtos' && (modules.inventory === true || modules.sales === true) ? <Products /> : null}
      {activeTab === 'estoque' && modules.inventory === true ? <Inventory /> : null}
    </div>
  );
}
