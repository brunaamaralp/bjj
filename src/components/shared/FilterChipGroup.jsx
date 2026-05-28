import React from 'react';

export default function FilterChipGroup({
  options = [],
  value,
  onChange,
  className = '',
  size = 'md',
}) {
  return (
    <div className={['filter-chip-group', className].filter(Boolean).join(' ')}>
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            className={[
              'filter-chip',
              size === 'sm' ? 'filter-chip--sm' : '',
              active ? 'is-active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onChange(opt.id)}
            title={opt.title || undefined}
          >
            <span>{opt.label}</span>
            {opt.count != null ? <span className="filter-count">{opt.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
