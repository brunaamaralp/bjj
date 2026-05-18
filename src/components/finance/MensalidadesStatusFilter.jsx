import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';

export default function MensalidadesStatusFilter({
  filter,
  onFilterChange,
  filterCounts,
  reguaFilterChips,
  overdueLabelName,
  overdueLabelCount,
  overdueLabelId,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const primaryOptions = [
    { id: 'all', label: 'Todos', count: filterCounts.all },
    { id: 'paid', label: 'Pagos', count: filterCounts.paid },
    { id: 'awaiting', label: 'Aguardando', count: filterCounts.awaiting },
    { id: 'partial', label: 'Parcial', count: filterCounts.partial },
    { id: 'pending', label: 'Inadimplentes', count: filterCounts.pending },
    { id: 'soon', label: 'A vencer', count: filterCounts.soon },
    { id: 'none', label: 'Sem registro', count: filterCounts.none },
  ];

  const reguaOptions = [...(reguaFilterChips || [])];
  if (overdueLabelId) {
    reguaOptions.push({
      id: 'overdue_label',
      label: overdueLabelName,
      count: overdueLabelCount,
    });
  }

  const activePrimary = primaryOptions.find((o) => o.id === filter);
  const activeRegua = reguaOptions.find((o) => o.id === filter);
  const activeOption = activePrimary || activeRegua;
  const isActive = filter !== 'all';

  const buttonLabel = isActive && activeOption
    ? `${activeOption.label} (${activeOption.count})`
    : 'Todos os status';

  useEffect(() => {
    if (!open) return undefined;
    function onDoc(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pick = (id) => {
    onFilterChange(id);
    setOpen(false);
  };

  return (
    <div className="mensal-status-filter" ref={rootRef}>
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
          onClick={() => onFilterChange('all')}
          aria-label="Limpar filtro de status"
        >
          <X size={14} />
        </button>
      ) : null}
      {open ? (
        <div className="mensal-status-filter__menu" role="listbox">
          {primaryOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="option"
              aria-selected={filter === opt.id}
              className={`mensal-status-filter__option${filter === opt.id ? ' mensal-status-filter__option--active' : ''}`}
              onClick={() => pick(opt.id)}
            >
              <span>
                {filter === opt.id ? '●' : '○'} {opt.label} ({opt.count})
              </span>
              {filter === opt.id ? <Check size={12} aria-hidden /> : null}
            </button>
          ))}
          {reguaOptions.length > 0 ? (
            <>
              <div className="mensal-status-filter__divider" role="separator" />
              <div className="mensal-status-filter__section-label">Régua de cobrança</div>
              {reguaOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={filter === opt.id}
                  className={`mensal-status-filter__option${filter === opt.id ? ' mensal-status-filter__option--active' : ''}`}
                  onClick={() => pick(opt.id)}
                >
                  <span>
                    {filter === opt.id ? '●' : '○'} {opt.label}
                    {opt.count != null ? ` (${opt.count})` : ''}
                  </span>
                  {filter === opt.id ? <Check size={12} aria-hidden /> : null}
                </button>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
