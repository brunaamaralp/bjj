import React from 'react';
import { Info, TrendingDown, TrendingUp } from 'lucide-react';

const HIGHLIGHT_CLASS = {
  default: '',
  success: 'report-kpi-card--success',
  danger: 'report-kpi-card--danger',
  warning: 'report-kpi-card--warning',
  attention: 'report-kpi-card--attention',
};

const RAG_CLASS = {
  ok: 'report-kpi-card--rag-ok',
  warn: 'report-kpi-card--rag-warn',
  critical: 'report-kpi-card--rag-critical',
};

/**
 * KPI padronizado para abas de Relatórios e Dashboard.
 */
export default function ReportKpiCard({
  label,
  value,
  trend = null,
  trendLabel = null,
  icon = null,
  highlight = 'default',
  tooltip = null,
  onClick = null,
  showCta = true,
  ctaLabel = 'Ver detalhes →',
  ctaIcon = null,
  loading = false,
  valueVariant = 'metric',
  rag = null,
  goalTarget = null,
  className = '',
}) {
  if (loading) {
    return <ReportKpiCardSkeleton className={className} />;
  }

  const clickable = typeof onClick === 'function';
  const hasTrend = typeof trend === 'number' && !Number.isNaN(trend);
  const isUp = hasTrend ? trend >= 0 : true;
  const highlightClass = HIGHLIGHT_CLASS[highlight] || HIGHLIGHT_CLASS.default;
  const ragClass = rag ? RAG_CLASS[rag] || '' : '';

  return (
    <div
      className={[
        'report-kpi-card',
        highlightClass,
        ragClass,
        clickable ? 'report-kpi-card--clickable' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="report-kpi-card__head">
        <span className="report-kpi-card__label">
          {label}
          {tooltip ? (
            <button
              type="button"
              className="report-kpi-card__info"
              aria-label={`Definição: ${label}`}
              title={tooltip}
            >
              <Info size={14} aria-hidden />
            </button>
          ) : null}
        </span>
        {icon ? (
          <span className="report-kpi-card__icon" aria-hidden>
            {icon}
          </span>
        ) : null}
      </div>
      <div className="report-kpi-card__value-row">
        <span
          className={[
            'report-kpi-card__value',
            valueVariant === 'message' ? 'report-kpi-card__value--message' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {value}
        </span>
        {hasTrend ? (
          <span className={`report-kpi-card__trend ${isUp ? 'is-up' : 'is-down'}`}>
            {isUp ? <TrendingUp size={14} strokeWidth={2.25} aria-hidden /> : <TrendingDown size={14} strokeWidth={2.25} aria-hidden />}
            <span>
              {isUp && trend > 0 ? '+' : ''}
              {trend}%
            </span>
          </span>
        ) : null}
      </div>
      {trendLabel ? <p className="report-kpi-card__trend-label">{trendLabel}</p> : null}
      {goalTarget ? <p className="report-kpi-card__goal-target">{goalTarget}</p> : null}
      {clickable && showCta ? (
        <span className="report-kpi-card__cta">
          {ctaIcon ? <span className="report-kpi-card__cta-icon">{ctaIcon}</span> : null}
          <span>{ctaLabel}</span>
        </span>
      ) : null}
    </div>
  );
}

export function ReportKpiCardSkeleton({ className = '' }) {
  return <div className={`report-kpi-card report-kpi-card--skeleton ${className}`.trim()} aria-hidden />;
}
