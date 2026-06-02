import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { INSTALLMENT_COUNTS, installmentSummary } from '../../../hooks/useFinanceConfigState.js';

export default function FinanceSettingsFeesSection({ financeConfig, setFinanceConfig }) {
  const [installmentsExpanded, setInstallmentsExpanded] = useState(false);
  const parcelado = financeConfig.cardFees?.credito_parcelado || {};

  return (
    <div className="finance-settings-section-body">
      <p className="text-small text-muted">
        Percentuais descontados em pagamentos com cartão e PIX na mensalidade.
      </p>

      <div className="finance-settings-fees-summary card" role="status">
        <span className="finance-settings-fees-summary__text">{installmentSummary(parcelado)}</span>
      </div>

      <div className="finance-settings-inset card">
        <div className="form-group">
          <label>PIX (%)</label>
          <input
            className="form-input"
            type="number"
            min={0}
            step="0.01"
            value={financeConfig.cardFees?.pix?.percent ?? 0}
            onChange={(e) => {
              setFinanceConfig((prev) => ({
                ...prev,
                cardFees: {
                  ...(prev.cardFees || {}),
                  pix: { percent: Number(e.target.value || 0), fixed: 0 },
                },
              }));
            }}
          />
        </div>
        <div className="finance-settings-group__sep" aria-hidden />
        <div className="form-group">
          <label>Débito (%)</label>
          <input
            className="form-input"
            type="number"
            min={0}
            step="0.01"
            value={financeConfig.cardFees?.debito?.percent ?? 0}
            onChange={(e) => {
              setFinanceConfig((prev) => ({
                ...prev,
                cardFees: {
                  ...(prev.cardFees || {}),
                  debito: { percent: Number(e.target.value || 0), fixed: 0 },
                },
              }));
            }}
          />
        </div>
        <div className="finance-settings-group__sep" aria-hidden />
        <div className="form-group">
          <label>Crédito à vista (%)</label>
          <input
            className="form-input"
            type="number"
            min={0}
            step="0.01"
            value={financeConfig.cardFees?.credito_avista?.percent ?? 0}
            onChange={(e) => {
              setFinanceConfig((prev) => ({
                ...prev,
                cardFees: {
                  ...(prev.cardFees || {}),
                  credito_avista: { percent: Number(e.target.value || 0), fixed: 0 },
                },
              }));
            }}
          />
        </div>
      </div>

      <button
        type="button"
        className="finance-installments-toggle"
        aria-expanded={installmentsExpanded}
        onClick={() => setInstallmentsExpanded((v) => !v)}
      >
        <span className="ctx-label finance-installments-toggle__label">Taxas de parcelamento</span>
        <span className="text-small text-muted finance-installments-toggle__summary">
          {installmentSummary(parcelado)}
        </span>
        {installmentsExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {installmentsExpanded ? (
        <div className="finance-installments-grid">
          {INSTALLMENT_COUNTS.map((n) => (
            <div key={n} className="finance-field-col">
              <label>{n}x</label>
              <input
                className="form-input finance-compact-input"
                type="number"
                min={0}
                step="0.01"
                value={parcelado[String(n)] ?? 0}
                onChange={(e) => {
                  setFinanceConfig((prev) => {
                    const mp = { ...((prev.cardFees || {}).credito_parcelado || {}) };
                    mp[String(n)] = Number(e.target.value || 0);
                    return {
                      ...prev,
                      cardFees: { ...(prev.cardFees || {}), credito_parcelado: mp },
                    };
                  });
                }}
              />
            </div>
          ))}
        </div>
      ) : null}

      <Link to="/financeiro?tab=movimentacoes" className="finance-config-context-link">
        Ver lançamentos →
      </Link>
    </div>
  );
}
