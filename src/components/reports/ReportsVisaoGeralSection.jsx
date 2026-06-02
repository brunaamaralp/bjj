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

function ReportInlineLink({ to, children, className = '' }) {
  return (
    <Link to={to} className={['reports-inline-link', className].filter(Boolean).join(' ')}>
      {children}
    </Link>
  );
}

function ReportKpiCell({ footerTo, footerLabel = 'Ver detalhes →', children }) {
  return (
    <div className="reports-kpi-cell">
      {children}
      {footerTo ? (
        <ReportInlineLink to={footerTo} className="reports-kpi-cell__footer">
          {footerLabel}
        </ReportInlineLink>
      ) : (
        <span className="reports-kpi-cell__footer-spacer" aria-hidden />
      )}
    </div>
  );
}

/**
 * Dashboard da aba Visão geral: KPIs cross-domain + funil existente + taxas.
 */
export default function ReportsVisaoGeralSection({
  reportData,
  funnelStages,
  ratesCards,
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
        <ReportKpiCell footerTo="/reports?tab=funil">
          <ReportKpiCard
            label="Leads no período"
            value={newLeadsCur}
            trend={pctVar(newLeadsCur, newLeadsPrev)}
            trendLabel="vs. período anterior"
            icon={<UserPlus size={20} strokeWidth={2.25} />}
            showCta={false}
            onClick={() => onFunnelDrill?.('newLeads')}
          />
        </ReportKpiCell>
        <ReportKpiCell footerTo="/reports?tab=funil">
          <ReportKpiCard
            label="Matrículas no período"
            value={convertedCur}
            trend={pctVar(convertedCur, convertedPrev)}
            trendLabel="vs. período anterior"
            icon={<Users size={20} strokeWidth={2.25} />}
            highlight="success"
            showCta={false}
            onClick={() => onFunnelDrill?.('converted')}
          />
        </ReportKpiCell>
        {showRevenueKpi && financeLoading ? (
          <ReportKpiCell>
            <ReportKpiCardSkeleton />
          </ReportKpiCell>
        ) : null}
        {showRevenueKpi && !financeLoading && financeSummary ? (
          <ReportKpiCell footerTo="/reports?tab=financeiro">
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
              showCta={false}
            />
          </ReportKpiCell>
        ) : null}
        {showActiveKpi ? (
          <ReportKpiCell footerTo="/reports?tab=alunos">
            <ReportKpiCard
              label="Alunos ativos"
              value={activeEnd}
              trend={activeEndPrev != null ? pctVar(activeEnd, activeEndPrev) : null}
              trendLabel="vs. fim do período anterior"
              icon={<TrendingUp size={20} strokeWidth={2.25} />}
              showCta={false}
            />
          </ReportKpiCell>
        ) : null}
      </div>

      <div className="reports-visao-geral__section-divider" role="presentation" />

      <section className="reports-funnel-stack" aria-label="Funil de captação e taxas">
        <div className="reports-funnel-card">
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
          <p className="reports-section-footer-link mb-0">
            <ReportInlineLink to="/reports?tab=funil">Ver relatório completo →</ReportInlineLink>
          </p>
        </div>

        <div className="reports-funnel-card reports-funnel-card--rates">
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
          <nav className="reports-section-footer-links-row" aria-label="Relatórios relacionados">
            <ReportInlineLink to="/reports?tab=funil">Funil →</ReportInlineLink>
            <ReportInlineLink to="/reports?tab=alunos">Alunos →</ReportInlineLink>
            {hasFinance ? <ReportInlineLink to="/reports?tab=financeiro">Financeiro →</ReportInlineLink> : null}
          </nav>
        </div>
      </section>
    </div>
  );
}
