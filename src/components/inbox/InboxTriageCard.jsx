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

  return (
    <div
      className={`inbox-triage-callout${compact ? ' inbox-triage-callout--compact' : ''}`}
      role="region"
      aria-label="Triagem WhatsApp"
    >
      <div className="inbox-triage-callout__head">
        <span className="inbox-triage-callout__badge">Triagem WhatsApp</span>
        {!compact ? (
          <p className="inbox-triage-callout__hint">
            Contato criado automaticamente pelo WhatsApp. Confirme se é lead, vincule a um {studentLabel.toLowerCase()} ou marque que não é lead.
          </p>
        ) : (
          <p className="inbox-triage-callout__hint inbox-triage-callout__hint--compact">
            Confirme, vincule {studentLabel.toLowerCase()} ou marque que não é lead.
          </p>
        )}
        {contextLine ? (
          <p className="inbox-triage-callout__context">{contextLine}</p>
        ) : null}
      </div>
      <div className="inbox-triage-callout__actions">
        <button
          type="button"
          className={`btn btn-primary inbox-btn--ctx inbox-triage-callout__btn${suggestedAction === 'confirm' ? ' inbox-triage-callout__btn--suggested' : ''}`}
          disabled={busy}
          onClick={() => onConfirm?.()}
        >
          <UserCheck size={15} aria-hidden />
          Confirmar lead
        </button>
        <button
          type="button"
          className={`btn btn-outline inbox-btn--ctx inbox-triage-callout__btn${suggestedAction === 'link_student' ? ' inbox-triage-callout__btn--suggested' : ''}`}
          disabled={busy}
          onClick={() => onLinkStudent?.()}
        >
          <GraduationCap size={15} aria-hidden />
          {linkLabel}
        </button>
        <button
          type="button"
          className={`btn btn-outline inbox-btn--ctx inbox-triage-callout__btn inbox-triage-callout__btn--muted${suggestedAction === 'dismiss' ? ' inbox-triage-callout__btn--suggested' : ''}`}
          disabled={busy}
          onClick={() => onDismiss?.()}
        >
          <Trash2 size={15} aria-hidden />
          Não é lead
        </button>
      </div>
    </div>
  );
}
