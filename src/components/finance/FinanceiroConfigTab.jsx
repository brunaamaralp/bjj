import React from 'react';
import ConfigTab from './ConfigTab.jsx';
import CaixaAccountingPanel from './CaixaAccountingPanel.jsx';

/** Minha academia → Financeiro: parâmetros e plano de contas (sem operação/histórico). */
export default function FinanceiroConfigTab({ academyId, isOwner }) {
  if (!academyId) {
    return <p className="text-small text-muted">Selecione uma academia para configurar o financeiro.</p>;
  }

  return (
    <div className="financeiro-config-tab">
      <ConfigTab academyId={academyId} layout="stacked" isOwner={isOwner} />
      {isOwner ? <CaixaAccountingPanel scope="settings" isOwner={isOwner} /> : null}
    </div>
  );
}
