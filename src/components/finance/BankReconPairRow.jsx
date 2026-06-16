import React from 'react';
import { Link } from 'react-router-dom';
import { Check, Plus } from 'lucide-react';
import SearchableSelect from '../shared/SearchableSelect.jsx';

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

export default function BankReconPairRow({
  item,
  tx,
  tone = 'suggested',
  selected = false,
  busy = false,
  manualTxId = '',
  manualTxOptions = [],
  onSelect,
  onManualTxChange,
  onConfirm,
  onIgnore,
  onCreateTx,
  onLinkManual,
}) {
  const isUnmatched = tone === 'unmatched';
  const showNavi = !isUnmatched;

  return (
    <div
      className={`bank-recon-pair bank-recon-pair--${tone}${selected ? ' bank-recon-pair--selected' : ''}`}
      role={isUnmatched ? 'button' : undefined}
      tabIndex={isUnmatched ? 0 : undefined}
      aria-selected={isUnmatched ? selected : undefined}
      onClick={isUnmatched ? onSelect : undefined}
      onKeyDown={
        isUnmatched
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect?.();
              }
            }
          : undefined
      }
    >
      <div className="bank-recon-pair__bank">
        {selected ? <span className="bank-recon-pair__badge">Selecionada</span> : null}
        <p className="bank-recon-pair__title">{item.description}</p>
        <p className="text-xs text-muted">
          {fmtDate(item.date)} · {item.direction === 'credit' ? 'Crédito' : 'Débito'} · {fmtMoney(item.amount)}
          {item.match_score > 0 && item.match_score < 100 ? (
            <span className="bank-recon-confidence"> · {item.match_score}% confiança</span>
          ) : null}
        </p>
      </div>

      {showNavi ? (
        <div className="bank-recon-pair__navi">
          {tx ? (
            <>
              <p className="bank-recon-pair__title">{tx.planName || tx.category || tx.note || 'Lançamento'}</p>
              <p className="text-xs text-muted">
                {fmtDate(tx.settledAt || tx.createdAt)} · {fmtMoney(tx.gross)}
                {tx.lead_id ? (
                  <>
                    {' '}
                    · <Link to={`/student/${tx.lead_id}`}>Aluno</Link>
                  </>
                ) : null}
              </p>
            </>
          ) : (
            <p className="text-small text-muted">Sem lançamento vinculado</p>
          )}
        </div>
      ) : (
        <div className="bank-recon-pair__manual" onClick={(e) => e.stopPropagation()}>
          <label className="form-label text-xs" htmlFor={`bank-recon-link-${item.id}`}>
            Vincular a lançamento
          </label>
          <SearchableSelect
            id={`bank-recon-link-${item.id}`}
            value={manualTxId}
            options={manualTxOptions}
            placeholder="Buscar lançamento Nave…"
            emptyMessage="Nenhum lançamento encontrado."
            disabled={busy || manualTxOptions.length === 0}
            onChange={onManualTxChange}
          />
        </div>
      )}

      <div className="bank-recon-pair__actions" onClick={(e) => e.stopPropagation()}>
        {isUnmatched && manualTxId ? (
          <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => void onLinkManual?.()}>
            <Check size={14} /> Vincular
          </button>
        ) : null}
        {onConfirm && tx ? (
          <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => void onConfirm()}>
            <Check size={14} /> Confirmar
          </button>
        ) : null}
        {isUnmatched ? (
          <button type="button" className="btn-outline btn-sm" disabled={busy} onClick={() => void onCreateTx?.()}>
            <Plus size={14} /> Criar lançamento
          </button>
        ) : null}
        {onIgnore ? (
          <button type="button" className="btn-outline btn-sm" disabled={busy} onClick={() => void onIgnore()}>
            Ignorar
          </button>
        ) : null}
      </div>
    </div>
  );
}
