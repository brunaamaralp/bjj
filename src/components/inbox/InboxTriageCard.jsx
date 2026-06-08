import React from 'react';
import { GraduationCap, Trash2, UserCheck } from 'lucide-react';

export default function InboxTriageCard({ busy = false, compact = false, onConfirm, onLinkStudent, onDismiss }) {
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
            Contato criado automaticamente pelo WhatsApp. Confirme se é lead, vincule a um aluno ou marque que não é lead.
          </p>
        ) : (
          <p className="inbox-triage-callout__hint inbox-triage-callout__hint--compact">
            Confirme, vincule aluno ou marque que não é lead.
          </p>
        )}
      </div>
      <div className="inbox-triage-callout__actions">
        <button
          type="button"
          className="btn btn-primary inbox-btn--ctx inbox-triage-callout__btn"
          disabled={busy}
          onClick={() => onConfirm?.()}
        >
          <UserCheck size={15} aria-hidden />
          Confirmar lead
        </button>
        <button
          type="button"
          className="btn btn-outline inbox-btn--ctx inbox-triage-callout__btn"
          disabled={busy}
          onClick={() => onLinkStudent?.()}
        >
          <GraduationCap size={15} aria-hidden />
          Vincular aluno
        </button>
        <button
          type="button"
          className="btn btn-outline inbox-btn--ctx inbox-triage-callout__btn inbox-triage-callout__btn--muted"
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
