import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  ACQUIRER_INSTALLMENT_COUNTS,
  acquirerFeesSummary,
  defaultAcquirerFees,
  normalizeAcquirerFees,
} from '../../../lib/acquirerFees.js';
import { FINANCE_TERM_HINTS } from '../../../lib/financeTermHints.js';
import StatusBanner from '../../shared/StatusBanner.jsx';

export default function FinanceSettingsAcquirerFeesSection({ financeConfig, setFinanceConfig }) {
  const [installmentsExpanded, setInstallmentsExpanded] = useState(false);
  const acquirerFees = normalizeAcquirerFees(financeConfig?.acquirerFees || defaultAcquirerFees());
  const parcelado = acquirerFees.credito_parcelado || {};

  const patchAcquirer = (updater) => {
    setFinanceConfig((prev) => {
      const current = normalizeAcquirerFees(prev.acquirerFees);
      return { ...prev, acquirerFees: updater(current) };
    });
  };

  return (
    <div className="finance-settings-section-body mt-4 finance-settings-acquirer">
      <hr className="finance-settings-section-divider" aria-hidden />
      <h3 className="finance-settings-subtitle">Taxas da operadora (MDR)</h3>
      <p className="finance-settings-lead">
        Custo que a maquininha ou adquirente desconta do valor transacionado. Usado no Caixa, na
        previsão e nos relatórios como taxa financeira — diferente do repasse ao aluno acima.
      </p>

      <StatusBanner variant="info" className="mb-3">
        {FINANCE_TERM_HINTS.previsaoMdrOpcional}
      </StatusBanner>

      <div className="finance-settings-fees-summary card" role="status">
        <span className="finance-settings-fees-summary__text">{acquirerFeesSummary(acquirerFees)}</span>
      </div>

      <div className="finance-settings-inset card">
        <div className="form-group">
          <label>PIX — MDR (%)</label>
          <input
            className="form-input"
            type="number"
            min={0}
            step="0.01"
            value={acquirerFees.pix?.percent ?? 0}
            onChange={(e) =>
              patchAcquirer((fees) => ({
                ...fees,
                pix: { percent: Number(e.target.value || 0), fixed: 0 },
              }))
            }
          />
        </div>
        <div className="finance-settings-group__sep" aria-hidden />
        <div className="form-group">
          <label>Débito — MDR (%)</label>
          <input
            className="form-input"
            type="number"
            min={0}
            step="0.01"
            value={acquirerFees.debito?.percent ?? 0}
            onChange={(e) =>
              patchAcquirer((fees) => ({
                ...fees,
                debito: { percent: Number(e.target.value || 0), fixed: 0 },
              }))
            }
          />
        </div>
        <div className="finance-settings-group__sep" aria-hidden />
        <div className="form-group">
          <label>Crédito à vista — MDR (%)</label>
          <input
            className="form-input"
            type="number"
            min={0}
            step="0.01"
            value={acquirerFees.credito_avista?.percent ?? 0}
            onChange={(e) =>
              patchAcquirer((fees) => ({
                ...fees,
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
        aria-controls="finance-acquirer-installments-grid"
        onClick={() => setInstallmentsExpanded((v) => !v)}
      >
        <span className="ctx-label finance-installments-toggle__label">MDR parcelado</span>
        <span className="text-small text-muted finance-installments-toggle__summary">
          {ACQUIRER_INSTALLMENT_COUNTS.filter((n) => Number(parcelado[String(n)] || 0) > 0).length
            ? `${ACQUIRER_INSTALLMENT_COUNTS.filter((n) => Number(parcelado[String(n)] || 0) > 0).length} faixa(s)`
            : 'Opcional'}
        </span>
        {installmentsExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {installmentsExpanded ? (
        <div id="finance-acquirer-installments-grid" className="finance-installments-grid">
          {ACQUIRER_INSTALLMENT_COUNTS.map((n) => (
            <div key={n} className="finance-field-col">
              <label>{n}x MDR (%)</label>
              <input
                className="form-input finance-compact-input"
                type="number"
                min={0}
                step="0.01"
                value={parcelado[String(n)] ?? 0}
                onChange={(e) =>
                  patchAcquirer((fees) => {
                    const mp = { ...(fees.credito_parcelado || {}) };
                    mp[String(n)] = Number(e.target.value || 0);
                    return { ...fees, credito_parcelado: mp };
                  })
                }
              />
            </div>
          ))}
        </div>
      ) : null}

      <div className="form-group mt-3">
        <label htmlFor="finance-acquirer-anticipation-pct">Antecipação — taxa (%)</label>
        <input
          id="finance-acquirer-anticipation-pct"
          className="form-input"
          type="number"
          min={0}
          step="0.01"
          value={acquirerFees.antecipacao?.percent ?? 0}
          onChange={(e) =>
            patchAcquirer((fees) => ({
              ...fees,
              antecipacao: { percent: Number(e.target.value || 0), fixed: 0 },
            }))
          }
        />
        <p className="text-small text-muted">
          Usada ao registrar antecipação de recebíveis no Caixa (desconto sobre o líquido).
        </p>
      </div>

      <div className="form-group mb-3">
        <label htmlFor="finance-acquirer-fee-policy">Quem absorve o MDR?</label>
        <select
          id="finance-acquirer-fee-policy"
          className="form-input"
          value={financeConfig?.acquirerFeePolicy || 'absorb'}
          onChange={(e) =>
            setFinanceConfig((prev) => ({
              ...prev,
              acquirerFeePolicy: e.target.value,
            }))
          }
        >
          <option value="absorb">Academia absorve (recomendado) — MDR sobre valor cobrado</option>
          <option value="pass_through">
            Repasse no preço — MDR sobre base do plano (use com repasse ao aluno nos planos)
          </option>
        </select>
        <p className="text-small text-muted">
          No modo absorver, o líquido no caixa é bruto menos MDR. O modo repasse no preço só faz
          sentido quando o plano repassa taxas ao aluno.
        </p>
      </div>
    </div>
  );
}
