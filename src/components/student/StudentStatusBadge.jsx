import React from 'react';
import { STUDENT_STATUS_BADGE_LABELS } from '../../lib/studentDisplayStatus.js';

const VARIANT_STYLES = {
  ativo: {
    background: 'var(--success-bg, #EAF3DE)',
    color: 'var(--success-text, #3B6D11)',
  },
  trancado: {
    background: 'var(--warn-bg, #FEF3C7)',
    color: 'var(--warn-text, #B45309)',
  },
  inativo: {
    background: 'var(--surface-hover, #e8eef5)',
    color: 'var(--text-secondary, #475569)',
  },
  pendente: {
    background: '#FFEDD5',
    color: '#C2410C',
  },
  pago: {
    background: 'var(--v50, #f3f0ff)',
    color: 'var(--v700, #5B3FBF)',
  },
};

/**
 * Badge unificado de status do aluno (design system).
 */
export default function StudentStatusBadge({ status, className = '' }) {
  const key = String(status || '').toLowerCase();
  if (!key || !VARIANT_STYLES[key]) return null;
  const style = VARIANT_STYLES[key];
  const label = STUDENT_STATUS_BADGE_LABELS[key] || key;

  return (
    <span
      className={`student-status-badge student-status-badge--${key}${className ? ` ${className}` : ''}`}
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
      {label}
    </span>
  );
}
