import React, { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLeadStore } from '../store/useLeadStore';
import { resolveHubTab } from '../lib/hubTabs';
import { resolveSalesSubtab } from '../lib/lojaSalesTabs';
import { INVENTORY_SUBTAB_LABELS, resolveInventorySubtab } from '../lib/lojaInventoryTabs';
import HubTabBar from '../components/shared/HubTabBar';
import PageHeader from '../components/layout/PageHeader.jsx';
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
      <div className="container navi-hub-page">
        <PageHeader
          className="navi-page-header--flush"
          title="Loja"
          subtitle="Gerencie vendas, produtos e estoque."
        />
        <p className="navi-subtitle">Módulo de loja não está ativo nesta academia.</p>
      </div>
    );
  }

  const setTab = (id) => setSearchParams({ tab: id }, { replace: false });

  const hubSubtitle =
    activeTab === 'vendas'
      ? 'Registre vendas e consulte comprovantes.'
      : activeTab === 'produtos'
        ? 'Cadastre itens, variantes e preços para estoque e vendas.'
        : activeTab === 'estoque'
          ? 'Ajuste saldos e movimentações por item.'
          : 'Gerencie vendas, produtos e estoque.';

  const hubMeta = (() => {
    if (activeTab === 'vendas' && resolveSalesSubtab(searchParams) === 'history') {
      return 'Histórico e cancelamentos';
    }
    if (activeTab === 'estoque') {
      return INVENTORY_SUBTAB_LABELS[resolveInventorySubtab(searchParams)] || null;
    }
    return null;
  })();

  return (
    <div className="loja-hub">
      <div className="container loja-hub__tabs navi-hub-page__head">
        <PageHeader
          className="navi-page-header--flush"
          title="Loja"
          subtitle={hubSubtitle}
          meta={hubMeta}
        />
        <HubTabBar tabs={tabs} activeId={activeTab} onChange={setTab} ariaLabel="Loja" fullWidth />
      </div>
      {activeTab === 'vendas' && modules.sales === true ? <Sales /> : null}
      {activeTab === 'produtos' && (modules.inventory === true || modules.sales === true) ? <Products /> : null}
      {activeTab === 'estoque' && modules.inventory === true ? <Inventory /> : null}
    </div>
  );
}
