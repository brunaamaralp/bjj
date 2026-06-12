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
import { UserPlus, UserMinus, TrendingDown, TrendingUp } from 'lucide-react';
import { reportKpiTooltip } from '../../lib/reportKpiTooltip.js';
import { kpiRagProps } from '../../lib/reportKpiGoalsUi.js';
import {
  activeStudentsCount,
  buildStudentChartRanges,
  fetchStudentMetricsForRange,
  studentMetricsToChartPoint,
} from '../../lib/reportsStudentMetricsApi.js';
import { previousPeriodRange } from '../../lib/reportsPeriod.js';
import EmptyState from '../shared/EmptyState.jsx';
import ReportKpiCard, { ReportKpiCardSkeleton } from './shared/ReportKpiCard.jsx';
import ReportsPanelSection from './shared/ReportsPanelSection.jsx';
import ReportsPanelShell from './shared/ReportsPanelShell.jsx';
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
  periodLabel = '',
  studentMetrics,
  loading,
  kpiGoals = {},
}) {
  const prevFetchKey =
    academyId && rangeFrom && rangeTo && !loading
      ? `${academyId}|${rangeFrom}|${rangeTo}|${preset}`
      : '';
  const chartFetchKey =
    academyId && rangeFrom && rangeTo && !loading ? `${academyId}|${rangeFrom}|${rangeTo}` : '';
  const [prevState, setPrevState] = useState({ key: '', metrics: null });
  const [chartState, setChartState] = useState({ key: '', rows: [], loading: false });
  const prevMetrics = prevFetchKey && prevState.key === prevFetchKey ? prevState.metrics : null;
  const stableChartRows = useMemo(
    () => (chartFetchKey && chartState.key === chartFetchKey ? chartState.rows : []),
    [chartFetchKey, chartState.key, chartState.rows]
  );
  const chartLoading = Boolean(chartFetchKey) && (chartState.key !== chartFetchKey || chartState.loading);

  const m = studentMetrics || {};
  const active = activeStudentsCount(m);
  const novo = Number(m.newStudents) || 0;
  const off = Number(m.deactivations) || 0;
  const churn = Number(m.churnRate) || 0;
  const retention =
    m.retentionRate != null && m.retentionRate !== ''
      ? Number(m.retentionRate) || 0
      : Math.max(0, 100 - churn);

  const pm = prevMetrics || {};
  const prevActive = activeStudentsCount(pm);
  const prevNovo = Number(pm.newStudents) || 0;
  const prevOff = Number(pm.deactivations) || 0;
  const prevChurn = Number(pm.churnRate) || 0;
  const prevRetention =
    pm.retentionRate != null && pm.retentionRate !== ''
      ? Number(pm.retentionRate) || 0
      : Math.max(0, 100 - prevChurn);

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
    const buckets = buildStudentChartRanges(rangeFrom, rangeTo);
    Promise.all(
      buckets.map(async ({ from, to, label }) => {
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
  }, [chartFetchKey, academyId, rangeFrom, rangeTo]);

  const hasChartData = useMemo(
    () => stableChartRows.some((r) => r.ativos > 0 || r.novos > 0 || r.cancelamentos > 0),
    [stableChartRows]
  );

  if (loading) {
    return (
      <ReportsPanelShell>
        <ReportsPanelSection aria-busy="true">
          <div className="reports-kpi-grid">
            {[1, 2, 3, 4].map((i) => (
              <ReportKpiCardSkeleton key={i} />
            ))}
          </div>
        </ReportsPanelSection>
      </ReportsPanelShell>
    );
  }

  const isStudentBaseEmpty = active === 0 && novo === 0 && off === 0;

  if (isStudentBaseEmpty) {
    return (
      <ReportsPanelShell>
        <ReportsPanelSection className="reports-empty">
          <EmptyState
            insideCard
            variant="compact"
            tone="solid"
            title="Nenhum aluno no período"
            description="Cadastre matrículas ou amplie o intervalo de datas para ver métricas da base."
            role="status"
          />
        </ReportsPanelSection>
      </ReportsPanelShell>
    );
  }

  return (
    <ReportsPanelShell className="animate-in" aria-labelledby="reports-students-heading">
      <ReportsPanelSection
        title="Alunos"
        subtitle="Métricas de base matriculada no intervalo. Passe o mouse no ícone de cada card para ver a definição."
      >
        <div className="reports-kpi-grid">
        <ReportKpiCard
          label="Novos alunos"
          value={novo}
          trend={pctVar(novo, prevNovo)}
          trendLabel="vs. período anterior"
          tooltip={reportKpiTooltip('newStudents', { preset })}
          icon={<UserPlus size={20} strokeWidth={2.25} />}
          highlight="success"
        />
        <ReportKpiCard
          label="Desligamentos"
          value={off}
          trend={pctVar(off, prevOff)}
          trendLabel="vs. período anterior"
          tooltip={reportKpiTooltip('deactivations', { preset })}
          icon={<UserMinus size={20} strokeWidth={2.25} />}
          highlight="danger"
        />
        <ReportKpiCard
          label="Churn"
          value={`${churn.toFixed(1)}%`}
          trend={pctVar(churn, prevChurn)}
          trendLabel="vs. período anterior"
          tooltip={reportKpiTooltip('churnRate', { preset })}
          icon={<TrendingDown size={20} strokeWidth={2.25} />}
          highlight="danger"
          {...kpiRagProps('churnRate', churn, kpiGoals)}
        />
        <ReportKpiCard
          label="Retenção"
          value={`${retention.toFixed(1)}%`}
          trend={pctVar(retention, prevRetention)}
          trendLabel="vs. período anterior"
          tooltip={reportKpiTooltip('retentionRate', { preset })}
          icon={<TrendingUp size={20} strokeWidth={2.25} />}
          highlight="success"
          {...kpiRagProps('retentionRate', retention, kpiGoals)}
        />
        </div>
      </ReportsPanelSection>

      <ReportsPanelSection
        title="Evolução da base"
        subtitle={periodLabel || 'Período selecionado'}
        className="reports-panel-section--chart"
      >
        {chartLoading ? (
          <div className="reports-chart-skeleton" style={{ minHeight: 240 }} aria-busy="true" />
        ) : !hasChartData ? (
          <p className="text-small text-muted reports-panel-note">
            Sem histórico de alunos no período. Cadastre matrículas para ver a evolução aqui.
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
                stroke="var(--color-primary)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="novos"
                name="Novos no período"
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
      </ReportsPanelSection>
    </ReportsPanelShell>
  );
}
