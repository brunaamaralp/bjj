import React, { forwardRef, useCallback, useEffect, useState } from 'react';
import {
  DATE_INPUT_PLACEHOLDERS,
  isoValueToDisplay,
  isDisplayComplete,
  maskDisplayTyping,
  parseDisplayToIso,
} from '../lib/dateInputUtils.js';

const ICONS = {
  date: '📅',
  time: '🕐',
  month: '📅',
  'datetime-local': '📅',
};

const TYPABLE_TYPES = new Set(['date', 'month', 'datetime-local']);

function useTypableDateField({ type, value, onChange }) {
  const [display, setDisplay] = useState(() => isoValueToDisplay(type, value));

  useEffect(() => {
    setDisplay(isoValueToDisplay(type, value));
  }, [type, value]);

  const emitChange = useCallback(
    (iso) => {
      if (iso !== value) onChange?.({ target: { value: iso } });
    },
    [onChange, value]
  );

  const handleChange = useCallback(
    (e) => {
      const masked = maskDisplayTyping(type, e.target.value);
      setDisplay(masked);
      if (!String(masked).trim()) {
        emitChange('');
        return;
      }
      if (isDisplayComplete(type, masked)) {
        const iso = parseDisplayToIso(type, masked);
        if (iso) emitChange(iso);
      }
    },
    [type, emitChange]
  );

  const handleBlur = useCallback(() => {
    const trimmed = String(display || '').trim();
    if (!trimmed) {
      if (value) emitChange('');
      return;
    }
    const iso = parseDisplayToIso(type, trimmed);
    if (iso) {
      setDisplay(isoValueToDisplay(type, iso));
      emitChange(iso);
    } else {
      setDisplay(isoValueToDisplay(type, value));
    }
  }, [display, type, value, emitChange]);

  return { display, handleChange, handleBlur };
}

export const DateInputField = forwardRef(function DateInputField(
  {
    type = 'date',
    value,
    onChange,
    onBlur: onBlurProp,
    required = false,
    disabled = false,
    placeholder,
    style,
    className = '',
    'aria-label': ariaLabel,
    id,
    name,
    min,
    max,
  },
  ref
) {
  const typable = TYPABLE_TYPES.has(type);
  const { display, handleChange, handleBlur: handleBlurInternal } = useTypableDateField({
    type,
    value,
    onChange: typable ? onChange : undefined,
  });

  const handleBlur = useCallback(
    (e) => {
      handleBlurInternal();
      onBlurProp?.(e);
    },
    [handleBlurInternal, onBlurProp]
  );

  if (!typable) {
    return (
      <input
        ref={ref}
        id={id}
        name={name}
        type={type}
        value={value ?? ''}
        onChange={onChange}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        style={style}
        className={className}
        aria-label={ariaLabel}
        min={min}
        max={max}
      />
    );
  }

  const mergedClass = ['navi-typable-date', className].filter(Boolean).join(' ');

  return (
    <input
      ref={ref}
      id={id}
      name={name}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      required={required}
      disabled={disabled}
      placeholder={placeholder || DATE_INPUT_PLACEHOLDERS[type]}
      style={style}
      className={mergedClass}
      aria-label={ariaLabel}
      data-date-type={type}
    />
  );
});

DateInputField.displayName = 'DateInputField';

export const DateInput = forwardRef(function DateInput(
  {
    label,
    type = 'date',
    value,
    onChange,
    required = false,
    disabled = false,
    placeholder,
    style,
    className,
    id,
    name,
    min,
    max,
    'aria-label': ariaLabel,
  },
  ref
) {
  const typable = TYPABLE_TYPES.has(type);
  const inputClass = [className, typable ? 'navi-typable-date' : ''].filter(Boolean).join(' ');

  return (
    <div className="form-group">
      {label ? (
        <label htmlFor={id} className="form-label">
          {label}
          {!required ? (
            <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>(opcional)</span>
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
        <DateInputField
          ref={ref}
          id={id}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          min={min}
          max={max}
          aria-label={ariaLabel || label}
          style={{
            paddingLeft: 34,
            width: '100%',
            boxSizing: 'border-box',
            ...style,
          }}
          className={inputClass}
        />
      </div>
    </div>
  );
});

DateInput.displayName = 'DateInput';
