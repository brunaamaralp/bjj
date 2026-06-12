import React from 'react';
import EmptyState from '../shared/EmptyState.jsx';

export default function ReportsLeadEmptyStates({
  showNoLeadsEmpty,
  showNoActivityEmpty,
  contactLabel,
  contactsPlural,
  workspaceNoun,
}) {
  if (showNoLeadsEmpty) {
    return (
      <div className="reports-empty card mt-4">
        <EmptyState
          insideCard
          variant="compact"
          tone="solid"
          title={`Nenhum ${contactLabel.toLowerCase()} carregado`}
          description={`Volte ao início ou ao funil e aguarde o carregamento. Se a ${workspaceNoun} ainda não tiver ${contactsPlural.toLowerCase()}, cadastre o primeiro no menu.`}
          role="status"
        />
      </div>
    );
  }

  if (showNoActivityEmpty) {
    return (
      <div className="reports-empty card mt-4">
        <EmptyState
          insideCard
          variant="compact"
          tone="solid"
          title="Sem atividade neste período"
          description="Tente outro intervalo de datas ou remova os filtros de origem/perfil."
          role="status"
        />
      </div>
    );
  }

  return null;
}
