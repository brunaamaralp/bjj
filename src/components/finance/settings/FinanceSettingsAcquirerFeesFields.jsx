import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  ACQUIRER_INSTALLMENT_COUNTS,
  acquirerFeesSummary,
  defaultAcquirerFees,
  normalizeAcquirerFees,
} from '../../../lib/acquirerFees.js';

/**
 * Campos editáveis de taxa da maquininha (reutilizado em Taxas global e modal de conta).
 */
export default function FinanceSettingsAcquirerFeesFields({
  fees: feesProp,
  onChange,
  idPrefix = 'finance-acquirer',
  showAnticipation = true,
  showSummary = true,
  compact = false,
}) {
  const [installmentsExpanded, setInstallmentsExpanded] = useState(false);
  const fees = normalizeAcquirerFees(feesProp || defaultAcquirerFees());
  const parcelado = fees.credito_parcelado || {};

  const patch = (updater) => {
    onChange(updater(normalizeAcquirerFees(fees)));
  };

  return (
    <div className={compact ? 'finance-acquirer-fields finance-acquirer-fields--compact' : 'finance-acquirer-fields'}>
      {showSummary ? (
        <div className="finance-settings-fees-summary card" role="status">
          <span className="finance-settings-fees-summary__text">{acquirerFeesSummary(fees)}</span>
        </div>
      ) : null}

      <div className="finance-settings-inset card">
        <div className="form-group">
          <label htmlFor={`${idPrefix}-pix`}>PIX — taxa (%)</label>
          <input
            id={`${idPrefix}-pix`}
            className="form-input"
            type="number"
            min={0}
            step="0.01"
            value={fees.pix?.percent ?? 0}
            onChange={(e) =>
              patch((f) => ({
                ...f,
                pix: { percent: Number(e.target.value || 0), fixed: 0 },
              }))
            }
          />
        </div>
        <div className="finance-settings-group__sep" aria-hidden />
        <div className="form-group">
          <label htmlFor={`${idPrefix}-debito`}>Débito — taxa (%)</label>
          <input
            id={`${idPrefix}-debito`}
            className="form-input"
            type="number"
            min={0}
            step="0.01"
            value={fees.debito?.percent ?? 0}
            onChange={(e) =>
              patch((f) => ({
                ...f,
                debito: { percent: Number(e.target.value || 0), fixed: 0 },
              }))
            }
          />
        </div>
        <div className="finance-settings-group__sep" aria-hidden />
        <div className="form-group">
          <label htmlFor={`${idPrefix}-credito`}>Crédito à vista — taxa (%)</label>
          <input
            id={`${idPrefix}-credito`}
            className="form-input"
            type="number"
            min={0}
            step="0.01"
            value={fees.credito_avista?.percent ?? 0}
            onChange={(e) =>
              patch((f) => ({
                ...f,
                credito_avista: { percent: Number(e.target.value || 0), fixed: 0 },
              }))
            }
          />
        </div>
      </div>

      <button
        type="button"
        className="finance-installments-toggle"
        aria-expanded={installmentsExpanded}
        aria-controls={`${idPrefix}-installments-grid`}
        onClick={() => setInstallmentsExpanded((v) => !v)}
      >
        <span className="ctx-label finance-installments-toggle__label">Taxas no parcelado</span>
        <span className="text-small text-muted finance-installments-toggle__summary">
          {ACQUIRER_INSTALLMENT_COUNTS.filter((n) => Number(parcelado[String(n)] || 0) > 0).length
            ? `${ACQUIRER_INSTALLMENT_COUNTS.filter((n) => Number(parcelado[String(n)] || 0) > 0).length} faixa(s)`
            : 'Opcional'}
        </span>
        {installmentsExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {installmentsExpanded ? (
        <div id={`${idPrefix}-installments-grid`} className="finance-installments-grid">
          {ACQUIRER_INSTALLMENT_COUNTS.map((n) => (
            <div key={n} className="finance-field-col">
              <label htmlFor={`${idPrefix}-parc-${n}`}>{n}x — taxa (%)</label>
              <input
                id={`${idPrefix}-parc-${n}`}
                className="form-input finance-compact-input"
                type="number"
                min={0}
                step="0.01"
                value={parcelado[String(n)] ?? 0}
                onChange={(e) =>
                  patch((f) => {
                    const mp = { ...(f.credito_parcelado || {}) };
                    mp[String(n)] = Number(e.target.value || 0);
                    return { ...f, credito_parcelado: mp };
                  })
                }
              />
            </div>
          ))}
        </div>
      ) : null}

      {showAnticipation ? (
        <div className="form-group mt-3">
          <label htmlFor={`${idPrefix}-anticipation`}>Antecipação — taxa (%)</label>
          <input
            id={`${idPrefix}-anticipation`}
            className="form-input"
            type="number"
            min={0}
            step="0.01"
            value={fees.antecipacao?.percent ?? 0}
            onChange={(e) =>
              patch((f) => ({
                ...f,
                antecipacao: { percent: Number(e.target.value || 0), fixed: 0 },
              }))
            }
          />
          <p className="text-small text-muted">
            Usada ao registrar antecipação de recebíveis no Caixa.
          </p>
        </div>
      ) : null}
    </div>
  );
}
