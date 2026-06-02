import React from 'react';
import { ReportKpiCardSkeleton } from '../reports/shared/ReportKpiCard.jsx';
import './skeleton-card.css';

/**
 * Skeleton unificado para KPI, linhas de lista e cards.
 *
 * @param {'kpi' | 'list-row' | 'card'} variant
 * @param {number} count
 * @param {string} [className]
 */
export default function SkeletonCard({ variant = 'card', count = 1, className = '' }) {
  const n = Math.max(1, Number(count) || 1);

  if (variant === 'kpi') {
    return (
      <div className={['skeleton-card-group skeleton-card-group--kpi', className].filter(Boolean).join(' ')}>
        {Array.from({ length: n }, (_, i) => (
          <ReportKpiCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (variant === 'list-row') {
    return (
      <div className={['skeleton-card-group', className].filter(Boolean).join(' ')}>
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className="skeleton-card skeleton-card--list-row" aria-hidden />
        ))}
      </div>
    );
  }

  return (
    <div className={['skeleton-card-group', className].filter(Boolean).join(' ')}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="skeleton-card skeleton-card--card" aria-hidden />
      ))}
    </div>
  );
}
