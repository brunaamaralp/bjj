import React from 'react';
import { ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
import { formatDueDayLabel, GRID_STATUS_LABELS, HISTORY_BADGE, historyStatusForMonth } from '../../lib/paymentStatus';
import { GridStatusBadgeButton } from './gridStatusBadge.jsx';

export default function MonthlyGridMobileCard({
  row,
  monthHistoryKeys,
  history,
  historyLoading,
  isExpanded,
  isSaving,
  notePopoverId,
  noteDraft,
  fmtMoney,
  onToggleExpand,
  onStatusClick,
  onNoteOpen,
  onNoteDraftChange,
  onNoteSave,
  onNoteCancel,
}) {
  const { student, payment, expected, display, note } = row;
  const canQuickPay = display.key !== 'covered';

  return (
    <article
      className={`mensal-mobile-card mensal-mobile-card--grid mensal-mobile-card--${display.key}${isSaving ? ' mensal-mobile-card--saving' : ''}`}
    >
      <div className="mensal-mobile-card__head">
        <div className="mensal-mobile-card__head-text">
          <div className="mensal-mobile-card__name">{student.name || '—'}</div>
          <div className="mensal-mobile-card__meta">
            {student.plan || payment?.plan_name || '—'}
            {expected > 0 ? ` · ${fmtMoney(expected)}` : ''}
            {' · '}
            {formatDueDayLabel(student)}
          </div>
          {(student.preferredPaymentAccount || payment?.account) ? (
            <div className="mensal-mobile-card__platform text-small text-muted">
              {student.preferredPaymentAccount || payment?.account}
            </div>
          ) : null}
        </div>
        <GridStatusBadgeButton
          display={display}
          payment={payment}
          onClick={onStatusClick}
          onCoveredExpand={onToggleExpand}
        />
      </div>

      {canQuickPay ? (
        <div className="mensal-mobile-card__actions">
          <button type="button" className="btn-primary mensal-mobile-pay" onClick={onStatusClick}>
            Registrar pagamento
          </button>
          <button
            type="button"
            className={`grid-note-icon-btn${note ? ' grid-note-icon-btn--has-note' : ''}`}
            title={note || 'Adicionar nota'}
            aria-label={note ? 'Ver ou editar nota' : 'Adicionar nota'}
            onClick={onNoteOpen}
          >
            <MessageSquare size={14} aria-hidden />
            {note ? <span className="grid-note-icon-btn__dot" aria-hidden /> : null}
          </button>
        </div>
      ) : (
        <div className="mensal-mobile-card__actions mensal-mobile-card__actions--compact">
          <button
            type="button"
            className={`grid-note-icon-btn${note ? ' grid-note-icon-btn--has-note' : ''}`}
            title={note || 'Adicionar nota'}
            aria-label={note ? 'Ver ou editar nota' : 'Adicionar nota'}
            onClick={onNoteOpen}
          >
            <MessageSquare size={14} aria-hidden />
            {note ? <span className="grid-note-icon-btn__dot" aria-hidden /> : null}
          </button>
        </div>
      )}

      {notePopoverId === student.id ? (
        <div className="mensal-mobile-grid__note-edit" style={{ padding: '0 14px 12px' }}>
          <input
            className="form-input"
            style={{ fontSize: 14, width: '100%', boxSizing: 'border-box' }}
            value={noteDraft}
            onChange={(e) => onNoteDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onNoteSave();
              if (e.key === 'Escape') onNoteCancel();
            }}
            autoFocus
            placeholder="Nota…"
          />
        </div>
      ) : null}

      <button
        type="button"
        className="mensal-mobile-grid__history-toggle"
        onClick={onToggleExpand}
        aria-expanded={isExpanded}
      >
        <span>Histórico (6 meses)</span>
        {isExpanded ? <ChevronDown size={18} aria-hidden /> : <ChevronRight size={18} aria-hidden />}
      </button>

      {isExpanded ? (
        <div className="mensal-mobile-grid__history-panel">
          {historyLoading ? (
            <span className="text-xs text-muted">Carregando histórico…</span>
          ) : (
            <div className="mensal-mobile-grid__history-chips">
              {monthHistoryKeys.map((ym) => {
                const p = history?.[ym];
                const hKey = historyStatusForMonth(student, p, ym);
                const lbl = HISTORY_BADGE[hKey] || '—';
                const short = ym.slice(5);
                return (
                  <span
                    key={ym}
                    className="mensal-mobile-grid__history-chip"
                    title={`${short}: ${GRID_STATUS_LABELS[hKey] || hKey}`}
                  >
                    {short}:{lbl}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </article>
  );
}
