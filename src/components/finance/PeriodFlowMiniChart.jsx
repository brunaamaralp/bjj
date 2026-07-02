import React from 'react';

function fmtMoney(v) {
  try {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${Number(v || 0).toFixed(2)}`;
  }
}

export default function PeriodFlowMiniChart({ inflow, outflow, failed = false }) {
  if (failed) return null;

  const inVal = Math.max(0, Number(inflow) || 0);
  const outVal = Math.max(0, Number(outflow) || 0);
  if (inVal === 0 && outVal === 0) return null;

  const max = Math.max(inVal, outVal, 1);
  const inPct = Math.round((inVal / max) * 100);
  const outPct = Math.round((outVal / max) * 100);

  return (
    <div
      className="financeiro-overview-flow-chart"
      role="img"
      aria-label={`Entradas recebidas ${fmtMoney(inVal)}, saídas liquidadas ${fmtMoney(outVal)}`}
    >
      <div className="financeiro-overview-flow-chart__row">
        <span className="financeiro-overview-flow-chart__label">Entradas</span>
        <div className="financeiro-overview-flow-chart__track">
          <div
            className="financeiro-overview-flow-chart__bar financeiro-overview-flow-chart__bar--in"
            style={{ '--flow-bar-pct': `${inPct}%` }}
          />
        </div>
        <span className="financeiro-overview-flow-chart__value">{fmtMoney(inVal)}</span>
      </div>
      <div className="financeiro-overview-flow-chart__row">
        <span className="financeiro-overview-flow-chart__label">Saídas</span>
        <div className="financeiro-overview-flow-chart__track">
          <div
            className="financeiro-overview-flow-chart__bar financeiro-overview-flow-chart__bar--out"
            style={{ '--flow-bar-pct': `${outPct}%` }}
          />
        </div>
        <span className="financeiro-overview-flow-chart__value">{fmtMoney(outVal)}</span>
      </div>
    </div>
  );
}
