import React from 'react';
import { GraduationCap, Trash2, UserCheck } from 'lucide-react';

export default function InboxTriageCard({ busy = false, onConfirm, onLinkStudent, onDismiss }) {
  return (
    <div className="inbox-triage-callout" role="region" aria-label="Triagem WhatsApp">
      <div className="inbox-triage-callout__head">
        <span className="inbox-triage-callout__badge">Triagem WhatsApp</span>
        <p className="inbox-triage-callout__hint">
          Contato criado automaticamente. Confirme se é lead, vincule a um aluno ou descarte.
        </p>
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
          Descartar
        </button>
      </div>
    </div>
  );
}
