import React from 'react';
import {
  FINANCE_REGIME,
  financeRegimeLabel,
  getFinanceRegime,
  setFinanceRegime,
} from '../../lib/financeCompetence.js';

const REGIME_HINTS = {
  [FINANCE_REGIME.CASH]:
    'Mostra valores na data em que o dinheiro entrou ou saiu (liquidação). Ideal para conferir o saldo real.',
  [FINANCE_REGIME.COMPETENCE]:
    'Mostra valores no mês em que a receita ou despesa ocorreu, mesmo sem liquidação. Útil para DRE e fechamento.',
};

/**
 * Toggle caixa / competência persistido por academia.
 */
export default function FinanceRegimeToggle({ academyId, value, onChange, className = '' }) {
  const regime = value ?? (academyId ? getFinanceRegime(academyId) : FINANCE_REGIME.CASH);

  const setRegime = (next) => {
    if (academyId) setFinanceRegime(academyId, next);
    onChange?.(next);
  };

  const rootClass = ['finance-regime-toggle', className].filter(Boolean).join(' ');

  return (
    <div className={rootClass} role="group" aria-label="Regime de visualização financeira">
      <span className="finance-regime-toggle__label">Regime:</span>
      <button
        type="button"
        className={`btn-outline btn-sm${regime === FINANCE_REGIME.CASH ? ' finance-regime-active' : ''}`}
        aria-pressed={regime === FINANCE_REGIME.CASH}
        onClick={() => setRegime(FINANCE_REGIME.CASH)}
      >
        Caixa
      </button>
      <button
        type="button"
        className={`btn-outline btn-sm${regime === FINANCE_REGIME.COMPETENCE ? ' finance-regime-active' : ''}`}
        aria-pressed={regime === FINANCE_REGIME.COMPETENCE}
        onClick={() => setRegime(FINANCE_REGIME.COMPETENCE)}
      >
        Competência
      </button>
      <p className="finance-regime-toggle__hint" id="finance-regime-hint">
        <strong>{financeRegimeLabel(regime)}:</strong> {REGIME_HINTS[regime] || REGIME_HINTS[FINANCE_REGIME.CASH]}
      </p>
    </div>
  );
}
