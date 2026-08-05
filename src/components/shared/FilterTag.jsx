import React from 'react';
import { X } from 'lucide-react';

/**
 * Removable applied-filter chip.
 * @param {{ label: string, onRemove: () => void, className?: string }} props
 */
export default function FilterTag({ label, onRemove, className = '' }) {
  const classes = ['filter-tag', className].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      className={classes}
      onClick={onRemove}
      aria-label={`Remover filtro ${label}`}
    >
      <span>{label}</span>
      <X size={14} aria-hidden />
    </button>
  );
}
