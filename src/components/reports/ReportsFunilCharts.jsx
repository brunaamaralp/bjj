import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, LineChart, Line, CartesianGrid } from 'recharts';
import ReportsChart, {
  REPORTS_CHART_AXIS_TICK,
  ReportsChartTooltip,
} from './shared/ReportsChart.jsx';

const parseYMD = (s) => {
  if (!s) return null;
  const [Y, M, D] = s.split('-').map(Number);
  return new Date(Y, (M || 1) - 1, D || 1);
};

const formatChartTickPt = (rawLabel) => {
  const raw = String(rawLabel || '').trim();
  if (!raw) return raw;
  let d = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) d = parseYMD(raw);
  else if (/^\d{2}\/\d{2}$/.test(raw)) {
    const [day, month] = raw.split('/').map(Number);
    d = new Date(new Date().getFullYear(), (month || 1) - 1, day || 1);
  }
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return raw;
  return d
    .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    .replace('.', '');
};

export function ReportsFunilBarChart({ chartHeight, chartDataComparison, hasChartData }) {
  if (!hasChartData) {
    return (
      <p className="text-small text-muted reports-chart-empty-note">
        Período muito curto ou inválido para agrupar.
      </p>
    );
  }

  return (
    <ReportsChart height={chartHeight}>
      <BarChart data={chartDataComparison}>
        <XAxis
          dataKey="label"
          tick={REPORTS_CHART_AXIS_TICK}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatChartTickPt}
        />
        <YAxis hide />
        <Tooltip
          cursor={{ fill: 'rgba(0,0,0,0.05)' }}
          content={<ReportsChartTooltip />}
        />
        <Bar dataKey="current" name="Este período" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
        <Bar
          dataKey="previous"
          name="Período anterior"
          fill="color-mix(in srgb, var(--color-primary) 35%, var(--color-card-border))"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ReportsChart>
  );
}

export function ReportsFunilConversionChart({ chartHeight, conversionChartData, lastConversionPoint }) {
  if (conversionChartData.length === 0) {
    return (
      <p className="text-small text-muted reports-chart-empty-note">
        Dados insuficientes para este período.
      </p>
    );
  }

  return (
    <>
      <p className="text-xs text-light reports-chart-last-point">
        Último ponto: <strong>{Number(lastConversionPoint?.rate || 0).toFixed(1)}%</strong>
      </p>
      <ReportsChart height={chartHeight}>
        <LineChart data={conversionChartData}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
          <XAxis dataKey="date" tick={REPORTS_CHART_AXIS_TICK} tickLine={false} axisLine={false} />
          <YAxis hide />
          <Tooltip
            cursor={{ stroke: 'var(--color-primary)', strokeOpacity: 0.2 }}
            content={
              <ReportsChartTooltip formatter={(value) => `${Number(value || 0).toFixed(1)}%`} />
            }
          />
          <Line
            type="monotone"
            dataKey="rate"
            name="Este período"
            stroke="var(--color-primary)"
            strokeWidth={2.5}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="previousRate"
            name="Período anterior"
            stroke="color-mix(in srgb, var(--color-primary) 50%, var(--color-text-secondary))"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={{ r: 2 }}
          />
        </LineChart>
      </ReportsChart>
    </>
  );
}
