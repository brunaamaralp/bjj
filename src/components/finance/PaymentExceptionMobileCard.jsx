import React from 'react';
import {
  labelForExceptionStatus,
  colorsForExceptionStatus,
  formatExceptionDueLabel,
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
  const colors = colorsForExceptionStatus(row.primaryStatus);
  const diffColor =
    row.primaryStatus === 'awaiting'
      ? '#B45309'
      : row.primaryStatus === 'partial'
        ? '#C2410C'
        : row.difference < -0.009
          ? '#6D28D9'
          : row.difference > 0.009
            ? '#A32D2D'
            : 'var(--text-secondary)';

  return (
    <article
      className="navi-mobile-card mensal-mobile-card mensal-mobile-card--exception"
      style={{
        background: flash ? '#EAF3DE' : undefined,
        transition: 'background 0.3s ease',
        opacity: isSaving ? 0.6 : 1,
      }}
    >
      <div className="mensal-mobile-card__head">
        <div className="mensal-mobile-card__head-text">
          <div className="mensal-mobile-card__name">{row.student.name || '—'}</div>
          <div className="mensal-mobile-card__meta">{row.plan}</div>
          <div className="mensal-mobile-card__meta">
            Esperado {fmtMoney(row.expected)} · Recebido {fmtMoney(row.received)}
          </div>
          <div className="mensal-mobile-card__meta" style={{ fontWeight: 600, color: diffColor }}>
            Diferença {fmtMoney(row.difference)}
          </div>
          <div className="mensal-mobile-card__platform text-small text-muted">
            {formatExceptionDueLabel(row.student, row.row, currentMonth)}
            {row.platform && row.platform !== '—' ? ` · ${row.platform}` : ''}
          </div>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: 20,
            background: colors.bg,
            color: colors.color,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {labelForExceptionStatus(row.primaryStatus, statusLabels)}
        </span>
      </div>

      <div className="mensal-mobile-card__row text-small" style={{ padding: '0 14px 8px' }}>
        {editingNoteId === row.student.id ? (
          <input
            className="form-input"
            style={{ fontSize: 14, width: '100%', boxSizing: 'border-box' }}
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
            style={{
              border: 'none',
              background: 'none',
              padding: '8px 0',
              minHeight: 44,
              width: '100%',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: 13,
              fontWeight: row.note ? 500 : 400,
              color: row.note ? 'var(--text)' : 'var(--text-secondary)',
              fontStyle: row.note ? 'normal' : 'italic',
              boxSizing: 'border-box',
            }}
          >
            {row.note ? displayNote(row.note, 120) : 'Toque para anotar…'}
          </button>
        )}
      </div>

      <div className="mensal-mobile-card__actions">
        <button type="button" className="btn-primary mensal-mobile-pay" style={{ minHeight: 44 }} onClick={onUpdate}>
          Atualizar pagamento
        </button>
      </div>
    </article>
  );
}
