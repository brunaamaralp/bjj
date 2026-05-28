import React from 'react';
import { SEXO_OPTIONS } from '../../lib/leadSexo.js';
import FormSelect from './FormSelect.jsx';

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
    <FormSelect
      id={id}
      value={value || ''}
      onChange={onChange}
      options={SEXO_OPTIONS}
      emptyLabel={emptyLabel}
      className={className}
      style={style}
      disabled={disabled}
    />
  );
}
