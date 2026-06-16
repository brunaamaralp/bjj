import React from 'react';
import { X } from 'lucide-react';

function fmtMoney(v) {
  try {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${Number(v || 0).toFixed(2)}`;
  }
}

function fmtDate(ymd) {
  const p = String(ymd || '').slice(0, 10).split('-');
  if (p.length !== 3) return '—';
  return `${p[2]}/${p[1]}/${p[0]}`;
}

export default function BankReconSelectionBar({ item, onClear, hasOrphans = true }) {
  return (
    <div className="bank-recon-selection-bar" role="status" aria-live="polite">
      {item ? (
        <div className="bank-recon-selection-bar__content">
          <p className="bank-recon-selection-bar__text">
            <strong>Linha selecionada:</strong> {fmtDate(item.date)} · {item.description} ·{' '}
            {fmtMoney(item.amount)} — escolha um lançamento à direita
            {hasOrphans ? '' : ' (nenhum órfão no período)'} ou use o campo na linha.
          </p>
          <button
            type="button"
            className="btn-text btn-sm bank-recon-selection-bar__clear"
            onClick={onClear}
            aria-label="Limpar seleção"
          >
            <X size={14} /> Limpar
          </button>
        </div>
      ) : (
        <p className="bank-recon-selection-bar__text bank-recon-selection-bar__text--hint">
          Clique em uma linha pendente do extrato para vincular a um lançamento do Nave.
        </p>
      )}
    </div>
  );
}
