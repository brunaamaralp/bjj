import React from 'react';
import {
  DISCOUNT_TYPES,
  formatEnrollmentDiscountPreview,
  parseDiscountAmountInput,
  validateEnrollmentDiscount,
} from '../../lib/planBilling.js';

const TYPE_OPTIONS = [
  { value: DISCOUNT_TYPES.NONE, label: 'Nenhum' },
  { value: DISCOUNT_TYPES.FIXED, label: 'Valor fixo (R$)' },
  { value: DISCOUNT_TYPES.PERCENT, label: 'Percentual (%)' },
];

/**
 * Tipo + valor de desconto de matrícula com preview do valor final.
 */
export default function EnrollmentDiscountFields({
  planPrice = 0,
  discountType = DISCOUNT_TYPES.NONE,
  discountAmount = '',
  onTypeChange,
  onAmountChange,
  disabled = false,
  idPrefix = 'enrollment-discount',
}) {
  const discountTypeValue = discountType || DISCOUNT_TYPES.NONE;
  const showAmount = discountTypeValue !== DISCOUNT_TYPES.NONE;
  const discountNumber = parseDiscountAmountInput(discountAmount, discountTypeValue);
  const discountError = validateEnrollmentDiscount(planPrice, discountTypeValue, discountNumber);
  const preview = formatEnrollmentDiscountPreview(planPrice, discountTypeValue, discountNumber);
  const planDisabled = disabled || planPrice <= 0;

  return (
    <div className="form-group">
      <label className="form-label" htmlFor={`${idPrefix}-type`}>
        Tipo de desconto
      </label>
      <select
        id={`${idPrefix}-type`}
        className="form-input"
        value={discountTypeValue}
        disabled={planDisabled}
        onChange={(e) => onTypeChange?.(e.target.value)}
      >
        {TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {showAmount ? (
        <>
          <label className="form-label" htmlFor={`${idPrefix}-amount`} style={{ marginTop: 10 }}>
            {discountTypeValue === DISCOUNT_TYPES.PERCENT ? 'Desconto (%)' : 'Desconto (R$)'}
          </label>
          <div style={{ position: 'relative' }}>
            {discountTypeValue === DISCOUNT_TYPES.FIXED ? (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                  fontSize: 13,
                }}
              >
                R$
              </span>
            ) : null}
            <input
              id={`${idPrefix}-amount`}
              className="form-input"
              inputMode="decimal"
              placeholder={discountTypeValue === DISCOUNT_TYPES.PERCENT ? '0' : '0,00'}
              value={discountAmount}
              disabled={planDisabled}
              style={discountTypeValue === DISCOUNT_TYPES.FIXED ? { paddingLeft: 36 } : undefined}
              onChange={(e) => onAmountChange?.(e.target.value)}
            />
            {discountTypeValue === DISCOUNT_TYPES.PERCENT ? (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                  fontSize: 13,
                }}
              >
                %
              </span>
            ) : null}
          </div>
        </>
      ) : null}

      <p className="text-small text-muted" style={{ marginTop: 6, marginBottom: 0 }}>
        {preview}
      </p>
      {discountError ? (
        <p className="text-small" role="alert" style={{ margin: '6px 0 0', color: 'var(--danger)' }}>
          {discountError}
        </p>
      ) : null}
    </div>
  );
}

export { validateEnrollmentDiscount, parseDiscountAmountInput };
