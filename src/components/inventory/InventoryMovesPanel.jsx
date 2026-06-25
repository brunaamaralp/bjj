import React, { useMemo } from 'react';
import HubTabBar from '../shared/HubTabBar.jsx';
import InventoryMovesHistory from './InventoryMovesHistory.jsx';
import InventoryMovesForm from './InventoryMovesForm.jsx';

const MOVES_PANEL_TABS = [
  { id: 'historico', label: 'Histórico' },
  { id: 'nova', label: 'Nova movimentação' },
];

export default function InventoryMovesPanel({
  panelTab = 'historico',
  onPanelTabChange,
  highlightMoveId = '',
  modulesFinance,
  canCorrectEntry = false,
  moveFormProps,
}) {
  const activeTab = MOVES_PANEL_TABS.some((t) => t.id === panelTab) ? panelTab : 'historico';

  const tabs = useMemo(() => MOVES_PANEL_TABS, []);

  return (
    <div className="inventory-moves-panel">
      <HubTabBar
        tabs={tabs}
        activeId={activeTab}
        onChange={onPanelTabChange}
        ariaLabel="Movimentações de estoque"
        variant="pill"
        size="sm"
        className="inventory-moves-panel__tabs mb-3"
      />

      {activeTab === 'historico' ? (
        <InventoryMovesHistory
          highlightMoveId={highlightMoveId}
          modulesFinance={modulesFinance}
          canCorrectEntry={canCorrectEntry}
        />
      ) : (
        <InventoryMovesForm {...moveFormProps} />
      )}
    </div>
  );
}
