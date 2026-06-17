import React from 'react';
import { Link } from 'react-router-dom';
import { Check, Plus } from 'lucide-react';
import SearchableSelect from '../shared/SearchableSelect.jsx';
import { formatReconTxShortTitle, matchTierLabel } from '../../lib/financeReconTxLabel.js';
import { buildBankReconPaymentHintPath } from '../../lib/bankReconPaymentHintLink.js';

function confidenceLabel(item) {
  const tierLabel = matchTierLabel(item?.match_tier);
  if (tierLabel) return tierLabel;
  if (item?.match_score > 0 && item?.match_score < 100) {
    return `Confiança média (${item.match_score}%)`;
  }
  return '';
}

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
  candidates = null,
  tone = 'suggested',
  selected = false,
  busy = false,
  manualTxId = '',
  manualTxOptions = [],
  onSelect,
  onManualTxChange,
  onConfirm,
  onConfirmCandidate,
  onIgnore,
  onCreateTx,
  onLinkManual,
  reconStatementId = '',
  onRegisterPayment,
}) {
  const isUnmatched = tone === 'unmatched';
  const showNavi = !isUnmatched;
  const confidenceText = confidenceLabel(item);
  const candidateList = candidates?.length ? candidates : item?.suggested_tx_candidates;
  const showMultiCandidates = (candidateList?.length ?? 0) >= 2;
  const paymentHints =
    isUnmatched && item?.direction === 'credit' ? item?.pending_payment_hints || [] : [];

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
          {confidenceText ? (
            <span className="bank-recon-confidence"> · {confidenceText}</span>
          ) : null}
          {item.from_rule ? <span className="bank-recon-rule-badge">Regra salva</span> : null}
        </p>
        {paymentHints.length > 0 ? (
          <div className="bank-recon-pending-hints">
            <p className="text-xs text-muted bank-recon-pending-hints__title">
              Possível mensalidade não registrada
            </p>
            <ul className="bank-recon-pending-hints__list">
              {paymentHints.map((hint) => (
                <li key={`${hint.payment_id}-${hint.lead_id}`} className="bank-recon-pending-hints__item">
                  <span className="text-xs">
                    {hint.lead_name} · {hint.reference_month} · {fmtMoney(hint.expected_amount)}
                  </span>
                  {onRegisterPayment ? (
                    <button
                      type="button"
                      className="btn-outline btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRegisterPayment(hint);
                      }}
                    >
                      Registrar e conciliar
                    </button>
                  ) : (
                    <Link
                      to={buildBankReconPaymentHintPath(hint, { reconStatementId })}
                      className="btn-outline btn-sm"
                    >
                      Registrar pagamento
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {showNavi ? (
        <div className="bank-recon-pair__navi">
          {showMultiCandidates ? (
            <div className="bank-recon-candidates">
              <p className="text-xs text-muted mb-2">Várias correspondências — escolha uma:</p>
              <ul className="bank-recon-candidates__list">
                {candidateList.map((c) => (
                  <li key={c.tx_id} className="bank-recon-candidates__item">
                    <div>
                      <p className="bank-recon-pair__title text-sm">
                        {c.lead_name || 'Aluno'}
                        {c.from_rule ? <span className="bank-recon-rule-badge">Regra salva</span> : null}
                      </p>
                      {c.match_tier ? (
                        <p className="text-xs text-muted">{matchTierLabel(c.match_tier)}</p>
                      ) : c.score ? (
                        <p className="text-xs text-muted">Confiança média ({c.score}%)</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="btn-outline btn-sm"
                      disabled={busy}
                      onClick={() => void onConfirmCandidate?.(c.tx_id)}
                    >
                      <Check size={14} /> Confirmar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : tx ? (
            <>
              <p className="bank-recon-pair__title">{formatReconTxShortTitle(tx)}</p>
              <p className="text-xs text-muted">
                {fmtDate(tx.settledAt || tx.createdAt)} · {fmtMoney(tx.gross)}
                {tx.lead_id ? (
                  <>
                    {' '}
                    · <Link to={`/student/${tx.lead_id}`}>{tx.lead_name || 'Aluno'}</Link>
                  </>
                ) : null}
              </p>
            </>
          ) : item.suggested_tx_id ? (
            <p className="text-small text-muted">Lançamento sugerido — confirme para vincular</p>
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
        {onConfirm && !showMultiCandidates ? (
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
