import React from 'react';

const MODES = [
  { id: 'integral', label: 'Pagamento integral' },
  { id: 'partial', label: 'Receber parte agora' },
  { id: 'deferred', label: 'Vender a prazo' },
];

export function derivePaymentMode({ partialSale, deferredSale }) {
  if (deferredSale) return 'deferred';
  if (partialSale) return 'partial';
  return 'integral';
}

export default function SalePaymentModeSelector({ value, onChange, disabled }) {
  return (
    <div className="sales-payment-mode" role="radiogroup" aria-label="Como receber">
      <span className="sales-payment-mode__label text-xs">Como receber</span>
      <div className="sales-payment-mode__options">
        {MODES.map((mode) => (
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
