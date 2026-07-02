import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  Loader2,
  RefreshCw,
  UserCheck,
  UserX,
} from 'lucide-react';
import { fetchAttendanceFrequency } from '../../lib/attendanceFrequencyApi.js';
import { friendlyError } from '../../lib/errorMessages.js';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import ReportDataTable from './shared/ReportDataTable.jsx';
import ReportsPanelShell from './shared/ReportsPanelShell.jsx';
import ReportsPanelSection from './shared/ReportsPanelSection.jsx';
import ReportKpiCard from './shared/ReportKpiCard.jsx';
import { attendanceRetentionKpiTooltips } from '../../lib/attendanceRetentionKpiTooltips.js';
import { buildRecepcaoRetencaoPath } from '../../lib/recepcaoHubTabs.js';
import { useTerms } from '../../lib/terminology.js';
import './reports.css';

const URL_TURMA = 'freq_turma';
const URL_BELT = 'freq_belt';

function patchFreqFilters(prev, { turma, belt }) {
  const next = new URLSearchParams(prev);
  const t = String(turma ?? '').trim();
  const b = String(belt ?? '').trim();
  if (t) next.set(URL_TURMA, t);
  else next.delete(URL_TURMA);
  if (b) next.set(URL_BELT, b);
  else next.delete(URL_BELT);
  return next;
}

function buildHeatmapSummary(heatmap) {
  const weeks = heatmap?.weeks || [];
  const labels = heatmap?.dowLabels || [];
  const total = weeks.reduce((acc, w) => acc + (Number(w.total) || 0), 0);
  if (!weeks.length || total === 0) {
    return { total: 0, weekCount: 0, peakDow: null };
  }
  const dowSums = labels.map((_, i) =>
    weeks.reduce((acc, w) => acc + (Number(w.days?.[i]) || 0), 0)
  );
  const peakValue = Math.max(...dowSums, 0);
  const peakIdx = dowSums.indexOf(peakValue);
  return {
    total,
    weekCount: weeks.length,
    peakDow: labels[peakIdx] || null,
  };
}

function HeatmapGrid({ heatmap }) {
  const weeks = heatmap?.weeks || [];
  const labels = heatmap?.dowLabels || [];
  const summary = buildHeatmapSummary(heatmap);
  const summaryId = 'reports-freq-heat-summary';

  if (!weeks.length || summary.total === 0) {
    return (
      <EmptyState
        variant="compact"
        tone="dashed"
        title="Nenhum check-in nas últimas 12 semanas"
        description="Quando houver presenças registradas, o mapa de calor aparece aqui."
      />
    );
  }

  const max = Math.max(1, ...weeks.flatMap((w) => w.days || []));
  const intensity = (n) => {
    if (!n) return 'reports-freq-heat__cell--0';
    const ratio = n / max;
    if (ratio >= 0.75) return 'reports-freq-heat__cell--4';
    if (ratio >= 0.5) return 'reports-freq-heat__cell--3';
    if (ratio >= 0.25) return 'reports-freq-heat__cell--2';
    return 'reports-freq-heat__cell--1';
  };

  const summaryText = summary.peakDow
    ? `Total ${summary.weekCount} semanas: ${summary.total} check-ins; pico ${summary.peakDow}.`
    : `Total ${summary.weekCount} semanas: ${summary.total} check-ins.`;

  return (
    <div className="reports-freq-heat-wrap">
      <div className="reports-freq-heat-scroll">
        <div
          className="reports-freq-heat"
          role="img"
          aria-label="Heatmap de check-ins por semana"
          aria-describedby={summaryId}
        >
          <div className="reports-freq-heat__head">
            <span className="reports-freq-heat__corner" aria-hidden />
            {labels.map((l) => (
              <span key={l} className="reports-freq-heat__dow">
                {l}
              </span>
            ))}
          </div>
          {weeks.map((w) => (
            <div key={w.weekStart} className="reports-freq-heat__row">
              <span className="reports-freq-heat__week">{w.weekLabel}</span>
              {(w.days || []).map((n, i) => (
                <span
                  key={`${w.weekStart}-${i}`}
                  className={`reports-freq-heat__cell ${intensity(n)}`}
                  title={`${labels[i]}: ${n} check-in(s)`}
                >
                  {n > 0 ? n : ''}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="reports-freq-heat-footer">
        <div className="reports-freq-heat-legend" aria-hidden="true">
          <span className="reports-freq-heat-legend__label">Baixa</span>
          <span className="reports-freq-heat__cell reports-freq-heat__cell--1" />
          <span className="reports-freq-heat__cell reports-freq-heat__cell--2" />
          <span className="reports-freq-heat__cell reports-freq-heat__cell--3" />
          <span className="reports-freq-heat__cell reports-freq-heat__cell--4" />
          <span className="reports-freq-heat-legend__label">Alta</span>
        </div>
        <p id={summaryId} className="reports-freq-heat-summary">
          {summaryText}
        </p>
      </div>
    </div>
  );
}

/**
 * Relatórios → Frequência: KPIs de retenção, heatmap, ranking e comparativo mensal.
 */
export default function ReportsFrequenciaPanel({
  academyId,
  rangeFrom,
  rangeTo,
  periodLabel = '',
}) {
  const terms = useTerms();
  const [searchParams, setSearchParams] = useSearchParams();
  const turma = String(searchParams.get(URL_TURMA) || '').trim();
  const belt = String(searchParams.get(URL_BELT) || '').trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const setTurmaFilter = useCallback(
    (value) => {
      setSearchParams((prev) => patchFreqFilters(prev, { turma: value, belt }), { replace: true });
    },
    [belt, setSearchParams]
  );

  const setBeltFilter = useCallback(
    (value) => {
      setSearchParams((prev) => patchFreqFilters(prev, { turma, belt: value }), { replace: true });
    },
    [turma, setSearchParams]
  );

  const load = useCallback(async () => {
    if (!academyId) return;
    setLoading(true);
    setError('');
    try {
      const body = await fetchAttendanceFrequency({
        academyId,
        turma: turma || undefined,
        belt: belt || undefined,
        from: rangeFrom,
        to: rangeTo,
      });
      setData(body);
    } catch (e) {
      setError(friendlyError(e, 'load'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [academyId, turma, belt, rangeFrom, rangeTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = data?.summary || {};
  const month = data?.monthComparison || {};
  const filters = data?.filters || {};

  const rankingColumns = useMemo(
    () => [
      {
        key: 'name',
        label: 'Aluno',
        render: (r) =>
          r.studentId ? (
            <Link to={`/student/${r.studentId}`} className="reports-inline-link">
              {r.name || '—'}
            </Link>
          ) : (
            r.name || '—'
          ),
      },
      { key: 'turma', label: 'Turma', render: (r) => r.turma || '—' },
      { key: 'belt', label: terms.belt, render: (r) => r.belt || '—' },
      {
        key: 'checkins',
        label: 'Check-ins',
        align: 'right',
        render: (r) => r.checkins,
      },
    ],
    [terms.belt]
  );

  const turmaOptions = filters.turmas || [];
  const beltOptions = filters.belts || [];

  return (
    <ReportsPanelShell title="Frequência" subtitle={periodLabel ? `Período: ${periodLabel}` : undefined}>
      <div className="reports-freq-toolbar navi-toolbar">
        <label className="reports-freq-filter">
          <span className="reports-freq-filter__label">Turma</span>
          <select
            className="form-input navi-control--toolbar reports-freq-filter__select"
            value={turma}
            onChange={(e) => setTurmaFilter(e.target.value)}
          >
            <option value="">Todas</option>
            {turma && !turmaOptions.includes(turma) ? (
              <option value={turma}>{turma}</option>
            ) : null}
            {turmaOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="reports-freq-filter">
          <span className="reports-freq-filter__label">{terms.belt}</span>
          <select
            className="form-input navi-control--toolbar reports-freq-filter__select"
            value={belt}
            onChange={(e) => setBeltFilter(e.target.value)}
          >
            <option value="">Todas</option>
            {belt && !beltOptions.includes(belt) ? (
              <option value={belt}>{belt}</option>
            ) : null}
            {beltOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn-outline navi-btn--toolbar reports-freq-refresh"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
          Atualizar frequência
        </button>
      </div>

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      {loading && !data ? (
        <div className="reports-freq-loading">
          <Loader2 size={24} className="spin" />
        </div>
      ) : null}

      {data ? (
        <>
          <ReportsPanelSection
            title="Retenção por frequência"
            subtitle="Panorama do período selecionado"
          >
            <div className="reports-freq-kpi-grid">
              <ReportKpiCard
                label="Ativos"
                value={summary.active ?? 0}
                highlight="success"
                icon={<UserCheck size={20} strokeWidth={2.25} />}
                tooltip={attendanceRetentionKpiTooltips().active}
              />
              <ReportKpiCard
                label="Em risco"
                value={summary.at_risk ?? 0}
                highlight="warning"
                icon={<AlertTriangle size={20} strokeWidth={2.25} />}
                tooltip={attendanceRetentionKpiTooltips().at_risk}
              />
              <ReportKpiCard
                label="Sumidos"
                value={summary.absent ?? 0}
                highlight="danger"
                icon={<UserX size={20} strokeWidth={2.25} />}
                tooltip={attendanceRetentionKpiTooltips().absent}
              />
              <ReportKpiCard
                label="Check-ins no período"
                value={data.periodCheckins ?? 0}
                sublabel={periodLabel || undefined}
                icon={<Activity size={20} strokeWidth={2.25} />}
              />
              <ReportKpiCard
                label="Este mês"
                value={month.thisMonth ?? 0}
                trend={typeof month.deltaPct === 'number' ? month.deltaPct : null}
                trendLabel="vs mês anterior"
                icon={<CalendarDays size={20} strokeWidth={2.25} />}
              />
            </div>
            <div className="reports-freq-reception-cta">
              <Link to={buildRecepcaoRetencaoPath()} className="btn-outline reports-freq-reception-cta__link">
                Abrir fila na recepção
              </Link>
            </div>
          </ReportsPanelSection>

          <ReportsPanelSection
            title="Heatmap — últimas 12 semanas"
            subtitle="Intensidade de check-ins por dia da semana"
          >
            <HeatmapGrid heatmap={data.heatmap} />
          </ReportsPanelSection>

          <ReportsPanelSection title="Ranking no período">
            <ReportDataTable
              columns={rankingColumns}
              rows={data.ranking || []}
              emptyMessage="Nenhum check-in no período selecionado."
            />
          </ReportsPanelSection>
        </>
      ) : null}
    </ReportsPanelShell>
  );
}
