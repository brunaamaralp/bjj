import React from 'react';
import { temperatureLabel } from '../../lib/followupTemperature.js';

export default function FollowupTemperatureBadge({ temperature, size = 'sm', className = '' }) {
  const temp = String(temperature || 'on_track').trim();
  const label = temperatureLabel(temp);
  const sizeClass = size === 'md' ? 'followup-temp--md' : 'followup-temp--sm';

  return (
    <span
      className={`followup-temp followup-temp--${temp} ${sizeClass} ${className}`.trim()}
      title={label}
      aria-label={`Retorno: ${label}`}
    >
      <span className="followup-temp__dot" aria-hidden />
      <span className="followup-temp__label">{label}</span>
    </span>
  );
}
