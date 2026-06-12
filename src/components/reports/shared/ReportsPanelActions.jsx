import React from 'react';

/** Linha de ações secundárias (exportar, etc.) alinhada à direita. */
export default function ReportsPanelActions({ children, className = '' }) {
  return <div className={['reports-panel-actions', className].filter(Boolean).join(' ')}>{children}</div>;
}
