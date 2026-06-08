import React from 'react';
import FilterBar from '../shared/FilterBar.jsx';
import { DateInputField } from '../DateInput';

/**
 * Barra de filtros padrão do módulo Financeiro (.finance-filters-bar).
 * @param {boolean} [panel] — painel com fundo/borda acima da tabela
 */
export default function FinanceFiltersBar({
  className = '',
  panel = false,
  stackedMobile = true,
  children,
  ...props
}) {
  const rootClass = [
    'finance-filters-bar',
    'navi-toolbar',
    panel ? 'finance-hub-filters' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
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

/**
 * Campo de data compacto na toolbar (De / Até).
 */
export function FinanceToolbarDate({ id, label, value, onChange, className = '' }) {
  const fieldClass = ['finance-filters-bar__field', 'finance-hub-filters__date', className]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={fieldClass}>
      <label htmlFor={id} className="finance-filters-bar__sr-label">
        {label}
      </label>
      <DateInputField
        id={id}
        className="form-input navi-date-filter navi-control--toolbar"
        type="date"
        aria-label={label}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}
