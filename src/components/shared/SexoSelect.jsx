import React from 'react';
import { SEXO_OPTIONS } from '../../lib/leadSexo.js';

export default function SexoSelect({
  id,
  value,
  onChange,
  className = 'form-input',
  style,
  disabled = false,
  emptyLabel = 'Selecione…',
}) {
  return (
    <select
      id={id}
      className={className}
      style={style}
      disabled={disabled}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{emptyLabel}</option>
      {SEXO_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
