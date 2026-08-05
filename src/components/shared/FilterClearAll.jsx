import React from 'react';

/**
 * Ghost clear control for filter toolbars.
 * @param {{ count: number, onClick: () => void, className?: string }} props
 */
export default function FilterClearAll({ count = 0, onClick, className = '' }) {
  if (!count || count < 1) return null;
  const label = count >= 2 ? 'Limpar tudo' : 'Limpar';
  const classes = ['filter-clear-all', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={classes} onClick={onClick} aria-label="Limpar filtros">
      {label}
    </button>
  );
}
