import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { ACQUIRER_INSTALLMENT_COUNTS } from '../../../lib/acquirerFees.js';
import {
  countCaptureInstallmentFeeBands,
  normalizeCaptureMethodFees,
} from '../../../lib/captureMethods.js';

/**
 * Matriz de taxas e prazos por parcela (1x–12x) para um meio de captura.
 */
export default function CaptureMethodFeeMatrix({
  fees: feesProp,
  onChange,
  paymentMethod = 'cartao_credito',
  idPrefix = 'capture-fee',
  maxInstallments = 12,
}) {
  const [expanded, setExpanded] = useState(false);
  const fees = normalizeCaptureMethodFees(feesProp);
  const showParcelado = paymentMethod === 'cartao_credito' && maxInstallments > 1;
  const maxN = Math.min(12, Math.max(1, Number(maxInstallments) || 12));
  const parceladoCount = countCaptureInstallmentFeeBands(fees, maxN);

  const patchRow = (n, patch) => {
    const key = String(n);
    const current = fees[key] || { percent: 0, fixed: 0, creditDays: 0 };
    const next = { ...current, ...patch };
    const merged = { ...fees };
    if (
      !(Number(next.percent) > 0) &&
      !(Number(next.fixed) > 0) &&
      !(Number(next.creditDays) > 0)
    ) {
      delete merged[key];
    } else {
      merged[key] = {
        percent: Number(next.percent) || 0,
        fixed: Number(next.fixed) || 0,
        creditDays: Math.max(0, Math.trunc(Number(next.creditDays) || 0)),
      };
    }
    onChange(merged);
  };

  const row1 = fees['1'] || { percent: 0, fixed: 0, creditDays: 0 };

  return (
    <div className="capture-method-fee-matrix">
      <div className="finance-settings-inset capture-method-fee-matrix__row1">
        <div className="form-group">
          <label className="form-label" htmlFor={`${idPrefix}-1-pct`}>
            {paymentMethod === 'cartao_debito' ? 'Débito' : 'Crédito à vista (1x)'} — taxa (%)
          </label>
          <input
            id={`${idPrefix}-1-pct`}
            className="form-input"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={row1.percent ?? 0}
            onChange={(e) => patchRow(1, { percent: Number(e.target.value || 0) })}
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={`${idPrefix}-1-fix`}>
            Taxa fixa (R$)
          </label>
          <input
            id={`${idPrefix}-1-fix`}
            className="form-input"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={row1.fixed ?? 0}
            onChange={(e) => patchRow(1, { fixed: Number(e.target.value || 0) })}
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={`${idPrefix}-1-days`}>
            Dias para cair na conta
          </label>
          <input
            id={`${idPrefix}-1-days`}
            className="form-input"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={row1.creditDays ?? 0}
            onChange={(e) =>
              patchRow(1, { creditDays: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })
            }
          />
        </div>
      </div>

      {showParcelado ? (
        <>
          <button
            type="button"
            className="finance-installments-toggle"
            aria-expanded={expanded}
            aria-controls={`${idPrefix}-grid`}
            onClick={() => setExpanded((v) => !v)}
          >
            <span className="ctx-label finance-installments-toggle__label">Parcelado (2x–{maxN}x)</span>
            <span className="text-small text-muted finance-installments-toggle__summary">
              {parceladoCount ? `${parceladoCount} faixa(s) configurada(s)` : 'Opcional'}
            </span>
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {expanded ? (
            <div id={`${idPrefix}-grid`} className="finance-installments-grid capture-method-fee-matrix__grid">
              {ACQUIRER_INSTALLMENT_COUNTS.filter((n) => n <= maxN && n >= 2).map((n) => {
                const row = fees[String(n)] || { percent: 0, fixed: 0, creditDays: 0 };
                return (
                  <div key={n} className="capture-method-fee-matrix__installment finance-settings-inset">
                    <span className="ctx-label capture-method-fee-matrix__installment-label">{n}x</span>
                    <div className="form-group">
                      <label className="form-label" htmlFor={`${idPrefix}-${n}-pct`}>
                        Taxa (%)
                      </label>
                      <input
                        id={`${idPrefix}-${n}-pct`}
                        className="form-input finance-compact-input"
                        type="number"
                        min={0}
                        step="0.01"
                        value={row.percent ?? 0}
                        onChange={(e) => patchRow(n, { percent: Number(e.target.value || 0) })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor={`${idPrefix}-${n}-days`}>
                        Dias crédito
                      </label>
                      <input
                        id={`${idPrefix}-${n}-days`}
                        className="form-input finance-compact-input"
                        type="number"
                        min={0}
                        step={1}
                        value={row.creditDays ?? 0}
                        onChange={(e) =>
                          patchRow(n, {
                            creditDays: Math.max(0, Math.trunc(Number(e.target.value) || 0)),
                          })
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
