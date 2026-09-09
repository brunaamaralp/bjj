import React from 'react';

/**
 * Quando o dinheiro entra/sai do caixa: na hora ou depois (pendente).
 */
export default function FinanceTxSettlementToggle({
  value = 'now',
  onChange,
  direction = 'in',
  disabled = false,
  disableNow = false,
  id = 'finance-tx-settlement',
}) {
  const mode = value === 'later' ? 'later' : 'now';
  const isOut = String(direction || '').toLowerCase() === 'out';
  const nowLabel = isOut ? 'Pago agora' : 'Recebido agora';
  const laterLabel = isOut ? 'Pagar depois' : 'Receber depois';

  return (
    <div className="form-group">
      <span id={`${id}-label`} className="finance-tx-settlement-toggle__label">
        Quando entra no caixa
      </span>
      <div className="finance-tx-settlement-toggle" role="group" aria-labelledby={`${id}-label`}>
        <button
          type="button"
          id={`${id}-now`}
          className={`finance-tx-settlement-toggle__btn finance-tx-settlement-toggle__btn--now${
            mode === 'now' ? ' finance-tx-settlement-toggle__btn--active' : ''
          }`}
          aria-pressed={mode === 'now'}
          disabled={disabled || disableNow}
          onClick={() => onChange?.('now')}
        >
          {nowLabel}
        </button>
        <button
          type="button"
          id={`${id}-later`}
          className={`finance-tx-settlement-toggle__btn finance-tx-settlement-toggle__btn--later${
            mode === 'later' ? ' finance-tx-settlement-toggle__btn--active' : ''
          }`}
          aria-pressed={mode === 'later'}
          disabled={disabled}
          onClick={() => onChange?.('later')}
        >
          {laterLabel}
        </button>
      </div>
      {disableNow ? (
        <p className="finance-tx-modal__field-hint">
          Lançamentos recorrentes ficam pendentes até a data de vencimento ou confirmação manual.
        </p>
      ) : null}
    </div>
  );
}
