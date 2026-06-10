import React from 'react';
import { Link } from 'react-router-dom';
import FollowupTemperatureBadge from './FollowupTemperatureBadge.jsx';
import FollowupCopilotButtons from './FollowupCopilotButtons.jsx';
import { temperatureLabel } from '../../lib/followupTemperature.js';

export default function LeadFollowupBand({
  followupState,
  leadId,
  academyId,
  onWhatsApp,
  onComplete,
  onDraftReady,
  completing = false,
  sendingWhatsapp = false,
}) {
  if (!followupState || followupState.doneForCurrentClass || followupState.isSnoozed) return null;

  const days = followupState.daysAgo ?? 0;
  const daysLabel = days === 0 ? 'hoje' : days === 1 ? 'há 1 dia' : `há ${days} dias`;
  const templateKey = followupState.nextStep?.template_key || 'dashboard_contact';

  return (
    <div className="lead-followup-band" role="status">
      <div className="lead-followup-band__main">
        <FollowupTemperatureBadge temperature={followupState.temperature} size="sm" />
        <div className="lead-followup-band__text">
          <strong>Retorno pós-aula</strong>
          <span>
            {' '}
            · {temperatureLabel(followupState.temperature)} · {daysLabel}
            {followupState.nextActionLabel ? (
              <>
                {' '}
                · Próxima: <strong>{followupState.nextActionLabel}</strong>
              </>
            ) : null}
          </span>
        </div>
      </div>
      <div className="lead-followup-band__actions">
        <FollowupCopilotButtons
          academyId={academyId}
          leadId={leadId}
          templateKey={templateKey}
          nextAction={followupState.nextActionLabel}
          onDraftReady={onDraftReady}
          compact
        />
        <button
          type="button"
          className="btn-outline lead-followup-band__btn"
          disabled={sendingWhatsapp}
          onClick={onWhatsApp}
        >
          {sendingWhatsapp ? 'Enviando…' : 'WhatsApp'}
        </button>
        <button
          type="button"
          className="btn lead-followup-band__btn lead-followup-band__btn--primary"
          disabled={completing}
          onClick={onComplete}
        >
          {completing ? 'Salvando…' : 'Concluir retorno'}
        </button>
        <Link to="/" className="lead-followup-band__link">
          Ver na agenda
        </Link>
      </div>
    </div>
  );
}
