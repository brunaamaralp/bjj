import '../../styles/inbox-context.css';
import React from 'react';
import { GraduationCap, Trash2, UserCheck } from 'lucide-react';

/**
 * @param {{ suggestedAction?: 'confirm'|'link_student'|'dismiss', contextLine?: string, studentLabel?: string }} props
 */
export default function InboxTriageCard({
  busy = false,
  compact = false,
  suggestedAction,
  contextLine = '',
  studentLabel = 'aluno',
  onConfirm,
  onLinkStudent,
  onDismiss,
}) {
  const linkLabel = `Vincular ${String(studentLabel || 'aluno').trim().toLowerCase()}`;

  const stopCardBubble = (e) => {
    e.stopPropagation();
  };

  const runAction = (e, action) => {
    e.stopPropagation();
    action?.();
  };

  return (
    <div
      className={`inbox-triage-callout${compact ? ' inbox-triage-callout--compact' : ''}`}
      role="region"
      aria-label="Triagem WhatsApp"
      onClick={stopCardBubble}
      onMouseDown={stopCardBubble}
    >
      <div className="inbox-triage-callout__head">
        <div className="inbox-triage-callout__title-row">
          <span className="inbox-triage-callout__badge">Triagem</span>
          {compact && contextLine ? (
            <span className="inbox-triage-callout__context inbox-triage-callout__context--inline">{contextLine}</span>
          ) : null}
        </div>
        {!compact ? (
          <p className="inbox-triage-callout__hint">
            Contato criado automaticamente pelo WhatsApp. Confirme se é lead, vincule a um {studentLabel.toLowerCase()} ou marque que não é lead.
          </p>
        ) : null}
        {!compact && contextLine ? (
          <p className="inbox-triage-callout__context">{contextLine}</p>
        ) : null}
      </div>
      <div className="inbox-triage-callout__actions">
        <button
          type="button"
          className={`btn btn-primary btn-sm inbox-btn--ctx inbox-triage-callout__btn${suggestedAction === 'confirm' ? ' inbox-triage-callout__btn--suggested' : ''}`}
          disabled={busy}
          onClick={(e) => runAction(e, onConfirm)}
        >
          <UserCheck size={14} aria-hidden />
          Confirmar
        </button>
        <button
          type="button"
          className={`btn btn-outline btn-sm inbox-btn--ctx inbox-triage-callout__btn${suggestedAction === 'link_student' ? ' inbox-triage-callout__btn--suggested' : ''}`}
          disabled={busy}
          onClick={(e) => runAction(e, onLinkStudent)}
        >
          <GraduationCap size={14} aria-hidden />
          {linkLabel}
        </button>
        <button
          type="button"
          className={`btn btn-outline btn-sm inbox-btn--ctx inbox-triage-callout__btn inbox-triage-callout__btn--muted${suggestedAction === 'dismiss' ? ' inbox-triage-callout__btn--suggested' : ''}`}
          disabled={busy}
          onClick={(e) => runAction(e, onDismiss)}
        >
          <Trash2 size={14} aria-hidden />
          Não é lead
        </button>
      </div>
    </div>
  );
}
