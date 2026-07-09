import React from 'react';
import { parseMaskToCents } from '../../lib/moneyBr';

/**
 * Campos de desconto geral (R$ ou %) — compartilhado entre PDV e venda pelo perfil do aluno.
 */
export default function SalesGeneralDiscountFields({
  descGeralTipo,
  onTipoChange,
  descGeralMasked,
  onCentsChange,
  descGeralPct,
  onPctChange,
}) {
  return (
    <div className="sales-checkout__discount">
      <div className="form-group sales-checkout__field">
        <label className="text-xs">Desconto geral</label>
        <select className="form-input" value={descGeralTipo} onChange={onTipoChange}>
          <option value="valor">R$</option>
          <option value="percent">%</option>
        </select>
      </div>
      {descGeralTipo === 'valor' ? (
        <div className="form-group sales-checkout__field">
          <label className="text-xs">Valor</label>
          <input
            type="text"
            className="form-input"
            value={descGeralMasked}
            onChange={(e) => onCentsChange(parseMaskToCents(e.target.value))}
          />
        </div>
      ) : (
        <div className="form-group sales-checkout__field">
          <label className="text-xs">%</label>
          <input
            type="number"
            min={0}
            max={100}
            className="form-input"
            value={descGeralPct}
            onChange={onPctChange}
          />
        </div>
      )}
    </div>
  );
}
