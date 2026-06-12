import React from 'react';

/** Container vertical padronizado para conteúdo de cada aba de Relatórios. */
export default function ReportsPanelShell({ children, className = '' }) {
  return <div className={['reports-panel', className].filter(Boolean).join(' ')}>{children}</div>;
}
