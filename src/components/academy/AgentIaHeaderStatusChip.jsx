import React from 'react';

/**
 * Chip de status no PageHeader de /agente-ia.
 * @param {{ label: string, variant: 'active' | 'paused' }} props
 */
export default function AgentIaHeaderStatusChip({ label, variant }) {
  return (
    <span
      className={`agent-ia-header-chip agent-ia-header-chip--${variant}`}
      role="status"
    >
      {label}
    </span>
  );
}
