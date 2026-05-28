import React from 'react';

/**
 * Select base para formulários e toolbars.
 *
 * @param {object} props
 * @param {string} [props.id]
 * @param {string} [props.value]
 * @param {(value: string) => void} props.onChange
 * @param {{ value: string, label: string }[]} [props.options]
 * @param {string} [props.emptyLabel]
 * @param {'form'|'toolbar'} [props.density]
 * @param {string} [props.className]
 * @param {React.CSSProperties} [props.style]
 * @param {boolean} [props.disabled]
 * @param {React.ReactNode} [props.children]
 */
export default function FormSelect({
  id,
  value,
  onChange,
  options = [],
  emptyLabel = 'Selecione…',
  density = 'form',
  className = '',
  style,
  disabled = false,
  children,
  ...rest
}) {
  const resolvedClass = [
    'form-input',
    density === 'toolbar' ? 'navi-control--toolbar' : '',
    className && className !== 'form-input' ? className : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <select
      id={id}
      className={resolvedClass}
      style={style}
      disabled={disabled}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    >
      <option value="">{emptyLabel}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
      {children}
    </select>
  );
}
