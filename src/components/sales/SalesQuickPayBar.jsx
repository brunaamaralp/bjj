import React from 'react';
import { formatBRLFromCents } from '../../lib/moneyBr';
import { buildQuickPayment } from '../../lib/salePayments';

const QUICK_FORMS = [
  { forma: 'pix', label: 'PIX' },
  { forma: 'dinheiro', label: 'Dinheiro' },
  { forma: 'cartao_debito', label: 'Débito' },
  { forma: 'cartao_credito', label: 'Crédito' },
];

export default function SalesQuickPayBar({
  totalCents,
  disabled,
  onApply,
  onFocusCashReceived,
  compact = false,
}) {
  const total = Math.max(0, Math.round(Number(totalCents) || 0));
  const totalLabel = formatBRLFromCents(total);

  const handleClick = (forma) => {
    onApply?.(buildQuickPayment(forma, total));
    if (forma === 'dinheiro') {
      window.setTimeout(() => onFocusCashReceived?.(), 50);
    }
  };

  return (
    <div className={`sales-quick-pay${compact ? ' sales-quick-pay--compact' : ''}`}>
      <span className="sales-quick-pay__label text-xs text-muted">Pagamento rápido</span>
      <div className="sales-quick-pay__buttons" role="group" aria-label="Pagamento rápido">
        {QUICK_FORMS.map((q) => (
          <button
            key={q.forma}
            type="button"
            className="btn-outline sales-quick-pay__btn"
            disabled={disabled || total <= 0}
            onClick={() => handleClick(q.forma)}
          >
            <span className="sales-quick-pay__btn-label">{q.label}</span>
            <span className="sales-quick-pay__btn-total">{totalLabel}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
