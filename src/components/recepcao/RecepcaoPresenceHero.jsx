import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DoorOpen, RefreshCcw, Users, UserX } from 'lucide-react';
import { useLeadStore } from '../../store/useLeadStore.js';
import { fetchAttendanceRetention } from '../../lib/attendanceRetentionApi.js';
import { friendlyError } from '../../lib/errorMessages.js';
import { isAttendanceConfigured } from '../../lib/attendance.js';
import DashboardHeroKpi from '../dashboard/DashboardHeroKpi.jsx';
import SkeletonCard from '../shared/SkeletonCard.jsx';

const HERO_ICON = { size: 18, strokeWidth: 2.25 };

function buildPresenceSummaryLine({ atRisk = 0, absent = 0, entriesToday = 0, integrationReady = false }) {
  const parts = [];
  if (integrationReady && entriesToday > 0) {
    parts.push(
      entriesToday === 1 ? '1 entrada registrada hoje.' : `${entriesToday} entradas registradas hoje.`
    );
  }
  if (atRisk > 0) {
    parts.push(
      atRisk === 1 ? '1 aluno em risco de frequência.' : `${atRisk} alunos em risco de frequência.`
    );
  } else if (absent > 0) {
    parts.push(absent === 1 ? '1 aluno sumido.' : `${absent} alunos sumidos.`);
  }
  if (!parts.length) {
    return 'Presença em dia. Acompanhe entradas e retenção nesta aba.';
  }
  return parts.join(' ');
}

/**
 * Hero da aba Presença — KPIs de catraca e retenção.
 *
 * @param {{
 *   integrationReady?: boolean;
 *   entriesToday?: number|null;
 *   onScrollToRetention?: () => void;
 *   onScrollToLive?: () => void;
 *   refreshSignal?: number;
 *   summaryOverride?: { at_risk?: number; absent?: number; active?: number }|null;
 *   skipFetch?: boolean;
 * }} props
 */
export default function RecepcaoPresenceHero({
  integrationReady = false,
  entriesToday = null,
  onScrollToRetention,
  onScrollToLive,
  refreshSignal = 0,
  summaryOverride,
  skipFetch = false,
}) {
  const academyId = useLeadStore((s) => s.academyId);
  const attendanceReady = isAttendanceConfigured();
  const [loading, setLoading] = useState(!skipFetch);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!academyId || !attendanceReady) {
      setSummary(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await fetchAttendanceRetention({
        academyId,
        includeAtRisk: false,
      });
      setSummary(data?.summary || null);
    } catch (e) {
      setError(friendlyError(e, 'load'));
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [academyId, attendanceReady]);

  useEffect(() => {
    if (skipFetch) return;
    void load();
  }, [load, refreshSignal, skipFetch]);

  useEffect(() => {
    if (!skipFetch) return;
    if (summaryOverride !== undefined) {
      setSummary(summaryOverride);
      setLoading(false);
      setError('');
    } else {
      setSummary(null);
      setLoading(true);
    }
  }, [skipFetch, summaryOverride]);

  const atRisk = Number(summary?.at_risk) || 0;
  const absent = Number(summary?.absent) || 0;
  const active = Number(summary?.active) || 0;
  const entries =
    entriesToday != null && Number.isFinite(Number(entriesToday)) ? Number(entriesToday) : null;

  const summaryLine = useMemo(
    () =>
      buildPresenceSummaryLine({
        atRisk,
        absent,
        entriesToday: entries ?? 0,
        integrationReady,
      }),
    [atRisk, absent, entries, integrationReady]
  );

  if (!attendanceReady && !integrationReady) return null;

  const stats = [
    integrationReady
      ? {
          key: 'entries',
          label: 'Entradas hoje',
          count: entries ?? '—',
          tone: (entries ?? 0) > 0 ? 'primary' : 'muted',
          icon: <DoorOpen {...HERO_ICON} aria-hidden />,
          footnote: entries != null ? 'Feed ao vivo' : 'Carregando…',
          onClick: onScrollToLive,
        }
      : null,
    {
      key: 'at_risk',
      label: 'Em risco',
      count: loading ? '—' : atRisk,
      tone: atRisk > 0 ? 'attention' : 'success',
      icon: <Users {...HERO_ICON} aria-hidden />,
      footnote: atRisk > 0 ? 'Priorize contato' : 'Ninguém em risco',
      onClick: onScrollToRetention,
    },
    {
      key: 'absent',
      label: 'Sumidos',
      count: loading ? '—' : absent,
      tone: absent > 0 ? 'default' : 'muted',
      icon: <UserX {...HERO_ICON} aria-hidden />,
      footnote: absent > 0 ? 'Sem check-in recente' : 'Sem sumidos',
      onClick: onScrollToRetention,
    },
    {
      key: 'active',
      label: 'Ativos',
      count: loading ? '—' : active,
      tone: 'muted',
      icon: <Users {...HERO_ICON} aria-hidden />,
      footnote: 'Com frequência ok',
      onClick: null,
    },
  ].filter(Boolean);

  return (
    <section className="dashboard-day-hero dashboard-day-hero--afternoon recepcao-presence-hero animate-in" aria-busy={loading}>
      <div className="dashboard-day-hero__briefing recepcao-presence-hero__briefing">
        <div className="dashboard-day-hero__main">
          <div className="dashboard-day-hero__head">
            <p className="dashboard-day-hero__date">Presença de hoje</p>
            <button
              type="button"
              className="dashboard-day-hero__refresh"
              onClick={() => void load()}
              disabled={loading}
              aria-label="Atualizar dados de presença"
            >
              <RefreshCcw size={16} className={loading ? 'spin-refresh' : ''} strokeWidth={2} aria-hidden />
            </button>
          </div>
          {!loading ? <p className="dashboard-day-hero__summary">{summaryLine}</p> : null}
          {error ? <p className="text-small text-muted recepcao-presence-hero__error">{error}</p> : null}
        </div>
      </div>
      <div className="dashboard-day-hero__metrics" aria-label="Indicadores de presença">
        <div className="dashboard-day-hero__stats" role="list">
          {loading ? (
            <SkeletonCard variant="hero-kpi" count={stats.length} className="dashboard-day-hero__skeletons" />
          ) : (
            stats.map((stat) => (
              <div key={stat.key} role="listitem" className="dashboard-day-hero__stat-cell">
                <DashboardHeroKpi
                  label={stat.label}
                  value={stat.count}
                  footnote={stat.footnote}
                  icon={stat.icon}
                  tone={stat.tone}
                  onClick={stat.onClick}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
