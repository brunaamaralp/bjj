import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';

/**
 * Dropdown compacto de filtro por status (Lista, Exceções, etc.).
 * @param {{ id: string, label: string, count?: number }[]} options — primeira opção deve ser "all"
 */
export default function CompactStatusFilter({
  value,
  onChange,
  options,
  extraSections = [],
  allLabel = 'Todos',
  placeholder,
  showCounts = true,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const allOptions = [
    ...options,
    ...extraSections.flatMap((s) => s.options || []),
  ];
  const activeOption = allOptions.find((o) => o.id === value);
  const isActive = value !== 'all' && value != null && value !== '';

  const buttonLabel =
    isActive && activeOption
      ? showCounts && activeOption.count != null
        ? `${activeOption.label} (${activeOption.count})`
        : activeOption.label
      : placeholder || allLabel;

  useEffect(() => {
    if (!open) return undefined;
    function onDoc(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pick = (id) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div className={`mensal-status-filter ${className}`.trim()} ref={rootRef}>
      <button
        type="button"
        className={`btn-outline mensal-status-filter__trigger${isActive ? ' mensal-status-filter__trigger--active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span>{buttonLabel}</span>
        <ChevronDown size={14} aria-hidden className={open ? 'mensal-status-filter__chev--open' : ''} />
      </button>
      {isActive ? (
        <button
          type="button"
          className="mensal-status-filter__clear"
          onClick={() => onChange('all')}
          aria-label="Limpar filtro"
        >
          <X size={14} />
        </button>
      ) : null}
      {open ? (
        <div className="mensal-status-filter__menu" role="listbox">
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="option"
              aria-selected={value === opt.id}
              className={`mensal-status-filter__option${value === opt.id ? ' mensal-status-filter__option--active' : ''}`}
              onClick={() => pick(opt.id)}
              title={opt.title || undefined}
            >
              <span>
                {value === opt.id ? '●' : '○'} {opt.label}
                {showCounts && opt.count != null ? ` (${opt.count})` : ''}
              </span>
              {value === opt.id ? <Check size={12} aria-hidden /> : null}
            </button>
          ))}
          {extraSections.map((section) => (
            <React.Fragment key={section.label || 'extra'}>
              <div className="mensal-status-filter__divider" role="separator" />
              {section.label ? (
                <div className="mensal-status-filter__section-label">{section.label}</div>
              ) : null}
              {(section.options || []).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={value === opt.id}
                  className={`mensal-status-filter__option${value === opt.id ? ' mensal-status-filter__option--active' : ''}`}
                  onClick={() => pick(opt.id)}
                  title={opt.title || undefined}
                >
                  <span>
                    {value === opt.id ? '●' : '○'} {opt.label}
                    {showCounts && opt.count != null ? ` (${opt.count})` : ''}
                  </span>
                  {value === opt.id ? <Check size={12} aria-hidden /> : null}
                </button>
              ))}
            </React.Fragment>
          ))}
        </div>
      ) : null}
    </div>
  );
}
