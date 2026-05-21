import React from 'react';
import {
  FINANCE_REGIME,
  financeRegimeLabel,
  getFinanceRegime,
  setFinanceRegime,
} from '../../lib/financeCompetence.js';

/**
 * Toggle caixa / competência persistido por academia.
 */
export default function FinanceRegimeToggle({ academyId, value, onChange, className = '' }) {
  const regime = value ?? (academyId ? getFinanceRegime(academyId) : FINANCE_REGIME.CASH);

  const setRegime = (next) => {
    if (academyId) setFinanceRegime(academyId, next);
    onChange?.(next);
  };

  return (
    <div
      className={className}
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}
      role="group"
      aria-label="Regime de visualização financeira"
    >
      <span className="text-xs text-muted" style={{ fontWeight: 500 }}>
        Regime:
      </span>
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
      <span className="text-xs text-muted" style={{ marginLeft: 4 }}>
        Visualizando por {financeRegimeLabel(regime).toLowerCase()}
      </span>
    </div>
  );
}
