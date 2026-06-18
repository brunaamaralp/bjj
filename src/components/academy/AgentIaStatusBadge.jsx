import React from 'react';
import { AGENT_STATUS_BADGE_LABELS } from '../../lib/agentIaServiceControl.js';

/**
 * @param {{ variant: import('../../lib/agentIaServiceControl.js').AgentIaStatusVariant }} props
 */
export default function AgentIaStatusBadge({ variant }) {
  const label = AGENT_STATUS_BADGE_LABELS[variant] || AGENT_STATUS_BADGE_LABELS.unconfigured;
  return (
    <span className={`agent-ia-status-badge agent-ia-status-badge--${variant}`} role="status">
      {label}
    </span>
  );
}
