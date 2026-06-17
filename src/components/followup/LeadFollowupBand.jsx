import React from 'react';
import { Link } from 'react-router-dom';
import FollowupTemperatureBadge from './FollowupTemperatureBadge.jsx';
import FollowupCopilotButtons from './FollowupCopilotButtons.jsx';
import { followupCompleteActionLabel } from '../../lib/dashboardReceptionCopy.js';
export default function LeadFollowupBand({
  followupState,
  lead,
  leadId,
  academyId,
  onWhatsApp,
  onComplete,
  completing = false,
  sendingWhatsapp = false,
}) {
  if (!followupState || followupState.doneForCurrentClass || followupState.isSnoozed) return null;
  if (followupState.temperature === 'on_track') return null;

  const days = followupState.daysAgo ?? 0;
  const daysLabel = days === 0 ? 'hoje' : days === 1 ? 'há 1 dia' : `há ${days} dias`;
  const templateKey = followupState.nextStep?.template_key || 'dashboard_contact';
  const tempClass =
    followupState.temperature === 'critical' ? 'lead-followup-band--critical' : 'lead-followup-band--cooling';

  return (
    <div className={`lead-followup-band ${tempClass}`} role="status">
      <div className="lead-followup-band__main">
        <FollowupTemperatureBadge temperature={followupState.temperature} size="sm" />
        <div className="lead-followup-band__text">
          <p className="lead-followup-band__lead">
            <strong>Follow-up pós-aula</strong>
            <span className="lead-followup-band__meta"> · {daysLabel}</span>
          </p>
          {followupState.nextActionLabel ? (
            <p className="lead-followup-band__next">
              Próxima ação: <strong>{followupState.nextActionLabel}</strong>
            </p>
          ) : null}
        </div>
      </div>
      <div className="lead-followup-band__actions">
        <FollowupCopilotButtons
          academyId={academyId}
          leadId={leadId}
          leadPhone={lead?.phone}
          templateKey={templateKey}
          nextAction={followupState.nextActionLabel}
          compact
        />
        <button
          type="button"
          className="btn-outline lead-followup-band__btn"
          disabled={sendingWhatsapp}
          onClick={onWhatsApp}
        >
          {sendingWhatsapp ? 'Enviando…' : 'Template padrão'}
        </button>
        <button
          type="button"
          className="btn lead-followup-band__btn lead-followup-band__btn--primary"
          disabled={completing}
          onClick={onComplete}
        >
          {completing ? 'Salvando…' : followupCompleteActionLabel()}
        </button>
        <Link to="/?retornos=1" className="lead-followup-band__link">
          Ver na agenda
        </Link>
      </div>
    </div>
  );
}
