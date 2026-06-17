import '../../styles/followup-shared.css';
import React from 'react';
import { Link } from 'react-router-dom';
import FollowupTemperatureBadge from '../followup/FollowupTemperatureBadge.jsx';
import FollowupCopilotButtons from '../followup/FollowupCopilotButtons.jsx';
import { temperatureLabel } from '../../lib/followupTemperature.js';
import { followupCompleteActionLabel } from '../../lib/dashboardReceptionCopy.js';

export default function InboxFollowupBanner({
  followupState,
  leadId,
  academyId,
  leadPhone,
  aiEnabled = true,
  onSendTemplate,
  onCompleteFollowup,
  completing = false,
}) {
  if (!followupState || followupState.temperature === 'on_track') return null;
  if (followupState.doneForCurrentClass || followupState.isSnoozed) return null;

  const days = followupState.daysAgo ?? 0;
  const daysLabel = days === 0 ? 'hoje' : days === 1 ? 'há 1 dia' : `há ${days} dias`;
  const tempMod =
    followupState.temperature === 'critical'
      ? ' inbox-followup-banner--critical'
      : ' inbox-followup-banner--cooling';

  return (
    <div className={`inbox-followup-banner${tempMod}`} role="status">
      <div className="inbox-followup-banner__main">
        <FollowupTemperatureBadge temperature={followupState.temperature} size="sm" />
        <span className="inbox-followup-banner__text">
          Follow-up pós-aula · {temperatureLabel(followupState.temperature)} · {daysLabel}
          {followupState.nextActionLabel ? (
            <>
              {' '}
              · Próxima: <strong>{followupState.nextActionLabel}</strong>
            </>
          ) : null}
        </span>
      </div>
      <div className="inbox-followup-banner__actions">
        {aiEnabled !== false ? (
          <FollowupCopilotButtons
            academyId={academyId}
            leadId={leadId}
            leadPhone={leadPhone}
            templateKey={followupState.nextStep?.template_key}
            nextAction={followupState.nextActionLabel}
            compact
          />
        ) : null}
        {followupState.nextStep?.template_key ? (
          <button
            type="button"
            className="btn-outline inbox-followup-banner__btn"
            onClick={() => onSendTemplate?.(followupState.nextStep.template_key)}
          >
            Template sugerido
          </button>
        ) : null}
        <button
          type="button"
          className="btn inbox-followup-banner__btn inbox-followup-banner__btn--primary"
          disabled={completing}
          onClick={() => onCompleteFollowup?.()}
        >
          {completing ? 'Salvando…' : followupCompleteActionLabel()}
        </button>
        {leadId ? (
          <Link to={`/lead/${leadId}`} className="inbox-followup-banner__link">
            Ver lead
          </Link>
        ) : null}
        <Link to="/?retornos=1" className="inbox-followup-banner__link">
          Follow-ups
        </Link>
      </div>
    </div>
  );
}
