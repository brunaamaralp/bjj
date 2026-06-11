import React from 'react';

/**
 * Subtítulo de bloco dentro do painel Financeiro (Minha academia).
 * Um nível abaixo de FinanceSettingsDetailHeader.
 */
export default function FinanceSettingsSectionHeader({
  as = 'h3',
  title,
  subtitle,
  actions,
  className = '',
}) {
  const Tag = as;

  return (
    <div className={`finance-settings-section-header ${className}`.trim()}>
      <div className="finance-settings-section-header__row">
        <Tag className="finance-settings-section-title">{title}</Tag>
        {actions ? <div className="finance-settings-section-header__actions">{actions}</div> : null}
      </div>
      {subtitle ? <p className="finance-settings-section-subtitle">{subtitle}</p> : null}
    </div>
  );
}
