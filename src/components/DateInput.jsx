import React, { forwardRef } from 'react';

const ICONS = {
  date: '📅',
  time: '🕐',
  month: '📅',
  'datetime-local': '📅',
};

export const DateInput = forwardRef(function DateInput(
  { label, type = 'date', value, onChange, required = false, disabled = false, placeholder, style, className },
  ref
) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label ? (
        <label
          style={{
            fontSize: '11px',
            fontWeight: 500,
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {label}
          {!required ? (
            <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: 4 }}>(opcional)</span>
          ) : null}
        </label>
      ) : null}
      <div style={{ position: 'relative' }}>
        <span
          style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 15,
            pointerEvents: 'none',
            opacity: 0.5,
          }}
          aria-hidden
        >
          {ICONS[type] || ICONS.date}
        </span>
        <input
          ref={ref}
          type={type}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          style={{
            paddingLeft: 34,
            width: '100%',
            boxSizing: 'border-box',
            ...style,
          }}
          className={className}
        />
      </div>
    </div>
  );
});

DateInput.displayName = 'DateInput';
