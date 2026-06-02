import React from 'react';
import FilterBar from '../shared/FilterBar.jsx';

/**
 * Barra de filtros padrão do módulo Financeiro (.finance-filters-bar).
 */
export default function FinanceFiltersBar({
  className = '',
  stackedMobile = true,
  children,
  ...props
}) {
  const rootClass = ['finance-filters-bar', 'navi-toolbar', className].filter(Boolean).join(' ');
  return (
    <FilterBar className={rootClass} stackedMobile={stackedMobile} {...props}>
      {children}
    </FilterBar>
  );
}

/**
 * Select compacto na toolbar (36px, label só para leitores de tela).
 */
export function FinanceToolbarSelect({
  id,
  label,
  value,
  onChange,
  children,
  className = '',
}) {
  const fieldClass = ['finance-filters-bar__field', className].filter(Boolean).join(' ');
  return (
    <div className={fieldClass}>
      <label htmlFor={id} className="finance-filters-bar__sr-label">
        {label}
      </label>
      <select
        id={id}
        className="form-input navi-control--toolbar"
        aria-label={label}
        value={value}
        onChange={onChange}
      >
        {children}
      </select>
    </div>
  );
}
