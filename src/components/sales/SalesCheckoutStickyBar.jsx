import React from 'react';
import { ShoppingCart } from 'lucide-react';

export default function SalesCheckoutStickyBar({
  totalLabel,
  submitLabel,
  submitDisabled,
  hint,
  creating,
  visible,
}) {
  if (!visible) return null;

  return (
    <div className="sales-checkout-sticky" aria-live="polite">
      {hint ? (
        <p className="sales-checkout-sticky__hint" role="status">
          {hint}
        </p>
      ) : null}
      <div className="sales-checkout-sticky__row">
        <div className="sales-checkout-sticky__total">
          <span className="text-xs text-muted">Total</span>
          <strong>{totalLabel}</strong>
        </div>
        <button
          type="submit"
          className="btn-primary sales-checkout-sticky__submit"
          disabled={submitDisabled}
        >
          <ShoppingCart size={18} aria-hidden />
          <span>{creating ? 'Registrando…' : submitLabel}</span>
        </button>
      </div>
    </div>
  );
}
