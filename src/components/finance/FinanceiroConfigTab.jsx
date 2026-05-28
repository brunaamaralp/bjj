import React from 'react';
import ConfigTab from './ConfigTab.jsx';
import CaixaAccountingPanel from './CaixaAccountingPanel.jsx';

/**
 * Aba Configuração do hub Financeiro — planos, taxas, contabilidade owner em uma página.
 */
export default function FinanceiroConfigTab({ academyId, isOwner }) {
  if (!academyId) {
    return <p className="text-small text-muted">Selecione uma academia para configurar o financeiro.</p>;
  }

  return (
    <div className="financeiro-config-tab">
      <ConfigTab academyId={academyId} layout="stacked" contractsMode="link" isOwner={isOwner} />
      <CaixaAccountingPanel mode="stacked" isOwner={isOwner} />
    </div>
  );
}
