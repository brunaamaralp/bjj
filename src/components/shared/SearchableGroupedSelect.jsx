import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import './SearchableGroupedSelect.css';

const defaultGetOptionValue = (item) => item.value || item.label;
const defaultGetOptionLabel = (item) => item.label;
const defaultGetOptionTitle = (item) => item.title || '';
const defaultGetOptionSearchText = (item) =>
  [defaultGetOptionLabel(item), defaultGetOptionTitle(item)].filter(Boolean).join(' ');

function filterGroupedOptions(groups, query, getOptionLabel, getOptionSearchText) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return groups;

  const filtered = new Map();
  for (const [group, items] of groups) {
    const groupMatch = String(group || '').toLowerCase().includes(q);
    const matched = groupMatch
      ? items
      : items.filter((item) => {
          const haystack = String(getOptionSearchText?.(item) || getOptionLabel(item) || '').toLowerCase();
          return haystack.includes(q);
        });
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

function flattenOptions(groups, getOptionValue, getOptionLabel) {
  const flat = [];
  for (const [group, items] of groups.entries()) {
    for (const item of items) {
      flat.push({
        group,
        item,
        value: getOptionValue(item),
        label: getOptionLabel(item),
      });
    }
  }
  return flat;
}

/**
 * Select com busca por digitação e opções agrupadas (optgroup).
 */
export default function SearchableGroupedSelect({
  id,
  value,
  onChange,
  groups,
  getOptionValue = defaultGetOptionValue,
  getOptionLabel = defaultGetOptionLabel,
  getOptionTitle = defaultGetOptionTitle,
  getOptionSearchText = defaultGetOptionSearchText,
  placeholder = 'Digite para buscar…',
  emptyMessage = 'Nenhuma opção encontrada.',
  hint,
  hintId,
  className = '',
  disabled = false,
  ...rest
}) {
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(() => findOptionLabel(groups, value, getOptionValue, getOptionLabel));
  const [activeIndex, setActiveIndex] = useState(-1);
  const [panelStyle, setPanelStyle] = useState(null);

  const selectedLabel = useMemo(
    () => findOptionLabel(groups, value, getOptionValue, getOptionLabel),
    [groups, value, getOptionValue, getOptionLabel]
  );
  const inputValue = open ? query : selectedLabel;

  const filterQuery = useMemo(() => {
    if (!open) return '';
    const q = String(query || '').trim();
    const selected = String(selectedLabel || '').trim();
    // Ao abrir, mostrar todas as opções até o usuário digitar algo diferente do valor selecionado.
    if (q.toLowerCase() === selected.toLowerCase()) return '';
    return query;
  }, [open, query, selectedLabel]);

  const filteredGroups = useMemo(
    () => filterGroupedOptions(groups, filterQuery, getOptionLabel, getOptionSearchText),
    [groups, filterQuery, getOptionLabel, getOptionSearchText]
  );

  const flatOptions = useMemo(
    () => flattenOptions(filteredGroups, getOptionValue, getOptionLabel),
    [filteredGroups, getOptionValue, getOptionLabel]
  );

  const hasResults = filteredGroups.size > 0;

  const updatePanelPosition = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    const maxHeight = 260;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    const height = Math.min(maxHeight, openUp ? spaceAbove : spaceBelow);
    setPanelStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      top: openUp ? rect.top - height - 4 : rect.bottom + 4,
      maxHeight: height,
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    updatePanelPosition();
    const onScroll = () => updatePanelPosition();
    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, updatePanelPosition, filteredGroups]);

  const pick = (optionValue, optionLabel) => {
    onChange(optionValue);
    setQuery(optionLabel);
    setOpen(false);
    setActiveIndex(-1);
  };

  const keepPanelFocus = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleBlur = (event) => {
    const related = event.relatedTarget;
    window.setTimeout(() => {
      if (panelRef.current?.contains(related)) return;
      if (panelRef.current?.contains(document.activeElement)) return;
      setOpen(false);
      setQuery(selectedLabel);
      setActiveIndex(-1);
    }, 0);
  };

  const handleKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setOpen(true);
      setActiveIndex(0);
      return;
    }
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setQuery(selectedLabel);
      setActiveIndex(-1);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatOptions.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter' && activeIndex >= 0 && flatOptions[activeIndex]) {
      e.preventDefault();
      const opt = flatOptions[activeIndex];
      pick(opt.value, opt.label);
    }
  };

  const panel =
    open && !disabled ? (
      hasResults ? (
        <div
          ref={panelRef}
          id={id ? `${id}-listbox` : undefined}
          className="searchable-grouped-select__panel searchable-grouped-select__panel--portal navi-menu__panel"
          role="listbox"
          style={panelStyle || undefined}
          onMouseDown={keepPanelFocus}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {[...filteredGroups.entries()].map(([group, items]) => (
            <div key={group} className="searchable-grouped-select__group">
              <div className="navi-menu__label searchable-grouped-select__group-label">{group}</div>
              {items.map((item) => {
                const optionValue = getOptionValue(item);
                const optionLabel = getOptionLabel(item);
                const optionTitle = getOptionTitle(item);
                const flatIdx = flatOptions.findIndex((o) => o.value === optionValue);
                const isSelected = optionValue === value;
                const isActive = flatIdx === activeIndex;
                return (
                  <button
                    key={optionValue}
                    type="button"
                    role="option"
                    title={optionTitle || undefined}
                    aria-selected={isSelected || isActive}
                    className={`navi-menu__item searchable-grouped-select__option${isSelected ? ' navi-menu__item--active' : ''}${isActive ? ' searchable-grouped-select__option--active' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActiveIndex(flatIdx)}
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
        <div
          ref={panelRef}
          className="searchable-grouped-select__panel searchable-grouped-select__panel--portal searchable-grouped-select__panel--empty navi-menu__panel"
          style={panelStyle || undefined}
          onMouseDown={keepPanelFocus}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {emptyMessage}
        </div>
      )
    ) : null;

  const describedBy = [hintId, rest['aria-describedby']].filter(Boolean).join(' ') || undefined;

  return (
    <div
      className={`searchable-grouped-select searchable-grouped-select--combo${className ? ` ${className}` : ''}`}
      ref={rootRef}
    >
      <div className="searchable-grouped-select__control">
        <input
          ref={inputRef}
          id={id}
          type="text"
          className="form-input searchable-grouped-select__input"
          value={inputValue}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={id ? `${id}-listbox` : undefined}
          aria-describedby={describedBy}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => {
            setQuery(selectedLabel);
            setOpen(true);
            updatePanelPosition();
          }}
          onClick={() => {
            if (disabled) return;
            setOpen(true);
            updatePanelPosition();
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          {...rest}
        />
        <button
          type="button"
          className="searchable-grouped-select__toggle"
          tabIndex={-1}
          aria-hidden
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (disabled) return;
            setOpen((v) => !v);
            inputRef.current?.focus();
          }}
        >
          <ChevronDown size={16} />
        </button>
      </div>
      {hint && hintId ? (
        <p id={hintId} className="text-small text-muted searchable-grouped-select__hint">
          {hint}
        </p>
      ) : null}
      {typeof document !== 'undefined' && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
