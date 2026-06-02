import React from 'react';
import FinanceSettingsDetailHeader from '../../finance/settings/FinanceSettingsDetailHeader.jsx';
import '../../finance/finance.css';

/**
 * Layout two-column (sidebar + conteúdo) — mesmo markup/classes do Financeiro em Minha Academia.
 */
export default function AcademyTabSettingsLayout({
  navLabel,
  items,
  activeId,
  onSelect,
  title,
  subtitle,
  onBack,
  backLabel,
  children,
  className = '',
}) {
  return (
    <div className={`finance-settings-layout academy-tab-settings-layout ${className}`.trim()}>
      <nav className="finance-settings-sidenav" aria-label={navLabel}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`finance-settings-sidenav__item${activeId === item.id ? ' finance-settings-sidenav__item--active' : ''}`}
            onClick={() => onSelect(item.id)}
            aria-current={activeId === item.id ? 'page' : undefined}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="finance-settings-layout__content">
        {title ? (
          <FinanceSettingsDetailHeader
            title={title}
            subtitle={subtitle}
            onBack={onBack}
            backLabel={backLabel}
          />
        ) : null}
        {children}
      </div>
    </div>
  );
}
