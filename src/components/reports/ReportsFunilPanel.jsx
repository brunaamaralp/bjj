import React, { lazy, Suspense, useMemo } from 'react';
import {
  ArrowRight,
  Calendar,
  ChevronRight,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import ReportKpiCard, { ReportKpiCardSkeleton } from './shared/ReportKpiCard.jsx';
import ReportsPanelShell from './shared/ReportsPanelShell.jsx';
import ReportsPanelSection from './shared/ReportsPanelSection.jsx';
import ReportsMethodologyNote from './ReportsMethodologyNote.jsx';
import { pctVar } from '../../lib/reportsFunnelUtils.js';
import { reportKpiTooltip } from '../../lib/reportKpiTooltip.js';
import { kpiRagProps } from '../../lib/reportKpiGoalsUi.js';
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
  kpiGoals = {},
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

  const showKpiSkeleton = showChartSkeleton && !showContent;
  const chartSkeletonClass =
    chartHeight <= 200 ? 'reports-chart-skeleton--h-sm' : 'reports-chart-skeleton--h-md';

  return (
    <ReportsPanelShell>
      <div className="reports-funil-primary">
        {showKpiSkeleton ? (
          <ReportsPanelSection title="Indicadores do funil" aria-busy="true">
            <div className="reports-kpi-grid">
              {[1, 2, 3, 4].map((i) => (
                <ReportKpiCardSkeleton key={i} />
              ))}
            </div>
          </ReportsPanelSection>
        ) : null}

        {showContent && m ? (
          <ReportsPanelSection title="Indicadores do funil">
            <div className="reports-kpi-grid">
              <ReportKpiCard
                label={`Novos ${contactsPlural.toLowerCase()}`}
                value={m.newLeads?.current ?? 0}
                trend={pctVar(m.newLeads?.current ?? 0, m.newLeads?.previous ?? 0)}
                trendLabel="vs. período anterior"
                tooltip={reportKpiTooltip('newLeads', { preset })}
                icon={<UserPlus size={20} strokeWidth={2.25} />}
                onClick={() => onDrill('newLeads')}
              />
              <ReportKpiCard
                label="Agendados"
                value={m.scheduled?.current ?? 0}
                trend={pctVar(m.scheduled?.current ?? 0, m.scheduled?.previous ?? 0)}
                trendLabel="vs. período anterior"
                tooltip={reportKpiTooltip('scheduled', { preset })}
                icon={<Calendar size={20} strokeWidth={2.25} />}
                onClick={() => onDrill('scheduled')}
              />
              <ReportKpiCard
                label={terms.reportsMetricConvertedShort}
                value={m.converted?.current ?? 0}
                trend={pctVar(m.converted?.current ?? 0, m.converted?.previous ?? 0)}
                trendLabel="vs. período anterior"
                tooltip={reportKpiTooltip('converted', { preset })}
                icon={<Users size={20} strokeWidth={2.25} />}
                onClick={() => onDrill('converted')}
              />
              <ReportKpiCard
                label="Taxa de conversão"
                value={`${m.conversionRate?.current ?? 0}%`}
                trend={pctVar(m.conversionRate?.current ?? 0, m.conversionRate?.previous ?? 0)}
                trendLabel="vs. período anterior"
                tooltip={reportKpiTooltip('conversionRate', { preset })}
                icon={<TrendingUp size={20} strokeWidth={2.25} />}
                {...kpiRagProps('conversionRate', Number(m.conversionRate?.current ?? 0), kpiGoals)}
              />
            </div>
          </ReportsPanelSection>
        ) : null}

        {funnelStages?.length > 0 && showContent ? (
          <ReportsPanelSection title="Funil de captação" subtitle="Leads → Matrícula" aria-label="Funil de captação">
          <div className="reports-funnel-row">
            {funnelStages.map((stage) => (
              <React.Fragment key={stage.key}>
                <ReportKpiCard
                  variant="funnel-stage"
                  label={stage.label}
                  value={stage.isPercent ? `${stage.current}%` : stage.current}
                  trend={stage.variation}
                  trendLabel="vs. período anterior"
                  sublabel={`${stage.relativePct}% da etapa anterior`}
                  funnelBarPct={stage.barPct}
                  funnelBarColor={stage.color}
                  onClick={stage.drillKey ? () => onDrill(stage.drillKey) : undefined}
                />
                {!stage.isLast ? (
                  <span className="reports-funnel-arrow" aria-hidden>
                    <ChevronRight size={16} strokeWidth={2.25} />
                  </span>
                ) : null}
              </React.Fragment>
            ))}
          </div>
          </ReportsPanelSection>
        ) : null}
      </div>

      {showContent && !loading ? (
        <>
          <hr className="reports-funil-zone-divider" aria-hidden />
          <section className="reports-funil-secondary" aria-labelledby="reports-funil-advanced-heading">
            <div className="reports-funil-zone-header">
              <p className="navi-eyebrow">Complemento</p>
              <h2 id="reports-funil-advanced-heading" className="reports-funil-zone-title">
                Análise avançada
              </h2>
              <p className="reports-funil-zone-hint">
                Gráficos de evolução, conversão e padrões de horário — use após ler os indicadores principais acima.
              </p>
            </div>

      {showChartSkeleton ? (
        <ReportsPanelSection
          className="reports-chart-skeleton reports-funil-panel__skeleton"
          aria-busy="true"
        />
      ) : null}

      {reportData?.chart ? (
        <ReportsPanelSection
          className="reports-panel-section--chart"
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
        >
          <p className="text-xs text-muted reports-funil-chart-note">
            Mesmo intervalo de <strong>{range.from} — {range.to}</strong>, respeitando o filtro de perfil quando
            ativo.
          </p>
          <div className="reports-chart-legend">
            <span className="reports-chart-legend-item">
              <i className="reports-chart-dot is-current" aria-hidden /> Este período
            </span>
            <span className="reports-chart-legend-item">
              <i className="reports-chart-dot is-previous" aria-hidden /> Período anterior
            </span>
          </div>
          <Suspense
            fallback={
              <div
                className={`reports-chart-skeleton ${chartSkeletonClass}`}
                aria-busy="true"
              />
            }
          >
            <ReportsFunilBarChart
              chartHeight={chartHeight}
              chartDataComparison={chartDataComparison}
              hasChartData={Boolean(reportData?.chart?.length)}
            />
          </Suspense>
        </ReportsPanelSection>
      ) : null}

        <ReportsPanelSection className="reports-panel-section--chart" title="Evolução da taxa de conversão">
          <Suspense
            fallback={
              <div
                className={`reports-chart-skeleton ${chartSkeletonClass}`}
                aria-busy="true"
              />
            }
          >
            <ReportsFunilConversionChart
              chartHeight={chartHeight}
              conversionChartData={conversionChartData}
              lastConversionPoint={lastConversionPoint}
            />
          </Suspense>
        </ReportsPanelSection>

          <div className="reports-aux-grid">
          <ReportsPanelSection
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
            >
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
          </ReportsPanelSection>
          <ReportsPanelSection title="Tempo médio no funil">
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
          </ReportsPanelSection>
          </div>
          </section>
        </>
      ) : null}

      {showContent ? <ReportsMethodologyNote /> : null}
    </ReportsPanelShell>
  );
}
