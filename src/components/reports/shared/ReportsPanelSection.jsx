import React from 'react';
import ReportSectionHeading from './ReportSectionHeading.jsx';

/**
 * Bloco em card com título opcional — padrão visual das abas de Relatórios.
 */
export default function ReportsPanelSection({
  title,
  subtitle,
  action,
  children,
  className = '',
  as = 'section',
  ...rest
}) {
  const SectionTag = as;
  const hasHeading = Boolean(title || subtitle || action);
  return (
    <SectionTag className={['reports-panel-section card', className].filter(Boolean).join(' ')} {...rest}>
      {hasHeading ? <ReportSectionHeading title={title} subtitle={subtitle} action={action} /> : null}
      {children}
    </SectionTag>
  );
}
