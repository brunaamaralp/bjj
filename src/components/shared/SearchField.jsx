import React from 'react';
import { Search } from 'lucide-react';

/**
 * Campo de busca padronizado para toolbars (36px, raio e padding do DS).
 *
 * @param {object} props
 * @param {string} props.value
 * @param {(e: React.ChangeEvent<HTMLInputElement>) => void} props.onChange
 * @param {string} [props.placeholder]
 * @param {string} [props.className] — classes no wrapper .navi-search
 * @param {string} [props.inputClassName]
 * @param {string} [props.id]
 * @param {string} [props['aria-label']]
 * @param {string} [props.title]
 * @param {string} [props.type='search']
 */
export default function SearchField({
  value,
  onChange,
  placeholder,
  className = '',
  inputClassName = '',
  id,
  'aria-label': ariaLabel,
  title,
  type = 'search',
  ...rest
}) {
  return (
    <div className={['navi-search', className].filter(Boolean).join(' ')} title={title}>
      <Search size={14} className="navi-search__icon" aria-hidden />
      <input
        id={id}
        type={type}
        className={['navi-control', 'navi-control--toolbar', inputClassName].filter(Boolean).join(' ')}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        {...rest}
      />
    </div>
  );
}
