import React, { useEffect, useMemo, useRef, useState } from 'react';
import './SearchableGroupedSelect.css';

function filterGroupedOptions(groups, query, getOptionLabel) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return groups;

  const filtered = new Map();
  for (const [group, items] of groups) {
    const groupMatch = String(group || '').toLowerCase().includes(q);
    const matched = groupMatch
      ? items
      : items.filter((item) => String(getOptionLabel(item) || '').toLowerCase().includes(q));
    if (matched.length) filtered.set(group, matched);
  }
  return filtered;
}

function findOptionLabel(groups, value, getOptionValue, getOptionLabel) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  for (const items of groups.values()) {
    for (const item of items) {
      if (getOptionValue(item) === raw) return getOptionLabel(item);
    }
  }
  return raw;
}

/**
 * Select com busca por digitação e opções agrupadas (optgroup).
 *
 * @param {object} props
 * @param {string} [props.id]
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @param {Map<string, object[]>} props.groups
 * @param {(item: object) => string} [props.getOptionValue]
 * @param {(item: object) => string} [props.getOptionLabel]
 * @param {string} [props.placeholder]
 * @param {string} [props.emptyMessage]
 * @param {string} [props.className]
 * @param {boolean} [props.disabled]
 */
export default function SearchableGroupedSelect({
  id,
  value,
  onChange,
  groups,
  getOptionValue = (item) => item.value || item.label,
  getOptionLabel = (item) => item.label,
  placeholder = 'Digite para buscar…',
  emptyMessage = 'Nenhuma opção encontrada.',
  className = '',
  disabled = false,
  ...rest
}) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(() => findOptionLabel(groups, value, getOptionValue, getOptionLabel));

  const selectedLabel = useMemo(
    () => findOptionLabel(groups, value, getOptionValue, getOptionLabel),
    [groups, value, getOptionValue, getOptionLabel]
  );

  useEffect(() => {
    if (!open) setQuery(selectedLabel);
  }, [selectedLabel, open]);

  const filteredGroups = useMemo(
    () => filterGroupedOptions(groups, open ? query : '', getOptionLabel),
    [groups, open, query, getOptionLabel]
  );

  const hasResults = filteredGroups.size > 0;

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
      ref={rootRef}
    >
      <input
        id={id}
        type="text"
        className="form-input searchable-grouped-select__input"
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
        hasResults ? (
          <div
            id={id ? `${id}-listbox` : undefined}
            className="searchable-grouped-select__panel navi-menu__panel"
            role="listbox"
          >
            {[...filteredGroups.entries()].map(([group, items]) => (
              <div key={group} className="searchable-grouped-select__group">
                <div className="navi-menu__label searchable-grouped-select__group-label">{group}</div>
                {items.map((item) => {
                  const optionValue = getOptionValue(item);
                  const optionLabel = getOptionLabel(item);
                  const isSelected = optionValue === value;
                  return (
                    <button
                      key={optionValue}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`navi-menu__item searchable-grouped-select__option${isSelected ? ' navi-menu__item--active' : ''}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(optionValue, optionLabel)}
                    >
                      {optionLabel}
                    </button>
                  );
                })}
              </div>
            ))}
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
