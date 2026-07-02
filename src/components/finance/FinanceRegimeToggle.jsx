import React from 'react';
import {
  FINANCE_REGIME,
  getFinanceRegime,
  setFinanceRegime,
} from '../../lib/financeCompetence.js';
import Hint from '../shared/Hint.jsx';

const REGIME_HINTS = {
  [FINANCE_REGIME.CASH]:
    'Mostra só movimentos de caixa (exclui CMV de competência). Valores na data de liquidação.',
  [FINANCE_REGIME.COMPETENCE]:
    'Mostra todos os lançamentos, incluindo CMV de competência. Útil para DRE e fechamento.',
};

/**
 * Toggle caixa / competência persistido por academia.
 */
export default function FinanceRegimeToggle({
  academyId,
  value,
  onChange,
  className = '',
  hintStyle = 'inline',
  actorRole = '',
  allowCompetence = true,
}) {
  const isReceptionist = actorRole === 'receptionist';
  const regime = value ?? (academyId ? getFinanceRegime(academyId, { actorRole }) : FINANCE_REGIME.CASH);

  const setRegime = (next) => {
    if (isReceptionist && next === FINANCE_REGIME.COMPETENCE) return;
    if (academyId) setFinanceRegime(academyId, next, { actorRole });
    onChange?.(next);
  };

  const rootClass = [
    'finance-regime-toggle',
    hintStyle === 'tooltip' ? 'finance-regime-toggle--hint-tooltip' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

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
        disabled={!allowCompetence || isReceptionist}
        title={isReceptionist ? 'Modo competência disponível para gestores' : undefined}
      >
        Competência
      </button>
      {hintStyle === 'tooltip' ? (
        <Hint
          text={REGIME_HINTS[regime] || REGIME_HINTS[FINANCE_REGIME.CASH]}
          position="top"
          className="finance-regime-toggle__hint-icon"
        />
      ) : (
        <p className="finance-regime-toggle__hint" id="finance-regime-hint">
          <strong>{regime === FINANCE_REGIME.COMPETENCE ? 'Competência' : 'Caixa'}:</strong>{' '}
          {REGIME_HINTS[regime] || REGIME_HINTS[FINANCE_REGIME.CASH]}
        </p>
      )}
    </div>
  );
}
