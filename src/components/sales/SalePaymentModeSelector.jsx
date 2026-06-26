import React from 'react';

const DEFAULT_MODES = [
  { id: 'integral', label: 'Pagamento integral' },
  { id: 'partial', label: 'Receber parte agora' },
  { id: 'deferred', label: 'Vender a prazo' },
];

export const STUDENT_SALE_PAYMENT_MODES = [
  { id: 'integral', label: 'Pagamento integral' },
  { id: 'deferred', label: 'Vender a prazo' },
];

export function derivePaymentMode({ partialSale, deferredSale }) {
  if (deferredSale) return 'deferred';
  if (partialSale) return 'partial';
  return 'integral';
}

export default function SalePaymentModeSelector({
  value,
  onChange,
  disabled,
  modes = DEFAULT_MODES,
}) {
  return (
    <div className="sales-payment-mode" role="radiogroup" aria-label="Como receber">
      <span className="sales-payment-mode__label text-xs">Como receber</span>
      <div className="sales-payment-mode__options">
        {modes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            role="radio"
            aria-checked={value === mode.id}
            className={`sales-payment-mode__btn${
              value === mode.id ? ' sales-payment-mode__btn--active' : ''
            }`}
            disabled={disabled}
            onClick={() => onChange(mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </div>
    </div>
  );
}
