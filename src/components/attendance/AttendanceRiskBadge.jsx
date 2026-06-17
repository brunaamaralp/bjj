import React from 'react';
import { ATTENDANCE_RISK_STATUS } from '../../../lib/attendanceRetentionCore.js';
import './attendance-at-risk.css';

const KNOWN_STATUSES = new Set(Object.values(ATTENDANCE_RISK_STATUS));

/**
 * Badge de risco de frequência (design system).
 */
export default function AttendanceRiskBadge({ status, label, className = '' }) {
  const key = String(status || '').trim();
  if (!KNOWN_STATUSES.has(key)) return null;

  return (
    <span
      className={`attendance-risk-badge attendance-risk-badge--${key}${className ? ` ${className}` : ''}`}
    >
      {label || key}
    </span>
  );
}
