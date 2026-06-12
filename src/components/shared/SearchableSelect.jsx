import React, { useEffect, useMemo, useRef, useState } from 'react';
import './SearchableGroupedSelect.css';

function filterOptions(options, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return options;
  return options.filter((opt) => String(opt.label || '').toLowerCase().includes(q));
}

function findOptionLabel(options, value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = options.find((opt) => opt.value === raw);
  return match?.label || raw;
}

/**
 * Select com busca por digitação (lista plana).
 *
 * @param {object} props
 * @param {string} [props.id]
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @param {{ value: string, label: string }[]} props.options
 * @param {string} [props.placeholder]
 * @param {string} [props.emptyMessage]
 * @param {string} [props.className]
 * @param {string} [props.inputClassName]
 * @param {React.CSSProperties} [props.style]
 * @param {boolean} [props.disabled]
 */
export default function SearchableSelect({
  id,
  value,
  onChange,
  options = [],
  placeholder = 'Digite para buscar…',
  emptyMessage = 'Nenhuma opção encontrada.',
  className = '',
  inputClassName = '',
  style,
  disabled = false,
  ...rest
}) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(() => findOptionLabel(options, value));

  const selectedLabel = useMemo(() => findOptionLabel(options, value), [options, value]);

  useEffect(() => {
    if (!open) setQuery(selectedLabel);
  }, [selectedLabel, open]);

  const filteredOptions = useMemo(
    () => filterOptions(options, open ? query : ''),
    [options, open, query]
  );

  const pick = (optionValue, optionLabel) => {
    onChange(optionValue);
    setQuery(optionLabel);
    setOpen(false);
  };

  const handleBlur = () => {
    window.setTimeout(() => {
      setOpen(false);
      setQuery(selectedLabel);
    }, 180);
  };

  return (
    <div
      className={`searchable-grouped-select${className ? ` ${className}` : ''}`}
      style={style}
      ref={rootRef}
    >
      <input
        id={id}
        type="text"
        className={['form-input', 'searchable-grouped-select__input', inputClassName].filter(Boolean).join(' ')}
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={id ? `${id}-listbox` : undefined}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        {...rest}
      />
      {open && !disabled ? (
        filteredOptions.length > 0 ? (
          <div
            id={id ? `${id}-listbox` : undefined}
            className="searchable-grouped-select__panel navi-menu__panel"
            role="listbox"
          >
            {filteredOptions.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`navi-menu__item searchable-grouped-select__option${isSelected ? ' navi-menu__item--active' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(opt.value, opt.label)}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="searchable-grouped-select__panel searchable-grouped-select__panel--empty navi-menu__panel">
            {emptyMessage}
          </div>
        )
      ) : null}
    </div>
  );
}
