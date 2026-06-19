import React from 'react';
import FormSelect from '../shared/FormSelect.jsx';

export default function GraduationSelect({
  id,
  value,
  onChange,
  options = [],
  className = 'form-input',
  style,
  disabled = false,
  emptyLabel = '— opcional —',
  ariaLabel = 'Graduação',
  style,
}) {
  const selectOptions = options.map((label) => ({ value: label, label }));

  return (
    <FormSelect
      id={id}
      value={value || ''}
      onChange={onChange}
      options={selectOptions}
      emptyLabel={emptyLabel}
      className={className}
      style={style}
      disabled={disabled}
      aria-label={ariaLabel}
    />
  );
}
