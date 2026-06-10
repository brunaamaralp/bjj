import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity } from 'lucide-react';
import ReportSectionHeading from '../reports/shared/ReportSectionHeading.jsx';
import FollowupTemperatureBadge from '../followup/FollowupTemperatureBadge.jsx';
import FollowupTemperatureLegend from '../followup/FollowupTemperatureLegend.jsx';

export default function FollowupHealthPanel({ summary, className = '' }) {
  const navigate = useNavigate();
  if (!summary) return null;

  const { on_track, cooling, critical, coolingLeads, d1RatePercent, attendedInWeek } = summary;
  const hasTemperatureActivity = on_track + cooling + critical > 0;
  const hasD1Metric = attendedInWeek > 0 && d1RatePercent !== null;
  if (!hasTemperatureActivity && !hasD1Metric) return null;

  const rootClass = ['followup-health-panel', 'reception-section', 'animate-in', className]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={rootClass} aria-label="Saúde dos retornos">
      <ReportSectionHeading
        className="reception-report-heading followup-health-panel__heading"
        title={
          <>
            <Activity size={18} color="var(--color-primary)" strokeWidth={2} aria-hidden />
            Saúde dos retornos
          </>
        }
      />
      {hasTemperatureActivity ? (
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
      ) : null}
      {hasD1Metric ? (
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
      <FollowupTemperatureLegend className="followup-health-panel__legend" />
    </section>
  );
}
