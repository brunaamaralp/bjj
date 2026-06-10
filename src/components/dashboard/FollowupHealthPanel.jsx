import React from 'react';
import { useNavigate } from 'react-router-dom';
import FollowupTemperatureBadge from '../followup/FollowupTemperatureBadge.jsx';

export default function FollowupHealthPanel({ summary }) {
  const navigate = useNavigate();
  if (!summary) return null;

  const { on_track, cooling, critical, coolingLeads, d1RatePercent, attendedInWeek } = summary;
  const hasActivity = on_track + cooling + critical > 0;
  if (!hasActivity) return null;

  return (
    <section className="followup-health-panel reception-section animate-in" aria-label="Saúde dos retornos">
      <h3 className="followup-health-panel__title">Saúde dos retornos</h3>
      <div className="followup-health-panel__counts">
        <div className="followup-health-panel__count">
          <FollowupTemperatureBadge temperature="on_track" size="md" />
          <span className="followup-health-panel__num">{on_track}</span>
        </div>
        <div className="followup-health-panel__count">
          <FollowupTemperatureBadge temperature="cooling" size="md" />
          <span className="followup-health-panel__num">{cooling}</span>
        </div>
        <div className="followup-health-panel__count">
          <FollowupTemperatureBadge temperature="critical" size="md" />
          <span className="followup-health-panel__num">{critical}</span>
        </div>
      </div>
      {attendedInWeek > 0 && d1RatePercent !== null ? (
        <p className="followup-health-panel__d1 text-small">
          Contato em D+1 esta semana: <strong>{d1RatePercent}%</strong> ({attendedInWeek} comparecimento
          {attendedInWeek === 1 ? '' : 's'})
        </p>
      ) : null}
      {coolingLeads.length > 0 ? (
        <ul className="followup-health-panel__list">
          {coolingLeads.map((lead) => (
            <li key={lead.id}>
              <button
                type="button"
                className="followup-health-panel__link"
                onClick={() => navigate(`/lead/${lead.id}`)}
              >
                <span>{lead.name}</span>
                <FollowupTemperatureBadge temperature={lead.temperature} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
