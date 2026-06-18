import React from 'react';

/**
 * Segmented control Entrada/Saída com cor semântica (positivo/negativo).
 */
export default function FinanceTxDirectionToggle({
  value = 'in',
  onChange,
  disabled = false,
  showOut = true,
  id = 'finance-tx-direction',
}) {
  const dir = value === 'out' ? 'out' : 'in';

  return (
    <div className="form-group">
      <span id={`${id}-label`} className="finance-tx-direction-toggle__label">
        Tipo
      </span>
      <div className="finance-tx-direction-toggle" role="group" aria-labelledby={`${id}-label`}>
        <button
          type="button"
          id={`${id}-in`}
          className={`finance-tx-direction-toggle__btn finance-tx-direction-toggle__btn--in${
            dir === 'in' ? ' finance-tx-direction-toggle__btn--active' : ''
          }`}
          aria-pressed={dir === 'in'}
          disabled={disabled}
          onClick={() => onChange?.('in')}
        >
          Entrada
        </button>
        {showOut ? (
          <button
            type="button"
            id={`${id}-out`}
            className={`finance-tx-direction-toggle__btn finance-tx-direction-toggle__btn--out${
              dir === 'out' ? ' finance-tx-direction-toggle__btn--active' : ''
            }`}
            aria-pressed={dir === 'out'}
            disabled={disabled}
            onClick={() => onChange?.('out')}
          >
            Saída
          </button>
        ) : null}
      </div>
    </div>
  );
}
