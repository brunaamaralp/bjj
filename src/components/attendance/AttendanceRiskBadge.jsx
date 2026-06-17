import React from 'react';
import { ATTENDANCE_RISK_STATUS } from '../../../lib/attendanceRetentionCore.js';

const VARIANT_STYLES = {
  [ATTENDANCE_RISK_STATUS.ACTIVE]: {
    background: 'var(--color-accent-surface, #E1F5EE)',
    color: 'var(--color-accent-dark, #085041)',
  },
  [ATTENDANCE_RISK_STATUS.AT_RISK]: {
    background: 'var(--warn-bg, #FEF3C7)',
    color: 'var(--warn-text, #B45309)',
  },
  [ATTENDANCE_RISK_STATUS.ABSENT]: {
    background: 'var(--danger-bg, #FEE2E2)',
    color: 'var(--danger, #B91C1C)',
  },
  [ATTENDANCE_RISK_STATUS.NEWCOMER_AT_RISK]: {
    background: 'var(--color-primary-surface, #EDE9FB)',
    color: 'var(--color-primary-dark, #4A2FA3)',
  },
};

/**
 * Badge de risco de frequência (design system).
 */
export default function AttendanceRiskBadge({ status, label, className = '' }) {
  const key = String(status || '').trim();
  const style = VARIANT_STYLES[key];
  if (!style) return null;

  return (
    <span
      className={`attendance-risk-badge attendance-risk-badge--${key}${className ? ` ${className}` : ''}`}
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: 6,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {label || key}
    </span>
  );
}
