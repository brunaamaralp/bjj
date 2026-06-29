import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { ACQUIRER_INSTALLMENT_COUNTS } from '../../../lib/acquirerFees.js';
import { CARD_BRANDS, CARD_BRAND_UI_LABELS } from '../../../lib/cardBrands.js';
import {
  emptyFeeReceiverFeeTable,
  normalizeFeeReceiverFeeTable,
} from '../../../lib/feeReceivers.js';

const BRAND_COLUMNS = CARD_BRANDS.filter((b) => b !== 'default');

function BrandGrid({ byBrand, onPatchBrand, idPrefix, label }) {
  return (
    <div className="fee-receiver-matrix__brand-grid">
      <p className="ctx-label fee-receiver-matrix__row-label">{label}</p>
      <div className="fee-receiver-matrix__table-wrap">
        <table className="fee-receiver-matrix__table">
          <thead>
            <tr>
              <th scope="col">Bandeira</th>
              <th scope="col">Taxa (%)</th>
              <th scope="col">Fixa (R$)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">{CARD_BRAND_UI_LABELS.default}</th>
              <td>
                <input
                  id={`${idPrefix}-default-pct`}
                  className="form-input finance-compact-input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={byBrand.default?.percent ?? 0}
                  onChange={(e) =>
                    onPatchBrand('default', { percent: Number(e.target.value || 0) })
                  }
                />
              </td>
              <td>
                <input
                  className="form-input finance-compact-input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={byBrand.default?.fixed ?? 0}
                  onChange={(e) =>
                    onPatchBrand('default', { fixed: Number(e.target.value || 0) })
                  }
                />
              </td>
            </tr>
            {BRAND_COLUMNS.map((brand) => (
              <tr key={brand}>
                <th scope="row">{CARD_BRAND_UI_LABELS[brand]}</th>
                <td>
                  <input
                    className="form-input finance-compact-input"
                    type="number"
                    min={0}
                    step="0.01"
                    value={byBrand[brand]?.percent ?? ''}
                    placeholder={String(byBrand.default?.percent ?? 0)}
                    onChange={(e) =>
                      onPatchBrand(brand, {
                        percent: e.target.value === '' ? 0 : Number(e.target.value || 0),
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    className="form-input finance-compact-input"
                    type="number"
                    min={0}
                    step="0.01"
                    value={byBrand[brand]?.fixed ?? ''}
                    placeholder={String(byBrand.default?.fixed ?? 0)}
                    onChange={(e) =>
                      onPatchBrand(brand, {
                        fixed: e.target.value === '' ? 0 : Number(e.target.value || 0),
                      })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Matriz de taxas por bandeira para um recebedor.
 */
export default function FeeReceiverMatrix({ fees: feesProp, onChange, idPrefix = 'fee-recv' }) {
  const [parceladoOpen, setParceladoOpen] = useState(false);
  const fees = normalizeFeeReceiverFeeTable(feesProp || emptyFeeReceiverFeeTable());

  const patchFees = (updater) => {
    onChange(updater(normalizeFeeReceiverFeeTable(fees)));
  };

  const patchByBrand = (methodKey, brand, patch, installmentKey = null) => {
    patchFees((table) => {
      if (methodKey === 'pix' || methodKey === 'antecipacao') {
        return {
          ...table,
          [methodKey]: {
            ...(table[methodKey] || { percent: 0, fixed: 0 }),
            ...patch,
          },
        };
      }
      if (installmentKey) {
        const parcelado = { ...table.credito_parcelado };
        const current = { ...(parcelado[installmentKey] || { default: { percent: 0, fixed: 0 } }) };
        current[brand] = { ...(current[brand] || { percent: 0, fixed: 0 }), ...patch };
        parcelado[installmentKey] = current;
        return { ...table, credito_parcelado: parcelado };
      }
      const current = { ...(table[methodKey] || { default: { percent: 0, fixed: 0 } }) };
      current[brand] = { ...(current[brand] || { percent: 0, fixed: 0 }), ...patch };
      return { ...table, [methodKey]: current };
    });
  };

  const copyDefaultToAllBrands = (methodKey, installmentKey = null) => {
    patchFees((table) => {
      let source;
      if (installmentKey) {
        source = table.credito_parcelado?.[installmentKey]?.default || { percent: 0, fixed: 0 };
        const parcelado = { ...table.credito_parcelado };
        const next = { default: { ...source } };
        for (const brand of BRAND_COLUMNS) {
          next[brand] = { ...source };
        }
        parcelado[installmentKey] = next;
        return { ...table, credito_parcelado: parcelado };
      }
      source = table[methodKey]?.default || { percent: 0, fixed: 0 };
      const next = { default: { ...source } };
      for (const brand of BRAND_COLUMNS) {
        next[brand] = { ...source };
      }
      return { ...table, [methodKey]: next };
    });
  };

  const parcelHits = ACQUIRER_INSTALLMENT_COUNTS.filter(
    (n) => Number(fees.credito_parcelado?.[String(n)]?.default?.percent || 0) > 0
  );

  return (
    <div className="fee-receiver-matrix">
      <p className="text-small text-muted fee-receiver-matrix__intro">
        Preencha a linha <strong>Padrão</strong> para todas as bandeiras iguais. Use Visa/Master/Elo
        só quando a taxa divergir — nesse caso a bandeira será pedida no registro do pagamento.
      </p>
      <div className="finance-settings-inset card fee-receiver-matrix__pix">
        <div className="form-group">
          <label htmlFor={`${idPrefix}-pix`}>PIX — taxa (%)</label>
          <input
            id={`${idPrefix}-pix`}
            className="form-input"
            type="number"
            min={0}
            step="0.01"
            value={fees.pix?.percent ?? 0}
            onChange={(e) => patchByBrand('pix', 'default', { percent: Number(e.target.value || 0) })}
          />
        </div>
      </div>

      <BrandGrid
        label="Débito"
        idPrefix={`${idPrefix}-debito`}
        byBrand={fees.debito}
        onPatchBrand={(brand, patch) => patchByBrand('debito', brand, patch)}
      />
      <button
        type="button"
        className="btn btn-ghost btn-sm fee-receiver-matrix__copy"
        onClick={() => copyDefaultToAllBrands('debito')}
      >
        Copiar Padrão → todas as bandeiras (débito)
      </button>

      <BrandGrid
        label="Crédito à vista (1x)"
        idPrefix={`${idPrefix}-credito`}
        byBrand={fees.credito_avista}
        onPatchBrand={(brand, patch) => patchByBrand('credito_avista', brand, patch)}
      />
      <button
        type="button"
        className="btn btn-ghost btn-sm fee-receiver-matrix__copy"
        onClick={() => copyDefaultToAllBrands('credito_avista')}
      >
        Copiar Padrão → todas as bandeiras (crédito 1x)
      </button>

      <button
        type="button"
        className="finance-installments-toggle"
        aria-expanded={parceladoOpen}
        onClick={() => setParceladoOpen((v) => !v)}
      >
        <span className="ctx-label">Parcelado (2x–12x)</span>
        <span className="text-small text-muted">
          {parcelHits.length ? `${parcelHits.length} faixa(s)` : 'Opcional'}
        </span>
        {parceladoOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {parceladoOpen
        ? ACQUIRER_INSTALLMENT_COUNTS.map((n) => {
            const key = String(n);
            const byBrand = fees.credito_parcelado[key] || { default: { percent: 0, fixed: 0 } };
            return (
              <div key={n} className="fee-receiver-matrix__parcel-block">
                <BrandGrid
                  label={`${n}x`}
                  idPrefix={`${idPrefix}-parc-${n}`}
                  byBrand={byBrand}
                  onPatchBrand={(brand, patch) =>
                    patchByBrand('credito_parcelado', brand, patch, key)
                  }
                />
              </div>
            );
          })
        : null}

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
            patchByBrand('antecipacao', 'default', { percent: Number(e.target.value || 0) })
          }
        />
      </div>
    </div>
  );
}
