import React from 'react';
import { ATTENDANCE_RISK_STATUS, normalizeAttendanceRiskStatus } from '../../../lib/attendanceRetentionCore.js';
import './attendance-at-risk.css';

const KNOWN_STATUSES = new Set([
  ...Object.values(ATTENDANCE_RISK_STATUS),
  'newcomer_at_risk',
]);

/**
 * Badge de risco de frequência (design system).
 */
export default function AttendanceRiskBadge({ status, label, className = '' }) {
  const raw = String(status || '').trim();
  if (!KNOWN_STATUSES.has(raw)) return null;
  const key = normalizeAttendanceRiskStatus(raw);

  return (
    <span
      className={`attendance-risk-badge attendance-risk-badge--${key}${className ? ` ${className}` : ''}`}
    >
      {label || key}
    </span>
  );
}
