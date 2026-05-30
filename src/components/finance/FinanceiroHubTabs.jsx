import React, { useMemo } from 'react';
import HubTabBar from '../shared/HubTabBar.jsx';
import { FINANCEIRO_SECTIONS } from '../../lib/financeiroHubTabs.js';

/**
 * Abas de primeiro nível do hub Financeiro (sem Contabilidade / plano / razão / DRE soltos).
 * @param {string} activeLeafTab — slug em ?tab=
 * @param {(leafTab: string) => void} onLeafChange
 * @param {{ isOwner: boolean, financeModule: boolean }} access
 */
export default function FinanceiroHubTabs({ activeLeafTab, onLeafChange, access }) {
  const topTabs = useMemo(() => {
    const tabs = [
      { id: FINANCEIRO_SECTIONS.OVERVIEW, label: 'Visão Geral' },
      { id: FINANCEIRO_SECTIONS.MENSALIDADES, label: 'Mensalidades' },
      { id: 'movimentacoes', label: 'Caixa' },
    ];
    if (access?.financeModule) {
      tabs.push({ id: 'previsao', label: 'Previsão' });
      tabs.push({ id: 'fechamento', label: 'Fechamento mensal' });
    }
    if (access?.isOwner && access?.financeModule) {
      tabs.push({ id: 'conciliacao', label: 'Conciliação' });
    }
    return tabs;
  }, [access?.financeModule, access?.isOwner]);

  return (
    <div className="financeiro-hub-tabs">
      <HubTabBar
        tabs={topTabs}
        activeId={activeLeafTab}
        onChange={onLeafChange}
        ariaLabel="Financeiro"
        fullWidth
        className="financeiro-hub-tabs__primary"
      />
    </div>
  );
}
