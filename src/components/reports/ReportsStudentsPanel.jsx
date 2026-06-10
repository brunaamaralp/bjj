import React, { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Users, UserPlus, UserMinus, TrendingDown, TrendingUp } from 'lucide-react';
import { metricTooltip } from '../../../lib/reportsMetricDefinitions.js';
import {
  buildLastSixMonthRanges,
  fetchStudentMetricsForRange,
  studentMetricsToChartPoint,
} from '../../lib/reportsStudentMetricsApi.js';
import { previousPeriodRange } from '../../lib/reportsPeriod.js';
import ReportKpiCard, { ReportKpiCardSkeleton } from './shared/ReportKpiCard.jsx';
import ReportSectionHeading from './shared/ReportSectionHeading.jsx';
import './reports.css';

const pctVar = (cur, prev) => {
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
};

export default function ReportsStudentsPanel({
  academyId,
  rangeTo,
  rangeFrom,
  preset = 'month',
  studentMetrics,
  loading,
}) {
  const prevFetchKey =
    academyId && rangeFrom && rangeTo && !loading
      ? `${academyId}|${rangeFrom}|${rangeTo}|${preset}`
      : '';
  const chartFetchKey = academyId && rangeTo && !loading ? `${academyId}|${rangeTo}` : '';
  const [prevState, setPrevState] = useState({ key: '', metrics: null });
  const [chartState, setChartState] = useState({ key: '', rows: [], loading: false });
  const prevMetrics = prevFetchKey && prevState.key === prevFetchKey ? prevState.metrics : null;
  const stableChartRows = useMemo(
    () => (chartFetchKey && chartState.key === chartFetchKey ? chartState.rows : []),
    [chartFetchKey, chartState.key, chartState.rows]
  );
  const chartLoading = Boolean(chartFetchKey) && (chartState.key !== chartFetchKey || chartState.loading);

  const m = studentMetrics || {};
  const active = Number(m.activeAtStart) || 0;
  const novo = Number(m.newStudents) || 0;
  const off = Number(m.deactivations) || 0;
  const churn = Number(m.churnRate) || 0;
  const retention = Number(m.retentionRate) ?? Math.max(0, 100 - churn);

  const pm = prevMetrics || {};
  const prevActive = Number(pm.activeAtStart) || 0;
  const prevNovo = Number(pm.newStudents) || 0;
  const prevOff = Number(pm.deactivations) || 0;
  const prevChurn = Number(pm.churnRate) || 0;
  const prevRetention = Number(pm.retentionRate) ?? Math.max(0, 100 - prevChurn);

  useEffect(() => {
    if (!prevFetchKey) return undefined;
    let active = true;
    const prev = previousPeriodRange(preset, { from: rangeFrom, to: rangeTo });
    fetchStudentMetricsForRange({ academyId, from: prev.from, to: prev.to })
      .then((sm) => {
        if (active) setPrevState({ key: prevFetchKey, metrics: sm });
      })
      .catch(() => {
        if (active) setPrevState({ key: prevFetchKey, metrics: null });
      });
    return () => {
      active = false;
    };
  }, [prevFetchKey, academyId, rangeFrom, rangeTo, preset]);

  useEffect(() => {
    if (!chartFetchKey) return undefined;
    let active = true;
    const months = buildLastSixMonthRanges(rangeTo);
    Promise.all(
      months.map(async ({ from, to, label }) => {
        try {
          const sm = await fetchStudentMetricsForRange({ academyId, from, to });
          return studentMetricsToChartPoint(label, sm);
        } catch {
          return studentMetricsToChartPoint(label, null);
        }
      })
    )
      .then((rows) => {
        if (active) setChartState({ key: chartFetchKey, rows, loading: false });
      })
      .catch(() => {
        if (active) setChartState({ key: chartFetchKey, rows: [], loading: false });
      });
    return () => {
      active = false;
    };
  }, [chartFetchKey, academyId, rangeTo]);

  const hasChartData = useMemo(
    () => stableChartRows.some((r) => r.ativos > 0 || r.novos > 0 || r.cancelamentos > 0),
    [stableChartRows]
  );

  if (loading) {
    return (
      <div className="reports-kpi-grid mt-4" aria-busy="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <ReportKpiCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <section className="mt-4 animate-in" aria-labelledby="reports-students-heading">
      <ReportSectionHeading
        title="Alunos"
        subtitle="Métricas de base matriculada no intervalo. Passe o mouse no ícone de cada card para ver a definição."
      />
      <div className="reports-kpi-grid">
        <ReportKpiCard
          label="Ativos no início"
          value={active}
          trend={pctVar(active, prevActive)}
          trendLabel="vs. período anterior"
          tooltip={metricTooltip('activeStudentsStart')}
          icon={<Users size={20} strokeWidth={2.25} />}
        />
        <ReportKpiCard
          label="Novos alunos"
          value={novo}
          trend={pctVar(novo, prevNovo)}
          trendLabel="vs. período anterior"
          tooltip={metricTooltip('newStudents')}
          icon={<UserPlus size={20} strokeWidth={2.25} />}
          highlight="success"
        />
        <ReportKpiCard
          label="Desligamentos"
          value={off}
          trend={pctVar(off, prevOff)}
          trendLabel="vs. período anterior"
          tooltip={metricTooltip('deactivations')}
          icon={<UserMinus size={20} strokeWidth={2.25} />}
          highlight="danger"
        />
        <ReportKpiCard
          label="Churn"
          value={`${churn.toFixed(1)}%`}
          trend={pctVar(churn, prevChurn)}
          trendLabel="vs. período anterior"
          tooltip={metricTooltip('churnRate')}
          icon={<TrendingDown size={20} strokeWidth={2.25} />}
          highlight="danger"
        />
        <ReportKpiCard
          label="Retenção"
          value={`${retention.toFixed(1)}%`}
          trend={pctVar(retention, prevRetention)}
          trendLabel="vs. período anterior"
          tooltip={metricTooltip('retentionRate')}
          icon={<TrendingUp size={20} strokeWidth={2.25} />}
          highlight="success"
        />
      </div>

      <div className="card reports-evo-card mt-4">
        <ReportSectionHeading title="Evolução da base" subtitle="Últimos 6 meses" />
        {chartLoading ? (
          <div className="reports-chart-skeleton" style={{ minHeight: 240 }} aria-busy="true" />
        ) : !hasChartData ? (
          <p className="text-small text-muted" style={{ padding: '12px 0' }}>
            Sem histórico de alunos nos meses recentes. Cadastre matrículas para ver a evolução aqui.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={stableChartRows} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e8e5f5)" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="ativos"
                name="Ativos"
                stroke="var(--petroleo, #003654)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="novos"
                name="Novos no mês"
                stroke="var(--success, #16a34a)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="cancelamentos"
                name="Cancelamentos"
                stroke="var(--danger, #dc2626)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
