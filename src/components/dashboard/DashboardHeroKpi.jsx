import React from 'react';

function handleCardKeyDown(e, onClick) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    onClick();
  }
}

/**
 * KPI do hero do Dashboard — layout editorial (ícone em chip, número em destaque).
 */
export default function DashboardHeroKpi({
  label,
  value,
  footnote = null,
  footnoteTone = 'neutral',
  icon = null,
  tone = 'default',
  spotlight = false,
  onClick = null,
  className = '',
}) {
  const clickable = typeof onClick === 'function';
  const rootClass = [
    'dashboard-hero-kpi',
    `dashboard-hero-kpi--${tone}`,
    spotlight ? 'dashboard-hero-kpi--spotlight' : '',
    clickable ? 'dashboard-hero-kpi--clickable' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={rootClass}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={clickable ? (e) => handleCardKeyDown(e, onClick) : undefined}
    >
      <div className="dashboard-hero-kpi__top">
        {icon ? <span className="dashboard-hero-kpi__icon-wrap">{icon}</span> : null}
        <span className="dashboard-hero-kpi__label">{label}</span>
      </div>
      <p className="dashboard-hero-kpi__value">{value}</p>
      {footnote ? (
        <p
          className={[
            'dashboard-hero-kpi__footnote',
            footnoteTone === 'positive' ? 'dashboard-hero-kpi__footnote--positive' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {footnote}
        </p>
      ) : (
        <p className="dashboard-hero-kpi__footnote dashboard-hero-kpi__footnote--placeholder" aria-hidden>
          &nbsp;
        </p>
      )}
    </div>
  );
}

export function DashboardHeroKpiSkeleton({ className = '' }) {
  return (
    <div
      className={['dashboard-hero-kpi', 'dashboard-hero-kpi--skeleton', className].filter(Boolean).join(' ')}
      aria-hidden
    />
  );
}
