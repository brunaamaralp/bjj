import React, { useEffect, useMemo, useState } from 'react';
import {
  DISCOUNT_TYPES,
  formatDiscountAmountForInput,
  formatEnrollmentDiscountPreview,
  parseDiscountAmountInput,
  validateEnrollmentDiscount,
} from '../../lib/planBilling.js';
import {
  PRESET_CUSTOM,
  PRESET_NONE,
  formatPresetOptionLabel,
  readEnrollmentDiscountPresets,
  resolvePresetSelectionKey,
} from '../../lib/enrollmentDiscountPresets.js';

const CUSTOM_TYPE_OPTIONS = [
  { value: DISCOUNT_TYPES.FIXED, label: 'Valor fixo (R$)' },
  { value: DISCOUNT_TYPES.PERCENT, label: 'Percentual (%)' },
];

/**
 * Plano + condição promocional (presets da academia ou valor personalizado).
 */
export default function EnrollmentDiscountFields({
  planPrice = 0,
  planName = '',
  financeConfig = null,
  discountPresets: discountPresetsProp = null,
  discountType = DISCOUNT_TYPES.NONE,
  discountAmount = '',
  onTypeChange,
  onAmountChange,
  disabled = false,
  idPrefix = 'enrollment-discount',
}) {
  const presets = useMemo(
    () =>
      Array.isArray(discountPresetsProp)
        ? discountPresetsProp
        : readEnrollmentDiscountPresets(financeConfig),
    [discountPresetsProp, financeConfig]
  );

  const discountTypeValue = discountType || DISCOUNT_TYPES.NONE;
  const discountNumber = parseDiscountAmountInput(discountAmount, discountTypeValue);
  const discountError = validateEnrollmentDiscount(planPrice, discountTypeValue, discountNumber);
  const preview = formatEnrollmentDiscountPreview(planPrice, discountTypeValue, discountNumber);
  const planDisabled = disabled || planPrice <= 0;

  const [presetKey, setPresetKey] = useState(() =>
    resolvePresetSelectionKey(presets, discountTypeValue, discountNumber)
  );

  useEffect(() => {
    setPresetKey(resolvePresetSelectionKey(presets, discountTypeValue, discountNumber));
  }, [presets, discountTypeValue, discountNumber]);

  const handlePresetChange = (key) => {
    setPresetKey(key);
    if (key === PRESET_NONE) {
      onTypeChange?.(DISCOUNT_TYPES.NONE);
      onAmountChange?.('');
      return;
    }
    if (key === PRESET_CUSTOM) {
      if (discountTypeValue === DISCOUNT_TYPES.NONE) {
        onTypeChange?.(DISCOUNT_TYPES.PERCENT);
      }
      return;
    }
    const preset = presets.find((p) => p.id === key);
    if (!preset) return;
    onTypeChange?.(preset.type);
    onAmountChange?.(formatDiscountAmountForInput(preset.amount, preset.type));
  };

  const planHint = planName
    ? `Plano selecionado: ${planName}`
    : planPrice > 0
      ? null
      : 'Selecione um plano acima para calcular o valor promocional.';

  return (
    <div className="form-group">
      <label className="form-label" htmlFor={`${idPrefix}-preset`}>
        Condição promocional
      </label>
      <select
        id={`${idPrefix}-preset`}
        className="form-input"
        value={presetKey}
        disabled={planDisabled}
        onChange={(e) => handlePresetChange(e.target.value)}
      >
        <option value={PRESET_NONE}>Sem desconto</option>
        {presets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {formatPresetOptionLabel(preset)}
          </option>
        ))}
        <option value={PRESET_CUSTOM}>Outro valor…</option>
      </select>

      {planHint ? (
        <p className="text-small text-muted" style={{ margin: '6px 0 0' }}>
          {planHint}
        </p>
      ) : null}

      {presetKey === PRESET_CUSTOM ? (
        <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
          <div>
            <label className="form-label" htmlFor={`${idPrefix}-type`}>
              Tipo do desconto
            </label>
            <select
              id={`${idPrefix}-type`}
              className="form-input"
              value={discountTypeValue === DISCOUNT_TYPES.NONE ? DISCOUNT_TYPES.PERCENT : discountTypeValue}
              disabled={planDisabled}
              onChange={(e) => onTypeChange?.(e.target.value)}
            >
              {CUSTOM_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor={`${idPrefix}-amount`}>
              {discountTypeValue === DISCOUNT_TYPES.FIXED ? 'Desconto (R$)' : 'Desconto (%)'}
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
          </div>
        </div>
      ) : null}

      {planPrice > 0 ? (
        <p className="text-small text-muted" style={{ marginTop: 8, marginBottom: 0 }}>
          {preview}
        </p>
      ) : null}
      {discountError ? (
        <p className="text-small" role="alert" style={{ margin: '6px 0 0', color: 'var(--danger)' }}>
          {discountError}
        </p>
      ) : null}
    </div>
  );
}

export { validateEnrollmentDiscount, parseDiscountAmountInput };
