import React, { lazy, Suspense, useMemo } from 'react';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronRight,
  TrendingUp,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import ReportKpiCard from './shared/ReportKpiCard.jsx';
import ReportSectionHeading from './shared/ReportSectionHeading.jsx';
import ReportsMethodologyNote from './ReportsMethodologyNote.jsx';
import { HIGHLIGHT_BY_COLOR, pctVar, trendHintFor } from '../../lib/reportsFunnelUtils.js';
import './reports.css';

const ReportsFunilBarChart = lazy(() =>
  import('./ReportsFunilCharts.jsx').then((m) => ({ default: m.ReportsFunilBarChart }))
);
const ReportsFunilConversionChart = lazy(() =>
  import('./ReportsFunilCharts.jsx').then((m) => ({ default: m.ReportsFunilConversionChart }))
);

const HEATMAP_SLOTS = [8, 10, 14, 17, 19, 20];
const HEATMAP_DAYS = [
  { key: 1, label: 'Seg' },
  { key: 2, label: 'Ter' },
  { key: 3, label: 'Qua' },
  { key: 4, label: 'Qui' },
  { key: 5, label: 'Sex' },
  { key: 6, label: 'Sáb' },
  { key: 0, label: 'Dom' },
];

function heatmapLevelClass(count, heatmapMax) {
  if (!heatmapMax || count <= 0) return 'reports-heatmap-cell--0';
  const ratio = count / heatmapMax;
  if (ratio <= 0.2) return 'reports-heatmap-cell--1';
  if (ratio <= 0.4) return 'reports-heatmap-cell--2';
  if (ratio <= 0.6) return 'reports-heatmap-cell--3';
  if (ratio <= 0.8) return 'reports-heatmap-cell--4';
  return 'reports-heatmap-cell--5';
}

export default function ReportsFunilPanel({
  reportData,
  showContent,
  loading,
  showChartSkeleton,
  chartMetric,
  onChartMetricChange,
  chartMode,
  onChartModeChange,
  chartHeight,
  chartDataComparison,
  conversionChartData,
  lastConversionPoint,
  funnelStages,
  heatmapTableView,
  onHeatmapTableViewChange,
  contactLabel,
  contactsPlural,
  terms,
  preset,
  range,
  onDrill,
}) {
  const heatmapMax = useMemo(() => {
    if (!reportData?.heatmapData) return 0;
    return HEATMAP_DAYS.reduce((maxAcc, day) => {
      const dayMap = reportData.heatmapData?.[day.key] || {};
      return HEATMAP_SLOTS.reduce((slotAcc, h) => Math.max(slotAcc, Number(dayMap[h] || 0)), maxAcc);
    }, 0);
  }, [reportData]);

  const heatmapTableRows = useMemo(() => {
    if (!reportData?.heatmapData) return [];
    const rows = [];
    for (const d of HEATMAP_DAYS) {
      for (const h of HEATMAP_SLOTS) {
        rows.push({
          dia: d.label,
          hora: `${String(h).padStart(2, '0')}h`,
          agendamentos: Number(reportData.heatmapData?.[d.key]?.[h] || 0),
        });
      }
    }
    return rows;
  }, [reportData]);

  if (!showContent && !showChartSkeleton) return null;

  const m = reportData?.metrics;

  return (
    <div className="reports-funil-panel mt-4">
      {showContent && m ? (
        <div className="reports-kpi-grid">
          <ReportKpiCard
            label={`Novos ${contactsPlural.toLowerCase()}`}
            value={m.newLeads?.current ?? 0}
            trend={pctVar(m.newLeads?.current ?? 0, m.newLeads?.previous ?? 0)}
            trendLabel="vs. período anterior"
            tooltip={trendHintFor('newLeads', preset)}
            icon={<UserPlus size={20} strokeWidth={2.25} />}
            highlight={HIGHLIGHT_BY_COLOR.accent}
            onClick={() => onDrill('newLeads')}
          />
          <ReportKpiCard
            label="Agendados"
            value={m.scheduled?.current ?? 0}
            trend={pctVar(m.scheduled?.current ?? 0, m.scheduled?.previous ?? 0)}
            trendLabel="vs. período anterior"
            tooltip={trendHintFor('scheduled', preset)}
            icon={<Calendar size={20} strokeWidth={2.25} />}
            highlight={HIGHLIGHT_BY_COLOR.warning}
            onClick={() => onDrill('scheduled')}
          />
          <ReportKpiCard
            label="Compareceram"
            value={m.completed?.current ?? m.showed?.current ?? 0}
            trend={pctVar(
              m.completed?.current ?? m.showed?.current ?? 0,
              m.completed?.previous ?? m.showed?.previous ?? 0
            )}
            trendLabel="vs. período anterior"
            tooltip={trendHintFor('completed', preset)}
            icon={<CheckCircle2 size={20} strokeWidth={2.25} />}
            highlight={HIGHLIGHT_BY_COLOR.success}
            onClick={() => onDrill('completed')}
          />
          <ReportKpiCard
            label={terms.reportsMetricConvertedShort}
            value={m.converted?.current ?? 0}
            trend={pctVar(m.converted?.current ?? 0, m.converted?.previous ?? 0)}
            trendLabel="vs. período anterior"
            tooltip={trendHintFor('converted', preset)}
            icon={<Users size={20} strokeWidth={2.25} />}
            highlight={HIGHLIGHT_BY_COLOR.purple}
            onClick={() => onDrill('converted')}
          />
          <ReportKpiCard
            label="Não compareceram"
            value={m.missed?.current ?? 0}
            trend={pctVar(m.missed?.current ?? 0, m.missed?.previous ?? 0)}
            trendLabel="vs. período anterior"
            tooltip={trendHintFor('missed', preset)}
            icon={<XCircle size={20} strokeWidth={2.25} />}
            highlight={HIGHLIGHT_BY_COLOR.danger}
            onClick={() => onDrill('missed')}
          />
          <ReportKpiCard
            label="Taxa de conversão"
            value={`${m.conversionRate?.current ?? 0}%`}
            trend={pctVar(m.conversionRate?.current ?? 0, m.conversionRate?.previous ?? 0)}
            trendLabel="vs. período anterior"
            tooltip={trendHintFor('conversionRate', preset)}
            icon={<TrendingUp size={20} strokeWidth={2.25} />}
            highlight={HIGHLIGHT_BY_COLOR.accent}
          />
        </div>
      ) : null}

      {funnelStages?.length > 0 && showContent ? (
        <section className="reports-funnel-card mt-4" aria-label="Funil de captação">
          <ReportSectionHeading title="Funil de captação" subtitle="Leads → Matrícula" />
          <div className="reports-funnel-row">
            {funnelStages.map((stage) => (
              <React.Fragment key={stage.key}>
                <button
                  type="button"
                  className={`reports-funnel-stage${stage.drillKey ? ' is-clickable' : ''}`}
                  onClick={() => stage.drillKey && onDrill(stage.drillKey)}
                  disabled={!stage.drillKey}
                >
                  <div className="reports-funnel-track">
                    <span
                      className="reports-funnel-fill"
                      style={{ width: `${stage.barPct}%`, background: stage.color }}
                    />
                  </div>
                  <div className="reports-funnel-value">
                    {stage.isPercent ? `${stage.current}%` : stage.current}
                  </div>
                  <div className="reports-funnel-label">{stage.label}</div>
                  <div className={`reports-funnel-variation ${stage.variation >= 0 ? 'is-up' : 'is-down'}`}>
                    {stage.variation >= 0 ? '+' : ''}
                    {stage.variation}% vs período anterior
                  </div>
                  <span className="reports-funnel-relative">{stage.relativePct}% da etapa anterior</span>
                </button>
                {!stage.isLast ? (
                  <span className="reports-funnel-arrow" aria-hidden>
                    <ChevronRight size={16} strokeWidth={2.25} />
                  </span>
                ) : null}
              </React.Fragment>
            ))}
          </div>
        </section>
      ) : null}

      {showChartSkeleton ? (
        <div
          className="card reports-panel-card reports-evo-card mt-4 reports-chart-skeleton reports-funil-panel__skeleton"
          aria-busy="true"
        />
      ) : null}

      {showContent && !loading && reportData?.chart ? (
        <div className="card reports-panel-card reports-evo-card mt-4">
          <ReportSectionHeading
            title="Evolução no período"
            action={
              <div className="reports-funil-chart-controls">
                <div className="reports-chart-controls-group">
                  <span className="navi-eyebrow">Métrica</span>
                  <div className="filter-strip">
                    <button
                      type="button"
                      className={`filter-chip ${chartMetric === 'new' ? 'is-active' : ''}`}
                      onClick={() => onChartMetricChange('new')}
                    >
                      Novos leads
                    </button>
                    <button
                      type="button"
                      className={`filter-chip ${chartMetric === 'scheduled' ? 'is-active' : ''}`}
                      onClick={() => onChartMetricChange('scheduled')}
                    >
                      Agendados
                    </button>
                    <button
                      type="button"
                      className={`filter-chip ${chartMetric === 'converted' ? 'is-active' : ''}`}
                      onClick={() => onChartMetricChange('converted')}
                    >
                      {terms.reportsMetricConvertedShort}
                    </button>
                  </div>
                </div>
                <div className="reports-chart-controls-group">
                  <span className="navi-eyebrow">Agrupar</span>
                  <div className="filter-strip">
                    <button
                      type="button"
                      className={`filter-chip ${chartMode === 'weekly' ? 'is-active' : ''}`}
                      onClick={() => onChartModeChange('weekly')}
                    >
                      Semanal
                    </button>
                    <button
                      type="button"
                      className={`filter-chip ${chartMode === 'monthly' ? 'is-active' : ''}`}
                      onClick={() => onChartModeChange('monthly')}
                    >
                      Mensal
                    </button>
                  </div>
                </div>
              </div>
            }
          />
          <p className="text-xs text-muted reports-funil-chart-note">
            Mesmo intervalo de <strong>{range.from} — {range.to}</strong>, respeitando filtros de origem e
            perfil.
          </p>
          <div className="reports-chart-legend">
            <span className="reports-chart-legend-item">
              <i className="reports-chart-dot is-current" aria-hidden /> Este período
            </span>
            <span className="reports-chart-legend-item">
              <i className="reports-chart-dot is-previous" aria-hidden /> Período anterior
            </span>
          </div>
          <Suspense fallback={<div className="reports-chart-skeleton" style={{ minHeight: chartHeight }} aria-busy="true" />}>
            <ReportsFunilBarChart
              chartHeight={chartHeight}
              chartDataComparison={chartDataComparison}
              hasChartData={Boolean(reportData?.chart?.length)}
            />
          </Suspense>
        </div>
      ) : null}

      {showContent && !loading ? (
        <div className="card reports-panel-card reports-evo-card mt-4">
          <ReportSectionHeading title="Evolução da taxa de conversão" />
          <Suspense fallback={<div className="reports-chart-skeleton" style={{ minHeight: chartHeight }} aria-busy="true" />}>
            <ReportsFunilConversionChart
              chartHeight={chartHeight}
              conversionChartData={conversionChartData}
              lastConversionPoint={lastConversionPoint}
            />
          </Suspense>
        </div>
      ) : null}

      {showContent && !loading ? (
        <div className="reports-aux-grid mt-4">
          <div className="card reports-panel-card reports-evo-card">
            <ReportSectionHeading
              title="Heatmap de horários"
              action={
                reportData?.heatmapData ? (
                  <button
                    type="button"
                    className="btn-outline btn-sm reports-heatmap-toggle"
                    onClick={() => onHeatmapTableViewChange(!heatmapTableView)}
                  >
                    {heatmapTableView ? 'Ver heatmap' : 'Ver tabela'}
                  </button>
                ) : null
              }
            />
            {!reportData?.heatmapData ? (
              <p className="text-small text-muted">Dados insuficientes para este período.</p>
            ) : heatmapTableView ? (
              heatmapTableRows.filter((r) => r.agendamentos > 0).length === 0 ? (
                <p className="text-small text-muted">Nenhum agendamento neste período.</p>
              ) : (
                <div className="reports-heatmap-table-wrap">
                  <table className="reports-heatmap-table">
                    <thead>
                      <tr>
                        <th>Dia</th>
                        <th>Hora</th>
                        <th>Agendamentos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {heatmapTableRows
                        .filter((r) => r.agendamentos > 0)
                        .map((r) => (
                          <tr key={`${r.dia}-${r.hora}`}>
                            <td>{r.dia}</td>
                            <td>{r.hora}</td>
                            <td>{r.agendamentos}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              <div className="reports-heatmap">
                <div className="reports-heatmap-head">
                  <span />
                  {HEATMAP_DAYS.map((d) => (
                    <span key={d.label} className="reports-heatmap-day">
                      {d.label}
                    </span>
                  ))}
                </div>
                {HEATMAP_SLOTS.map((hour) => (
                  <div key={hour} className="reports-heatmap-row">
                    <span className="reports-heatmap-hour">{String(hour).padStart(2, '0')}h</span>
                    {HEATMAP_DAYS.map((d) => {
                      const count = Number(reportData.heatmapData?.[d.key]?.[hour] || 0);
                      return (
                        <span
                          key={`${d.key}-${hour}`}
                          className={`reports-heatmap-cell ${heatmapLevelClass(count, heatmapMax)}`}
                          title={`${d.label} ${String(hour).padStart(2, '0')}h: ${count}`}
                        />
                      );
                    })}
                  </div>
                ))}
                <div className="reports-heatmap-legend">
                  Menos <ArrowRight size={12} strokeWidth={2.25} aria-hidden className="reports-heatmap-legend-icon" /> Mais
                </div>
              </div>
            )}
          </div>
          <div className="card reports-panel-card reports-evo-card">
            <ReportSectionHeading title="Tempo médio no funil" />
            {!reportData?.funnelTiming ? (
              <p className="text-small text-muted">Dados insuficientes para este período.</p>
            ) : (
              <div className="reports-timing-grid">
                <div className="reports-timing-col">
                  <div className="reports-timing-value">{reportData.funnelTiming.createdToScheduled ?? '—'}d</div>
                  <div className="reports-timing-label">{`${contactLabel} → Agendamento`}</div>
                </div>
                <div className="reports-timing-col">
                  <div className="reports-timing-value">{reportData.funnelTiming.scheduledToAttended ?? '—'}d</div>
                  <div className="reports-timing-label">Agendamento → Aula</div>
                </div>
                <div className="reports-timing-col">
                  <div className="reports-timing-value">{reportData.funnelTiming.attendedToConverted ?? '—'}d</div>
                  <div className="reports-timing-label">{terms.reportsTimingAttendedToEnrolled}</div>
                </div>
                <div className="reports-timing-col is-total">
                  <div className="reports-timing-value">{reportData.funnelTiming.total ?? '—'}d</div>
                  <div className="reports-timing-label">Total</div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {showContent ? <ReportsMethodologyNote className="mt-4" /> : null}
    </div>
  );
}
