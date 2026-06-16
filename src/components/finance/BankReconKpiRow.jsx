import React from 'react';

function fmtMoney(v) {
  try {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${Number(v || 0).toFixed(2)}`;
  }
}

export default function BankReconKpiRow({
  filename,
  statusLabel,
  formatLabel,
  periodLabel,
  pendingCount = 0,
  pendingAmount = 0,
  balanceGap = 0,
  naviOrphanCount = 0,
  balanceProof = null,
  reconciledCount = 0,
  reconciledAmount = 0,
}) {
  const gapWarn = Math.abs(balanceGap) > 0.02;

  return (
    <div className="bank-recon-kpi mb-3">
      <div className="bank-recon-kpi__header">
        <h4 className="finance-tab__section-title bank-recon-summary-title">
          {filename} · {statusLabel}
          {formatLabel ? ` · ${formatLabel}` : ''}
        </h4>
        {periodLabel ? (
          <p className="text-small text-muted bank-recon-summary-period">{periodLabel}</p>
        ) : null}
      </div>

      <div className="bank-recon-kpi__cards">
        <div className="bank-recon-kpi__card">
          <span className="text-xs text-muted">Pendentes</span>
          <strong className="bank-recon-summary-value bank-recon-summary-value--warn">
            {pendingCount} ({fmtMoney(pendingAmount)})
          </strong>
        </div>
        <div className="bank-recon-kpi__card">
          <span className="text-xs text-muted">Diferença</span>
          <strong
            className={`bank-recon-summary-value${gapWarn ? ' bank-recon-summary-value--warn' : ''}`}
          >
            {fmtMoney(balanceGap)}
          </strong>
        </div>
        <div className="bank-recon-kpi__card">
          <span className="text-xs text-muted">Órfãos Nave</span>
          <strong className="bank-recon-summary-value">{naviOrphanCount}</strong>
        </div>
      </div>

      {balanceProof ? (
        <details className="bank-recon-kpi__details">
          <summary className="bank-recon-kpi__details-summary">Ver prova de saldo completa</summary>
          <div className="bank-recon-summary__grid bank-recon-kpi__details-grid">
            <div>
              <span className="text-xs text-muted">Conciliados</span>
              <strong className="bank-recon-summary-value bank-recon-summary-value--ok">
                {reconciledCount} ({fmtMoney(reconciledAmount)})
              </strong>
            </div>
            <div>
              <span className="text-xs text-muted">Extrato líquido</span>
              <strong className="bank-recon-summary-value">{fmtMoney(balanceProof.statement_net)}</strong>
            </div>
            <div>
              <span className="text-xs text-muted">Conciliado</span>
              <strong className="bank-recon-summary-value bank-recon-summary-value--ok">
                {fmtMoney(balanceProof.reconciled_net)}
              </strong>
            </div>
            <div>
              <span className="text-xs text-muted">Pendente no extrato</span>
              <strong className="bank-recon-summary-value">{fmtMoney(balanceProof.pending_statement)}</strong>
            </div>
            <div>
              <span className="text-xs text-muted">Nave sem extrato</span>
              <strong className="bank-recon-summary-value">{fmtMoney(balanceProof.orphan_navi_net)}</strong>
            </div>
          </div>
        </details>
      ) : null}
    </div>
  );
}
