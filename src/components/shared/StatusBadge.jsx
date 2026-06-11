import React, { useMemo } from 'react';
import './status-badge.css';

const TONE_VARS = {
  success: {
    '--status-badge-color': 'var(--color-success, var(--color-accent))',
    '--status-badge-surface': 'var(--color-success-surface, var(--color-accent-surface))',
  },
  danger: {
    '--status-badge-color': 'var(--color-danger, var(--danger))',
    '--status-badge-surface': 'var(--color-danger-surface, var(--danger-light))',
  },
  warning: {
    '--status-badge-color': 'var(--color-warning, var(--warning))',
    '--status-badge-surface': 'var(--color-warning-surface, var(--warning-light))',
  },
  info: {
    '--status-badge-color': 'var(--color-info, var(--petroleo, var(--color-primary)))',
    '--status-badge-surface': 'var(--color-info-surface, var(--inbox-info-badge-bg))',
  },
  neutral: {
    '--status-badge-color': 'var(--color-text-secondary, var(--text-muted))',
    '--status-badge-surface': 'var(--color-surface-muted, color-mix(in srgb, var(--color-text-secondary) 12%, transparent))',
  },
};

/**
 * Badge de status unificado (pill com tokens por tom).
 *
 * @param {object} props
 * @param {string} props.status — chave do status
 * @param {Record<string, { label: string, color?: string, tone?: string }>} props.map
 * @param {'sm' | 'md'} [props.size]
 * @param {React.ReactNode} [props.icon]
 * @param {string} [props.className]
 */
export default function StatusBadge({
  status,
  map = {},
  size = 'sm',
  icon = null,
  className = '',
}) {
  const key = String(status || '').trim().toLowerCase();
  const config = map[key] || map[status] || null;
  const tone = String(config?.tone || 'neutral').toLowerCase();

  const toneStyle = useMemo(() => {
    if (!config?.label) return TONE_VARS.neutral;
    if (config.color) {
      return {
        '--status-badge-color': config.color,
        '--status-badge-surface': `color-mix(in srgb, ${config.color} 12%, transparent)`,
      };
    }
    return TONE_VARS[tone] || TONE_VARS.neutral;
  }, [config, tone]);

  if (!config?.label) return null;

  return (
    <span
      className={['status-badge', `status-badge--${size}`, className].filter(Boolean).join(' ')}
      style={toneStyle}
    >
      {icon ? <span className="status-badge__icon" aria-hidden>{icon}</span> : null}
      <span className="status-badge__label">{config.label}</span>
    </span>
  );
}
