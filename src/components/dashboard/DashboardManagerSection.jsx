import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart2,
  Check,
  CheckSquare,
  CircleDollarSign,
  DollarSign,
  MessageCircle,
  Users,
} from 'lucide-react';
import { formatBRL } from '../../lib/moneyBr.js';
import { monthPeriodBounds } from '../../lib/financeiroOverview.js';
import { fetchReportsFinanceLightResult } from '../../lib/reportsLightApi.js';
import { getFinanceRegime } from '../../lib/financeCompetence.js';
import {
  conversionRatePercent,
  countActiveStudents,
  countEnrollmentsInMonth,
  countLeadsCreatedInMonth,
  countNeedHumanLeads,
  countOverdueStudents,
  countOverdueTasks,
  countSlaCriticalFromStages,
  currentMonthRange,
} from '../../lib/dashboardManagerMetrics.js';
import { buildReceivablesPath, RECEIVABLES_SECTIONS } from '../../lib/financeiroReceivablesSections.js';

const MANAGER_FETCH_STALE_MS = 5 * 60 * 1000;

function ManagerKpiCard({ title, value, subtitle, onClick, loading }) {
  return (
    <button
      type="button"
      className="agenda-kpi-card agenda-kpi-card--clickable dashboard-manager-kpi"
      onClick={onClick}
      disabled={loading}
    >
      <div className="agenda-kpi-card-stack">
        <div className="agenda-kpi-label">
          <span>{title}</span>
        </div>
        {loading ? (
          <div className="agenda-kpi-value dashboard-manager-kpi-skeleton" aria-hidden />
        ) : (
          <div className="agenda-kpi-value">{value}</div>
        )}
        {subtitle && !loading ? <p className="agenda-kpi-context agenda-kpi-context--info">{subtitle}</p> : null}
      </div>
    </button>
  );
}

function ManagerAlertRow({ icon, tone, text, onClick }) {
  const AlertIcon = icon;
  return (
    <button type="button" className={`dashboard-manager-alert dashboard-manager-alert--${tone}`} onClick={onClick}>
      <AlertIcon size={18} strokeWidth={2} aria-hidden />
      <span className="dashboard-manager-alert__text">{text}</span>
      <span className="dashboard-manager-alert__cta" aria-hidden>
        →
      </span>
    </button>
  );
}

/**
 * Visão executiva do Dashboard (owner/admin). Não altera o bloco operacional abaixo.
 */
export default function DashboardManagerSection({
  isOwner,
  leads,
  students,
  tasks,
  pipelineStages,
  modules,
  academyId,
  leadsLabel = 'Leads',
}) {
  const navigate = useNavigate();
  const monthRange = useMemo(() => currentMonthRange(), []);
  const showFinanceKpi = modules?.finance === true && isOwner;
  const financeCacheRef = useRef({ academyId: '', at: 0, received: null });
  const fetchKey = showFinanceKpi && academyId ? `${academyId}:${monthRange.ym}` : '';
  const [financeState, setFinanceState] = useState({ key: '', received: null, loading: false });
  const financeReceived = financeState.key === fetchKey ? financeState.received : null;
  const financeLoading = Boolean(fetchKey) && (financeState.key !== fetchKey || financeState.loading);

  const metrics = useMemo(() => {
    const leadsInMonth = countLeadsCreatedInMonth(leads, monthRange);
    const enrolledInMonth = countEnrollmentsInMonth(leads, students, monthRange);
    return {
      leadsInMonth,
      conversionPct: conversionRatePercent(leadsInMonth, enrolledInMonth),
      activeStudents: countActiveStudents(students),
      needHuman: countNeedHumanLeads(leads),
      slaCritical: countSlaCriticalFromStages(leads, pipelineStages),
      overdueStudents: countOverdueStudents(students),
      overdueTasks: countOverdueTasks(tasks),
    };
  }, [leads, students, tasks, pipelineStages, monthRange]);

  useEffect(() => {
    if (!fetchKey) return undefined;

    let cancelled = false;

    const cache = financeCacheRef.current;
    if (
      cache.academyId === fetchKey &&
      cache.at &&
      Date.now() - cache.at < MANAGER_FETCH_STALE_MS
    ) {
      void Promise.resolve().then(() => {
        if (!cancelled) setFinanceState({ key: fetchKey, received: cache.received, loading: false });
      });
      return () => {
        cancelled = true;
      };
    }

    const { from, to } = monthPeriodBounds(monthRange.ym);
    const regime = getFinanceRegime(academyId);

    void fetchReportsFinanceLightResult({ academyId, from, to, regime }).then((result) => {
      if (cancelled) return;
      if (result.ok && result.data) {
        const received = Number(result.data.received ?? result.data.totalReceived ?? 0) || 0;
        financeCacheRef.current = { academyId: fetchKey, at: Date.now(), received };
        setFinanceState({ key: fetchKey, received, loading: false });
      } else {
        setFinanceState({ key: fetchKey, received: null, loading: false });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [fetchKey, academyId, monthRange.ym]);

  const alerts = useMemo(() => {
    const rows = [];
    if (metrics.needHuman > 0) {
      rows.push({
        key: 'inbox',
        tone: 'warning',
        icon: MessageCircle,
        text: `${metrics.needHuman} ${metrics.needHuman === 1 ? 'lead aguardando' : 'leads aguardando'} resposta humana`,
        onClick: () => navigate('/inbox?filter=pending'),
      });
    }
    if (metrics.slaCritical > 0) {
      rows.push({
        key: 'sla',
        tone: 'danger',
        icon: AlertTriangle,
        text: `${metrics.slaCritical} ${metrics.slaCritical === 1 ? 'lead com' : 'leads com'} SLA crítico no funil`,
        onClick: () => navigate('/pipeline'),
      });
    }
    if (showFinanceKpi && metrics.overdueStudents > 0) {
      rows.push({
        key: 'overdue',
        tone: 'danger',
        icon: CircleDollarSign,
        text: `${metrics.overdueStudents} ${metrics.overdueStudents === 1 ? 'aluno com' : 'alunos com'} mensalidade em atraso`,
        onClick: () =>
          navigate(
            buildReceivablesPath({
              section: RECEIVABLES_SECTIONS.COBRANCA,
            })
          ),
      });
    }
    if (metrics.overdueTasks > 0) {
      rows.push({
        key: 'tasks',
        tone: 'warning',
        icon: CheckSquare,
        text: `${metrics.overdueTasks} ${metrics.overdueTasks === 1 ? 'tarefa vencida' : 'tarefas vencidas'}`,
        onClick: () => navigate('/tarefas?status=vencidas'),
      });
    }
    return rows.slice(0, 4);
  }, [metrics, navigate, showFinanceKpi]);

  const kpiCards = useMemo(() => {
    const cards = [
      {
        key: 'leads',
        title: `${leadsLabel} no mês`,
        value: metrics.leadsInMonth,
        subtitle: 'criados neste mês',
        onClick: () => navigate('/pipeline', { state: { fresh: true } }),
      },
      {
        key: 'conversion',
        title: 'Taxa de conversão',
        value: `${metrics.conversionPct}%`,
        subtitle: 'matrículas / leads do mês',
        onClick: () => navigate('/reports?tab=funil'),
      },
    ];
    if (showFinanceKpi) {
      cards.push({
        key: 'revenue',
        title: 'Receita do mês',
        value: financeReceived != null ? formatBRL(financeReceived) : '—',
        subtitle: 'caixa liquidado',
        loading: financeLoading,
        onClick: () => navigate('/financeiro?tab=visao-geral'),
        hide: !financeLoading && financeReceived == null,
      });
    }
    cards.push({
      key: 'students',
      title: 'Alunos ativos',
      value: metrics.activeStudents,
      subtitle: 'cadastro ativo',
      onClick: () => navigate('/alunos'),
    });
    return cards.filter((c) => !c.hide);
  }, [
    metrics,
    leadsLabel,
    navigate,
    showFinanceKpi,
    financeReceived,
    financeLoading,
  ]);

  return (
    <section className="dashboard-manager-section reception-section animate-in" style={{ animationDelay: '0.02s' }}>
      <div className="agenda-kpi-grid dashboard-manager-kpi-grid" aria-busy={financeLoading}>
        {kpiCards.map((card) => (
          <ManagerKpiCard
            key={card.key}
            title={card.title}
            value={card.value}
            subtitle={card.subtitle}
            loading={Boolean(card.loading)}
            onClick={card.onClick}
          />
        ))}
      </div>

      <div className="dashboard-manager-alerts">
        <h4 className="dashboard-manager-alerts__title">Alertas</h4>
        {alerts.length === 0 ? (
          <div className="dashboard-manager-alerts-ok" role="status">
            <Check size={20} strokeWidth={2.5} className="dashboard-manager-alerts-ok__icon" aria-hidden />
            <span>Tudo em dia!</span>
          </div>
        ) : (
          <div className="dashboard-manager-alerts-list">
            {alerts.map((a) => (
              <ManagerAlertRow key={a.key} icon={a.icon} tone={a.tone} text={a.text} onClick={a.onClick} />
            ))}
          </div>
        )}
      </div>

      <div className="dashboard-manager-quicklinks">
        <button type="button" className="btn-secondary dashboard-manager-quicklink" onClick={() => navigate('/reports')}>
          <BarChart2 size={16} aria-hidden /> Relatórios
        </button>
        <button type="button" className="btn-secondary dashboard-manager-quicklink" onClick={() => navigate('/alunos')}>
          <Users size={16} aria-hidden /> Alunos
        </button>
        {modules?.finance === true ? (
          <button
            type="button"
            className="btn-secondary dashboard-manager-quicklink"
            onClick={() => navigate('/financeiro?tab=visao-geral')}
          >
            <DollarSign size={16} aria-hidden /> Financeiro
          </button>
        ) : null}
      </div>
    </section>
  );
}
