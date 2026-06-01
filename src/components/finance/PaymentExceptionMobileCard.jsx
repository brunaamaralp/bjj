import React from 'react';
import {
  labelForExceptionStatus,
  formatExceptionDueLabel,
  exceptionStatusBadgeClass,
  exceptionDiffClass,
} from '../../lib/paymentExceptions';

function displayNote(note, max = 80) {
  const s = String(note || '').trim();
  if (!s) return '';
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export default function PaymentExceptionMobileCard({
  row,
  currentMonth,
  statusLabels,
  flash,
  isSaving,
  editingNoteId,
  noteDraft,
  fmtMoney,
  onUpdate,
  onNoteOpen,
  onNoteDraftChange,
  onNoteSave,
  onNoteCancel,
}) {
  const cardClass = [
    'navi-mobile-card',
    'mensal-mobile-card',
    'mensal-mobile-card--exception',
    flash ? 'payment-exception-mobile-card--flash' : '',
    isSaving ? 'payment-exception-mobile-card--saving' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={cardClass}>
      <div className="mensal-mobile-card__head">
        <div className="mensal-mobile-card__head-text">
          <div className="mensal-mobile-card__name">{row.student.name || '—'}</div>
          <div className="mensal-mobile-card__meta">{row.plan}</div>
          <div className="mensal-mobile-card__meta">
            Esperado {fmtMoney(row.expected)} · Recebido {fmtMoney(row.received)}
          </div>
          <div className={`mensal-mobile-card__meta ${exceptionDiffClass(row)}`}>
            Diferença {fmtMoney(row.difference)}
          </div>
          <div className="mensal-mobile-card__platform text-small text-muted">
            {formatExceptionDueLabel(row.student, row.row, currentMonth)}
            {row.platform && row.platform !== '—' ? ` · ${row.platform}` : ''}
          </div>
        </div>
        <span className={`${exceptionStatusBadgeClass(row.primaryStatus)} payment-exception-status-badge--mobile`}>
          {labelForExceptionStatus(row.primaryStatus, statusLabels)}
        </span>
      </div>

      <div className="mensal-mobile-card__row text-small payment-exception-note-row">
        {editingNoteId === row.student.id ? (
          <input
            className="form-input payment-exception-note-input--mobile"
            value={noteDraft}
            onChange={(e) => onNoteDraftChange(e.target.value)}
            onBlur={onNoteSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onNoteSave();
              }
              if (e.key === 'Escape') onNoteCancel();
            }}
            autoFocus
            placeholder="Observação…"
          />
        ) : (
          <button
            type="button"
            onClick={onNoteOpen}
            className={`payment-exception-note-btn payment-exception-note-btn--mobile ${
              row.note ? 'payment-exception-note-btn--filled' : 'payment-exception-note-btn--empty'
            }`}
          >
            {row.note ? displayNote(row.note, 120) : 'Toque para anotar…'}
          </button>
        )}
      </div>

      <div className="mensal-mobile-card__actions">
        <button type="button" className="btn-primary mensal-mobile-pay mensal-mobile-pay--touch" onClick={onUpdate}>
          Atualizar pagamento
        </button>
      </div>
    </article>
  );
}
