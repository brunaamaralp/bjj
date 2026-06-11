import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowRight, HelpCircle } from 'lucide-react';
import ReportSectionHeading from '../reports/shared/ReportSectionHeading.jsx';
import FollowupTemperatureBadge from '../followup/FollowupTemperatureBadge.jsx';

export default function FollowupHealthPanel({
  summary,
  showLeadList = true,
  className = '',
}) {
  const navigate = useNavigate();
  if (!summary) return null;

  const { on_track, cooling, critical, coolingLeads, d1RatePercent, attendedInWeek } = summary;
  const hasTemperatureActivity = on_track + cooling + critical > 0;
  const hasD1Metric = attendedInWeek > 0 && d1RatePercent !== null;
  if (!hasTemperatureActivity && !hasD1Metric) return null;

  const d1Pct = hasD1Metric ? Math.min(100, Math.max(0, Number(d1RatePercent) || 0)) : 0;
  const listLeads = showLeadList ? coolingLeads : [];

  const rootClass = ['followup-health-panel', 'reception-section', 'animate-in', className]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={rootClass} aria-label="Saúde dos retornos">
      <div className="followup-health-panel__head">
        <ReportSectionHeading
          className="reception-report-heading followup-health-panel__heading"
          title={
            <>
              <Activity size={18} color="var(--color-primary)" strokeWidth={2} aria-hidden />
              Saúde dos retornos
            </>
          }
        />
        <button
          type="button"
          className="followup-health-panel__help"
          title="Em dia: já retornou ou ainda no prazo · Esfriando: 1+ dia sem contato · Crítico: 3+ dias sem retorno"
          aria-label="Legenda das temperaturas de retorno"
        >
          <HelpCircle size={16} strokeWidth={2} aria-hidden />
        </button>
      </div>
      {hasTemperatureActivity ? (
        <div className="followup-health-panel__pills" role="list">
          <div className="followup-health-panel__pill" role="listitem">
            <FollowupTemperatureBadge temperature="on_track" size="sm" />
            <span className="followup-health-panel__pill-num">{on_track}</span>
          </div>
          <div className="followup-health-panel__pill" role="listitem">
            <FollowupTemperatureBadge temperature="cooling" size="sm" />
            <span className="followup-health-panel__pill-num">{cooling}</span>
          </div>
          <div className="followup-health-panel__pill" role="listitem">
            <FollowupTemperatureBadge temperature="critical" size="sm" />
            <span className="followup-health-panel__pill-num">{critical}</span>
          </div>
        </div>
      ) : null}
      {hasD1Metric ? (
        <div className="followup-health-panel__d1-block">
          <div className="followup-health-panel__d1-head">
            <span className="followup-health-panel__d1-label">Contato em D+1 esta semana</span>
            <strong className="followup-health-panel__d1-value">{d1RatePercent}%</strong>
          </div>
          <div
            className="followup-health-panel__d1-bar"
            role="progressbar"
            aria-valuenow={d1Pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Contato em D+1: ${d1RatePercent}%`}
          >
            <span className="followup-health-panel__d1-fill" style={{ width: `${d1Pct}%` }} />
          </div>
          <p className="followup-health-panel__d1-meta text-small">
            {attendedInWeek} comparecimento{attendedInWeek === 1 ? '' : 's'} na semana
          </p>
        </div>
      ) : null}
      {listLeads.length > 0 ? (
        <>
          <p className="followup-health-panel__list-label text-small">Atenção no funil</p>
          <ul className="followup-health-panel__list">
            {listLeads.map((lead) => (
              <li key={lead.id}>
                <button
                  type="button"
                  className="followup-health-panel__link"
                  onClick={() => navigate(`/lead/${lead.id}`)}
                >
                  <span className="followup-health-panel__name">{lead.name}</span>
                  <FollowupTemperatureBadge temperature={lead.temperature} size="sm" />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {!showLeadList && hasTemperatureActivity ? (
        <div className="followup-health-panel__funnel">
          <button
            type="button"
            className="followup-health-panel__funnel-link"
            onClick={() => navigate('/pipeline?followup=kanban')}
          >
            Ver no funil
            <ArrowRight size={14} strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      ) : null}
    </section>
  );
}
