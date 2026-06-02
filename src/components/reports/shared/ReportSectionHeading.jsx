import React from 'react';

/**
 * Título de seção padronizado para painéis de Relatórios.
 */
/** @param {{ title: React.ReactNode, subtitle?: string | null, action?: React.ReactNode, className?: string }} props */
export default function ReportSectionHeading({ title, subtitle = null, action = null, className = '' }) {
  return (
    <header className={`report-section-heading ${className}`.trim()}>
      <div className="report-section-heading__row">
        <div>
          <h3 className="report-section-heading__title">{title}</h3>
          {subtitle ? <p className="report-section-heading__subtitle">{subtitle}</p> : null}
        </div>
        {action ? <div className="report-section-heading__action">{action}</div> : null}
      </div>
    </header>
  );
}
