import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar } from 'lucide-react';
import {
  DATE_INPUT_PLACEHOLDERS,
  isoValueToDisplay,
  isDisplayComplete,
  maskDisplayTyping,
  parseDisplayToIso,
  resolveTypableDateBlur,
  shouldSuppressDateFieldBlur,
} from '../lib/dateInputUtils.js';

const PICKER_TYPES = new Set(['date', 'month', 'datetime-local']);

const ICONS = {
  date: '📅',
  time: '🕐',
  month: '📅',
  'datetime-local': '📅',
};

const TYPABLE_TYPES = new Set(['date', 'month', 'datetime-local']);

function hidePortaledNativePicker(el) {
  if (!el) return;
  el.style.cssText =
    'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;border:0;padding:0;margin:0;z-index:100001;';
}

function positionPortaledNativePicker(el, fieldEl) {
  if (!el || !fieldEl) return;
  const rect = fieldEl.getBoundingClientRect();
  const width = 44;
  el.style.cssText = [
    'position:fixed',
    `top:${rect.top}px`,
    `left:${rect.right - width}px`,
    `width:${width}px`,
    `height:${Math.max(rect.height, 36)}px`,
    'opacity:0.01',
    'pointer-events:auto',
    'border:0',
    'padding:0',
    'margin:0',
    'cursor:pointer',
    'z-index:100001',
  ].join(';');
}

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
    const { iso, valid } = resolveTypableDateBlur(type, display, value);
    if (!valid) {
      setDisplay(isoValueToDisplay(type, value));
      return value;
    }
    setDisplay(iso ? isoValueToDisplay(type, iso) : '');
    if (iso !== value) emitChange(iso);
    return iso;
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

  const fieldRef = useRef(null);
  const nativePickerRef = useRef(null);
  const suppressBlurRef = useRef(false);
  const hasNativePicker = typable && PICKER_TYPES.has(type);

  const handleBlur = useCallback(
    (e) => {
      if (
        suppressBlurRef.current ||
        shouldSuppressDateFieldBlur(e?.relatedTarget, fieldRef.current, nativePickerRef.current)
      ) {
        return;
      }
      const resolvedIso = typable ? handleBlurInternal() : value;
      // Segundo arg: ISO já resolvido (evita commit com draft stale do React).
      onBlurProp?.(e, resolvedIso);
    },
    [handleBlurInternal, onBlurProp, typable, value]
  );

  const hideNativePicker = useCallback(() => {
    hidePortaledNativePicker(nativePickerRef.current);
  }, []);

  const openNativePicker = useCallback(
    (event) => {
      if (disabled) return;
      const el = nativePickerRef.current;
      const field = fieldRef.current;
      if (!el || !field) return;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      // relatedTarget do blur costuma ser null com input aria-hidden/portal —
      // flag explícita evita autosave com valor antigo ao abrir o calendário.
      suppressBlurRef.current = true;
      positionPortaledNativePicker(el, field);
      try {
        el.focus({ preventScroll: true });
        if (typeof el.showPicker === 'function') {
          el.showPicker();
        } else {
          el.click();
        }
      } catch {
        el.click();
      }
      window.setTimeout(() => {
        suppressBlurRef.current = false;
      }, 500);
    },
    [disabled]
  );

  const handleNativePickerChange = useCallback(
    (e) => {
      suppressBlurRef.current = false;
      onChange?.(e);
      hideNativePicker();
    },
    [onChange, hideNativePicker]
  );

  useEffect(() => {
    const el = nativePickerRef.current;
    if (!el || !hasNativePicker) return undefined;
    hidePortaledNativePicker(el);
    const onCancel = () => {
      suppressBlurRef.current = false;
      hideNativePicker();
    };
    el.addEventListener('cancel', onCancel);
    return () => {
      el.removeEventListener('cancel', onCancel);
      hidePortaledNativePicker(el);
    };
  }, [hasNativePicker, hideNativePicker]);

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

  const mergedClass = ['navi-typable-date', hasNativePicker ? 'navi-typable-date--picker' : '', className]
    .filter(Boolean)
    .join(' ');

  const pickerLabel =
    type === 'month' ? 'Abrir seletor de mês' : type === 'datetime-local' ? 'Abrir calendário e horário' : 'Abrir calendário';

  const nativePicker =
    hasNativePicker && typeof document !== 'undefined'
      ? createPortal(
          <input
            ref={nativePickerRef}
            type={type}
            value={value ?? ''}
            onChange={handleNativePickerChange}
            onMouseDown={openNativePicker}
            min={min}
            max={max}
            tabIndex={-1}
            aria-hidden="true"
            disabled={disabled}
            className="navi-native-date-picker navi-native-date-picker--portal"
          />,
          document.body
        )
      : null;

  return (
    <div ref={fieldRef} className="navi-typable-date-field">
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
      {hasNativePicker ? (
        <>
          {nativePicker}
          <button
            type="button"
            className="navi-date-picker-btn"
            onMouseDown={openNativePicker}
            disabled={disabled}
            aria-label={pickerLabel}
            title={pickerLabel}
          >
            <Calendar size={16} aria-hidden />
          </button>
        </>
      ) : null}
    </div>
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
