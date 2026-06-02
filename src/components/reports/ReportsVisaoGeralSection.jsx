import React from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, Users, Wallet, TrendingUp } from 'lucide-react';
import { formatBRL } from '../../lib/moneyBr';
import ReportKpiCard, { ReportKpiCardSkeleton } from './shared/ReportKpiCard.jsx';
import ReportSectionHeading from './shared/ReportSectionHeading.jsx';
import './reports.css';

const pctVar = (cur, prev) => {
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
};

function ReportTabFooterLink({ to, children }) {
  return (
    <p className="reports-section-footer-link mt-3 mb-0">
      <Link to={to} className="edit-link">
        {children}
      </Link>
    </p>
  );
}

/**
 * Dashboard da aba Visão geral: KPIs cross-domain + funil existente + taxas.
 */
export default function ReportsVisaoGeralSection({
  reportData,
  funnelStages,
  ratesCards,
  terms,
  hasFinance,
  canViewFinance,
  financeSummary,
  financeSummaryPrev,
  financeLoading,
  onFunnelDrill,
}) {
  const m = reportData?.metrics;
  const sm = reportData?.studentMetrics;

  const newLeadsCur = Number(m?.newLeads?.current || 0);
  const newLeadsPrev = Number(m?.newLeads?.previous || 0);
  const convertedCur = Number(m?.converted?.current || 0);
  const convertedPrev = Number(m?.converted?.previous || 0);
  const activeEnd =
    sm != null
      ? Number(
          sm.activeAtEnd ??
            Math.max(
              0,
              (Number(sm.activeAtStart) || 0) +
                (Number(sm.newStudents) || 0) -
                (Number(sm.deactivations) || 0)
            )
        )
      : null;
  const activeEndPrev = sm?.previous?.activeAtEnd != null ? Number(sm.previous.activeAtEnd) : null;

  const showRevenueKpi = hasFinance && canViewFinance;
  const showActiveKpi = sm != null && activeEnd != null;
  const receivedCur = financeSummary?.received ?? financeSummary?.totalReceived;
  const receivedPrev = financeSummaryPrev?.received ?? financeSummaryPrev?.totalReceived;

  return (
    <div className="reports-visao-geral mt-4 animate-in">
      <div className="reports-kpi-grid reports-kpi-grid--overview">
        <ReportKpiCard
          label="Leads no período"
          value={newLeadsCur}
          trend={pctVar(newLeadsCur, newLeadsPrev)}
          trendLabel="vs. período anterior"
          icon={<UserPlus size={20} strokeWidth={2.25} />}
          onClick={() => onFunnelDrill?.('newLeads')}
        />
        <ReportKpiCard
          label="Matrículas no período"
          value={convertedCur}
          trend={pctVar(convertedCur, convertedPrev)}
          trendLabel="vs. período anterior"
          icon={<Users size={20} strokeWidth={2.25} />}
          highlight="success"
          onClick={() => onFunnelDrill?.('converted')}
        />
        {showRevenueKpi && financeLoading ? (
          <ReportKpiCardSkeleton />
        ) : null}
        {showRevenueKpi && !financeLoading && financeSummary ? (
          <ReportKpiCard
            label="Receita liquidada"
            value={formatBRL(Number(receivedCur) || 0)}
            trend={
              receivedPrev != null
                ? pctVar(Number(receivedCur) || 0, Number(receivedPrev) || 0)
                : null
            }
            trendLabel="vs. período anterior"
            icon={<Wallet size={20} strokeWidth={2.25} />}
            highlight="accent"
          />
        ) : null}
        {showActiveKpi ? (
          <ReportKpiCard
            label="Alunos ativos"
            value={activeEnd}
            trend={activeEndPrev != null ? pctVar(activeEnd, activeEndPrev) : null}
            trendLabel="vs. fim do período anterior"
            icon={<TrendingUp size={20} strokeWidth={2.25} />}
          />
        ) : null}
      </div>

      <div className="reports-funnel-card mt-4">
        <ReportSectionHeading title="Funil de captação" subtitle="Leads → Matrícula" />
        <div className="reports-funnel-row">
          {funnelStages.map((stage) => (
            <React.Fragment key={stage.key}>
              <button
                type="button"
                className={`reports-funnel-stage${stage.drillKey ? ' is-clickable' : ''}`}
                onClick={() => stage.drillKey && onFunnelDrill?.(stage.drillKey)}
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
        <ReportTabFooterLink to="/reports?tab=funil">Ver relatório completo →</ReportTabFooterLink>
      </div>

      <div className="reports-rates-block mt-4">
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
        <div className="reports-section-footer-links-row">
          <ReportTabFooterLink to="/reports?tab=funil">Funil →</ReportTabFooterLink>
          <ReportTabFooterLink to="/reports?tab=alunos">Alunos →</ReportTabFooterLink>
          {hasFinance ? (
            <ReportTabFooterLink to="/reports?tab=financeiro">Financeiro →</ReportTabFooterLink>
          ) : null}
        </div>
      </div>
    </div>
  );
}
