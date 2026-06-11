import React from 'react';

export default function FollowupTemperatureLegend({ className = '' }) {
  return (
    <p className={`followup-temp-legend text-small text-muted${className ? ` ${className}` : ''}`} role="note">
      <span className="followup-temp-legend__item">
        <span className="followup-temp-legend__dot followup-temp-legend__dot--on_track" aria-hidden />
        Em dia (já retornou ou no prazo)
      </span>
      <span className="followup-temp-legend__sep" aria-hidden>
        ·
      </span>
      <span className="followup-temp-legend__item">
        <span className="followup-temp-legend__dot followup-temp-legend__dot--cooling" aria-hidden />
        Esfriando (1+ dia sem contato)
      </span>
      <span className="followup-temp-legend__sep" aria-hidden>
        ·
      </span>
      <span className="followup-temp-legend__item">
        <span className="followup-temp-legend__dot followup-temp-legend__dot--critical" aria-hidden />
        Crítico (3+ dias)
      </span>
    </p>
  );
}
