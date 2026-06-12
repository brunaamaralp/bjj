import '../../styles/inbox-context.css';
import React from 'react';
import { RotateCcw } from 'lucide-react';

export default function InboxTriageRestoreBanner({ busy = false, onRestore }) {
  return (
    <div className="inbox-triage-restore-banner" role="status">
      <span className="inbox-triage-restore-banner__text">
        Marcado como não é lead. Novas mensagens não entram na triagem.
      </span>
      <button
        type="button"
        className="btn btn-outline btn-sm inbox-triage-restore-banner__btn"
        disabled={busy}
        onClick={() => onRestore?.()}
      >
        <RotateCcw size={14} aria-hidden />
        Restaurar triagem
      </button>
    </div>
  );
}
