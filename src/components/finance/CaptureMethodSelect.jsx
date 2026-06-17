import React from 'react';
import { formatCaptureMethodOptionLabel, listActiveCaptureMethods } from '../../lib/captureMethods.js';
import { needsCaptureMethodSelect } from '../../lib/captureMethodPaymentForm.js';
import FieldError from '../shared/FieldError.jsx';

export default function CaptureMethodSelect({
  financeConfig,
  method,
  value = '',
  onChange,
  id = 'capture-method-select',
  className = 'form-input',
  style,
  disabled = false,
  error = '',
  variant = 'default',
  hint = '',
  onBlur,
  showRequired = true,
}) {
  if (!needsCaptureMethodSelect(financeConfig, method)) return null;

  const options = listActiveCaptureMethods(financeConfig, method);
  const isCompact = variant === 'compact';
  const invalid = Boolean(error);
  const inputClass = [
    className,
    invalid ? (isCompact ? ' sales-input--invalid' : ' form-input--error') : '',
  ].join('');

  return (
    <div
      className={isCompact ? 'sales-payment-row__capture-field' : 'form-group capture-method-select'}
    >
      <label
        className={isCompact ? 'text-xs sales-payment-row__field-label' : 'form-label'}
        htmlFor={id}
      >
        Recebido via
        {showRequired ? <span className="sales-field-required"> *</span> : null}
      </label>
      <select
        id={id}
        className={inputClass}
        style={style}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        required
        aria-invalid={invalid ? 'true' : undefined}
        aria-describedby={
          [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined
        }
      >
        <option value="">Selecione o meio…</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {formatCaptureMethodOptionLabel(c)}
          </option>
        ))}
      </select>
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-small text-muted capture-method-select__hint">
          {hint}
        </p>
      ) : null}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}
