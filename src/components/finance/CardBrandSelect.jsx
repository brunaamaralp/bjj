import React from 'react';
import { CARD_BRANDS_SELECTABLE, CARD_BRAND_UI_LABELS } from '../../lib/cardBrands.js';
import { requiresCardBrandForPayment } from '../../lib/resolveFeeReceiver.js';
import FieldError from '../shared/FieldError.jsx';

export default function CardBrandSelect({
  financeConfig,
  method,
  installments = 1,
  captureMethodId = '',
  feeReceiverId = '',
  bankAccount = '',
  value = '',
  onChange,
  onBlur,
  id = 'card-brand-select',
  className = 'form-input',
  style,
  disabled = false,
  error = '',
  labelClassName = '',
  wrapperClassName = '',
  variant = 'default',
}) {
  if (
    !requiresCardBrandForPayment(financeConfig, {
      method,
      installments,
      captureMethodId,
      feeReceiverId,
      bankAccount,
    })
  ) {
    return null;
  }

  const invalid = Boolean(error);
  const isCompact = variant === 'compact';
  const inputClass = [
    className,
    invalid ? (isCompact ? ' sales-input--invalid' : ' form-input--error') : '',
  ].join('');

  return (
    <div
      className={[
        isCompact ? 'sales-payment-row__capture-field' : 'form-group card-brand-select',
        wrapperClassName,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <label
        className={[
          isCompact ? 'text-xs sales-payment-row__field-label' : 'form-label',
          labelClassName,
        ]
          .filter(Boolean)
          .join(' ')}
        htmlFor={id}
      >
        Bandeira do cartão <span className="sales-field-required">*</span>
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
      >
        <option value="">Selecione a bandeira…</option>
        {CARD_BRANDS_SELECTABLE.map((brand) => (
          <option key={brand} value={brand}>
            {CARD_BRAND_UI_LABELS[brand]}
          </option>
        ))}
      </select>
      <FieldError id={`${id}-error`}>{error}</FieldError>
      <p className="text-small text-muted card-brand-select__hint">
        Taxas diferentes por bandeira neste meio — informe qual cartão foi usado.
      </p>
    </div>
  );
}
