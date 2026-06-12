import React from 'react';
import { ResponsiveContainer } from 'recharts';

/** Tick padrão dos eixos Recharts nos relatórios. */
export const REPORTS_CHART_AXIS_TICK = {
  fontSize: 11,
  fill: 'var(--color-text-secondary)',
};

export function ReportsChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="reports-chart-tooltip">
      {label ? <div className="reports-chart-tooltip__label">{label}</div> : null}
      {payload.map((entry) => (
        <div key={`${entry.name}-${entry.dataKey}`} className="reports-chart-tooltip__row">
          <span>{entry.name}: </span>
          <strong>
            {formatter
              ? formatter(entry.value, entry.name, entry)
              : entry.value}
          </strong>
        </div>
      ))}
    </div>
  );
}

/**
 * Wrapper compartilhado para gráficos Recharts nos relatórios.
 * @param {{ height?: number, className?: string, children: React.ReactElement }} props
 */
export default function ReportsChart({ height = 260, className = '', children }) {
  return (
    <div className={['reports-chart-wrap', className].filter(Boolean).join(' ')}>
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}
