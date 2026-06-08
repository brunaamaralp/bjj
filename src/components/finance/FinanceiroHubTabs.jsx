import React, { useMemo } from 'react';
import HubTabBar from '../shared/HubTabBar.jsx';
import { buildFinanceiroHubTabItems } from '../../lib/financeiroHubTabs.js';

/**
 * Abas de primeiro nível do hub Financeiro (sem Contabilidade / plano / razão / DRE soltos).
 * @param {string} activeLeafTab — slug em ?tab=
 * @param {(leafTab: string) => void} onLeafChange
 * @param {{ navRole?: string, isOwner?: boolean, financeModule: boolean }} access
 */
export default function FinanceiroHubTabs({ activeLeafTab, onLeafChange, access }) {
  const topTabs = useMemo(
    () =>
      buildFinanceiroHubTabItems({
        navRole: access?.navRole,
        isOwner: access?.isOwner,
        financeModule: access?.financeModule,
      }),
    [access?.navRole, access?.isOwner, access?.financeModule]
  );

  return (
    <div className="financeiro-hub-tabs">
      <HubTabBar
        tabs={topTabs}
        activeId={activeLeafTab}
        onChange={onLeafChange}
        ariaLabel="Financeiro"
        fullWidth
        panelIdPrefix="finance-tabpanel-"
        className="financeiro-hub-tabs__primary"
      />
    </div>
  );
}
