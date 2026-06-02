import React from 'react';
import { readStudentOverdueFlag, resolveStudentOverdueBadgeLabel } from '../../lib/studentOverdueDisplay.js';

const OVERDUE_BADGE_STYLE = {
  background: 'rgba(240, 64, 64, 0.12)',
  color: '#F04040',
  fontSize: 10,
  fontWeight: 700,
  padding: '2px 8px',
  borderRadius: 6,
  letterSpacing: '0.02em',
  whiteSpace: 'nowrap',
};

/**
 * Badge de inadimplência (persistido em students.overdue).
 */
export default function StudentOverdueBadge({ student, financeConfig, className = '' }) {
  if (!readStudentOverdueFlag(student)) return null;
  const label = resolveStudentOverdueBadgeLabel(student, financeConfig);

  return (
    <span
      className={`student-overdue-badge${className ? ` ${className}` : ''}`}
      style={OVERDUE_BADGE_STYLE}
      title={label}
    >
      {label}
    </span>
  );
}
