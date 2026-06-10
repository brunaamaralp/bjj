import React from 'react';
import { Link } from 'react-router-dom';
import FollowupTemperatureBadge from '../followup/FollowupTemperatureBadge.jsx';
import { temperatureLabel } from '../../lib/followupTemperature.js';

export default function InboxFollowupBanner({ followupState, leadId, onSendTemplate }) {
  if (!followupState || followupState.temperature === 'on_track') return null;
  if (followupState.doneForCurrentClass || followupState.isSnoozed) return null;

  const days = followupState.daysAgo ?? 0;
  const daysLabel = days === 0 ? 'hoje' : days === 1 ? 'há 1 dia' : `há ${days} dias`;

  return (
    <div className="inbox-followup-banner" role="status">
      <div className="inbox-followup-banner__main">
        <FollowupTemperatureBadge temperature={followupState.temperature} size="sm" />
        <span className="inbox-followup-banner__text">
          Retorno pós-aula · {temperatureLabel(followupState.temperature)} · {daysLabel}
          {followupState.nextActionLabel ? (
            <>
              {' '}
              · Próxima: <strong>{followupState.nextActionLabel}</strong>
            </>
          ) : null}
        </span>
      </div>
      <div className="inbox-followup-banner__actions">
        {followupState.nextStep?.template_key ? (
          <button
            type="button"
            className="btn-outline inbox-followup-banner__btn"
            onClick={() => onSendTemplate?.(followupState.nextStep.template_key)}
          >
            Enviar sugerido
          </button>
        ) : null}
        {leadId ? (
          <Link to={`/lead/${leadId}`} className="inbox-followup-banner__link">
            Ver lead
          </Link>
        ) : null}
        <Link to="/" className="inbox-followup-banner__link">
          Retornos
        </Link>
      </div>
    </div>
  );
}
