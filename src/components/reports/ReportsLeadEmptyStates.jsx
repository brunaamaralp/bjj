import React from 'react';
import EmptyState from '../shared/EmptyState.jsx';
import ReportsPanelSection from './shared/ReportsPanelSection.jsx';
import ReportsPanelShell from './shared/ReportsPanelShell.jsx';

export default function ReportsLeadEmptyStates({
  showNoLeadsEmpty,
  showNoActivityEmpty,
  contactLabel,
  contactsPlural,
  workspaceNoun,
}) {
  if (showNoLeadsEmpty) {
    return (
      <ReportsPanelShell>
        <ReportsPanelSection className="reports-empty">
          <EmptyState
            insideCard
            variant="compact"
            tone="solid"
            title={`Nenhum ${contactLabel.toLowerCase()} carregado`}
            description={`Volte ao início ou ao funil e aguarde o carregamento. Se a ${workspaceNoun} ainda não tiver ${contactsPlural.toLowerCase()}, cadastre o primeiro no menu.`}
            role="status"
          />
        </ReportsPanelSection>
      </ReportsPanelShell>
    );
  }

  if (showNoActivityEmpty) {
    return (
      <ReportsPanelShell>
        <ReportsPanelSection className="reports-empty">
          <EmptyState
            insideCard
            variant="compact"
            tone="solid"
            title="Sem atividade neste período"
            description="Tente outro intervalo de datas ou remova o filtro de perfil."
            role="status"
          />
        </ReportsPanelSection>
      </ReportsPanelShell>
    );
  }

  return null;
}
