import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  UserPlus,
  Users,
  Wallet,
  GraduationCap,
} from 'lucide-react';
import ReportKpiCard, { ReportKpiCardSkeleton } from './shared/ReportKpiCard.jsx';
import ReportSectionHeading from './shared/ReportSectionHeading.jsx';
import { fetchReportsFinanceLight } from '../../lib/reportsLightApi.js';
import { formatBRL } from '../../lib/moneyBr.js';
import { getFinanceRegime } from '../../lib/financeCompetence.js';
import './reports.css';

const pctVar = (cur, prev) => {
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
};

function computePrevRange(fromYmd, toYmd, preset) {
  const parseYMD = (s) => {
    const [Y, M, D] = s.split('-').map(Number);
    return new Date(Y, (M || 1) - 1, D || 1);
  };
  const ymd = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

  const fromDay = parseYMD(fromYmd);
  const toDay = parseYMD(toYmd);
  const toDEndLocal = new Date(toDay);
  toDEndLocal.setHours(23, 59, 59, 999);

  const prevFromDLocal = (() => {
    if (preset === 'today') {
      const d = new Date(fromDay);
      d.setDate(d.getDate() - 1);
      return d;
    }
    if (preset === 'week') {
      const d = new Date(fromDay);
      d.setDate(d.getDate() - 7);
      return d;
    }
    if (preset === 'month' || preset === 'last_month') {
      const d = new Date(fromDay.getFullYear(), fromDay.getMonth() - 1, 1);
      return startOfMonth(d);
    }
    const span = Math.max(1, Math.ceil((toDEndLocal - fromDay) / 86400000));
    const d = new Date(fromDay);
    d.setDate(d.getDate() - span);
    return d;
  })();

  const prevToDLocal = (() => {
    if (preset === 'today') {
      const d = new Date(toDEndLocal);
      d.setDate(d.getDate() - 1);
      d.setHours(23, 59, 59, 999);
      return d;
    }
    if (preset === 'week') {
      const d = new Date(toDEndLocal);
      d.setDate(d.getDate() - 7);
      return d;
    }
    if (preset === 'month' || preset === 'last_month') {
      return endOfMonth(new Date(prevFromDLocal));
    }
    const span = Math.max(1, Math.ceil((toDEndLocal - fromDay) / 86400000));
    const d = new Date(toDEndLocal);
    d.setDate(d.getDate() - span);
    return d;
  })();

  return { from: ymd(prevFromDLocal), to: ymd(prevToDLocal) };
}

export default function ReportsVisaoGeralPanel({
  reportData,
  funnelStages,
  ratesCards,
  setDrillKey,
  hasFinance,
  canViewFinance,
  academyId,
  range,
  preset,
}) {
  const navigate = useNavigate();
  const [financeCurrent, setFinanceCurrent] = useState(null);
  const [financePrev, setFinancePrev] = useState(null);
  const [financeLoading, setFinanceLoading] = useState(false);

  const showFinanceKpi = hasFinance && canViewFinance;

  useEffect(() => {
    if (!showFinanceKpi || !academyId || !range?.from || !range?.to) {
      setFinanceCurrent(null);
      setFinancePrev(null);
      return undefined;
    }

    let active = true;
    const regime = getFinanceRegime(academyId);
    const prevRange = computePrevRange(range.from, range.to, preset);

    const load = async () => {
      setFinanceLoading(true);
      try {
        const [cur, prev] = await Promise.all([
          fetchReportsFinanceLight({ academyId, from: range.from, to: range.to, regime }),
          fetchReportsFinanceLight({
            academyId,
            from: prevRange.from,
            to: prevRange.to,
            regime,
          }),
        ]);
        if (!active) return;
        if (cur?.permissionDenied) {
          setFinanceCurrent(null);
          setFinancePrev(null);
          return;
        }
        setFinanceCurrent(cur);
        setFinancePrev(prev?.permissionDenied ? null : prev);
      } catch {
        if (active) {
          setFinanceCurrent(null);
          setFinancePrev(null);
        }
      } finally {
        if (active) setFinanceLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [showFinanceKpi, academyId, range?.from, range?.to, preset]);

  const m = reportData?.metrics;
  const sm = reportData?.studentMetrics;

  const leadsCurrent = Number(m?.newLeads?.current || 0);
  const leadsPrev = Number(m?.newLeads?.previous || 0);
  const enrolledCurrent = Number(m?.converted?.current || 0);
  const enrolledPrev = Number(m?.converted?.previous || 0);

  const activeAtEnd = useMemo(() => {
    if (!sm) return null;
    const start = Number(sm.activeAtStart) || 0;
    const novo = Number(sm.newStudents) || 0;
    const off = Number(sm.deactivations) || 0;
    return Math.max(0, start + novo - off);
  }, [sm]);

  const revenueCurrent = Number(financeCurrent?.received ?? financeCurrent?.totalReceived ?? 0);
  const revenuePrev = Number(financePrev?.received ?? financePrev?.totalReceived ?? 0);

  const kpiCards = useMemo(() => {
    const cards = [
      {
        key: 'leads',
        label: 'Leads no período',
        value: String(leadsCurrent),
        trend: pctVar(leadsCurrent, leadsPrev),
        icon: <UserPlus size={20} strokeWidth={2.25} />,
        href: '/reports?tab=funil',
      },
      {
        key: 'enrolled',
        label: 'Matrículas no período',
        value: String(enrolledCurrent),
        trend: pctVar(enrolledCurrent, enrolledPrev),
        icon: <Users size={20} strokeWidth={2.25} />,
        href: '/reports?tab=funil',
      },
    ];

    if (showFinanceKpi) {
      cards.push({
        key: 'revenue',
        label: 'Receita liquidada',
        value: financeLoading ? null : formatBRL(revenueCurrent),
        trend: financeLoading || financeCurrent == null ? null : pctVar(revenueCurrent, revenuePrev),
        icon: <Wallet size={20} strokeWidth={2.25} />,
        href: '/reports?tab=financeiro',
        loading: financeLoading,
        hidden: !financeLoading && financeCurrent == null,
      });
    }

    if (sm && activeAtEnd != null) {
      cards.push({
        key: 'students',
        label: 'Alunos ativos',
        value: String(activeAtEnd),
        trend: null,
        icon: <GraduationCap size={20} strokeWidth={2.25} />,
        href: '/reports?tab=alunos',
        trendLabel: 'No fim do período',
      });
    }

    return cards.filter((c) => !c.hidden);
  }, [
    leadsCurrent,
    leadsPrev,
    enrolledCurrent,
    enrolledPrev,
    showFinanceKpi,
    financeLoading,
    financeCurrent,
    revenueCurrent,
    revenuePrev,
    sm,
    activeAtEnd,
  ]);

  if (!m) return null;

  return (
    <div className="reports-visao-geral mt-4 animate-in">
      <div className="reports-kpi-grid reports-kpi-grid--summary">
        {kpiCards.map((card) =>
          card.loading ? (
            <ReportKpiCardSkeleton key={card.key} />
          ) : (
            <ReportKpiCard
              key={card.key}
              label={card.label}
              value={card.value}
              trend={card.trend}
              trendLabel={card.trendLabel || 'vs. período anterior'}
              icon={card.icon}
              onClick={() => navigate(card.href)}
            />
          )
        )}
      </div>

      <section className="reports-funnel-card mt-4">
        <ReportSectionHeading title="Funil de captação" subtitle="Leads → Matrícula" />
        <div className="reports-funnel-row">
          {funnelStages.map((stage) => (
            <React.Fragment key={stage.key}>
              <button
                type="button"
                className={`reports-funnel-stage${stage.drillKey ? ' is-clickable' : ''}`}
                onClick={() => stage.drillKey && setDrillKey(stage.drillKey)}
                disabled={!stage.drillKey}
              >
                <div className="reports-funnel-track">
                  <span
                    className="reports-funnel-fill"
                    style={{ width: `${stage.barPct}%`, background: stage.color }}
                  />
                </div>
                <div className="reports-funnel-value">{stage.isPercent ? `${stage.current}%` : stage.current}</div>
                <div className="reports-funnel-label">{stage.label}</div>
                <div className={`reports-funnel-variation ${stage.variation >= 0 ? 'is-up' : 'is-down'}`}>
                  {stage.variation >= 0 ? '+' : ''}
                  {stage.variation}% vs período anterior
                </div>
                <span className="reports-funnel-relative">{stage.relativePct}% da etapa anterior</span>
              </button>
              {!stage.isLast ? (
                <span className="reports-funnel-arrow" aria-hidden>
                  <span className="ti ti-chevron-right" />
                </span>
              ) : null}
            </React.Fragment>
          ))}
        </div>
      </section>

      <section className="mt-4">
        <div className="reports-rates-grid">
          {ratesCards.map((item) => (
            <div key={item.key} className="reports-rate-card">
              <span className={item.icon} aria-hidden style={{ color: item.accent }} />
              <div className="reports-rate-value">{item.pct}%</div>
              <div className="reports-rate-label">{item.label}</div>
              <div className="reports-rate-insight">{item.insight}</div>
            </div>
          ))}
        </div>
        <nav className="reports-visao-geral-links" aria-label="Relatórios relacionados">
          <Link to="/reports?tab=funil" className="reports-visao-geral-link">
            Ver relatório completo — Funil →
          </Link>
          <Link to="/reports?tab=alunos" className="reports-visao-geral-link">
            Ver relatório completo — Alunos →
          </Link>
          {hasFinance ? (
            <Link to="/reports?tab=financeiro" className="reports-visao-geral-link">
              Ver relatório completo — Financeiro →
            </Link>
          ) : null}
        </nav>
      </section>
    </div>
  );
}
