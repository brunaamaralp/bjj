import React from 'react';
import { Link } from 'react-router-dom';
import {
  Award,
  DoorOpen,
  Package,
  Percent,
  ShoppingBag,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { formatBRL } from '../../lib/moneyBr';
import StatusBanner from '../shared/StatusBanner.jsx';
import ReportKpiCard, { ReportKpiCardSkeleton } from './shared/ReportKpiCard.jsx';
import ReportSectionHeading from './shared/ReportSectionHeading.jsx';
import ReportsMethodologyNote from './ReportsMethodologyNote.jsx';
import { pctVar } from '../../lib/reportsFunnelUtils.js';
import './reports.css';

const RATE_ICONS = {
  percent: Percent,
  door: DoorOpen,
  award: Award,
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
 * Dashboard da aba Visão geral: KPIs cross-domain + taxas de captação.
 */
export default function ReportsVisaoGeralSection({
  reportData,
  ratesCards,
  hasFinance,
  hasSales,
  hasInventory,
  canViewFinance,
  financeSummary,
  financeSummaryPrev,
  financeLoading,
  financeError = null,
  salesSummary,
  salesLoading,
  inventorySummary,
  inventoryLoading,
  onFunnelDrill,
}) {
  const m = reportData?.metrics;
  const sm = reportData?.studentMetrics;

  const newLeadsCur = Number(m?.newLeads?.current || 0);
  const newLeadsPrev = Number(m?.newLeads?.previous || 0);
  const convertedCur = Number(m?.converted?.current || 0);
  const convertedPrev = Number(m?.converted?.previous || 0);
  const activeEnd = sm != null && sm.activeAtEnd != null ? Number(sm.activeAtEnd) : null;
  const activeEndPrev = sm?.previous?.activeAtEnd != null ? Number(sm.previous.activeAtEnd) : null;
  const retention =
    sm?.retentionRate != null && sm.retentionRate !== ''
      ? Number(sm.retentionRate) || 0
      : Math.max(0, 100 - (Number(sm?.churnRate) || 0));
  const retentionPrev =
    sm?.previous?.retentionRate != null && sm.previous.retentionRate !== ''
      ? Number(sm.previous.retentionRate) || 0
      : Math.max(0, 100 - (Number(sm?.previous?.churnRate) || 0));

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
        {showRevenueKpi && financeError ? (
          <ReportKpiCell>
            <StatusBanner variant="info" message={financeError} />
          </ReportKpiCell>
        ) : null}
        {showRevenueKpi && financeLoading ? (
          <ReportKpiCell>
            <ReportKpiCardSkeleton />
          </ReportKpiCell>
        ) : null}
        {showRevenueKpi && !financeLoading && !financeError && financeSummary ? (
          <ReportKpiCell footerTo="/reports?tab=financeiro">
            <ReportKpiCard
              label="Receita liquidada"
              value={formatBRL(Number(receivedCur) || 0)}
              trend={
                receivedPrev != null ? pctVar(Number(receivedCur) || 0, Number(receivedPrev) || 0) : null
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
              label="Alunos ativos (fim do período)"
              value={activeEnd}
              trend={activeEndPrev != null ? pctVar(activeEnd, activeEndPrev) : null}
              trendLabel="vs. fim do período anterior"
              icon={<TrendingUp size={20} strokeWidth={2.25} />}
              showCta={false}
            />
          </ReportKpiCell>
        ) : null}
        {sm != null ? (
          <ReportKpiCell footerTo="/reports?tab=alunos">
            <ReportKpiCard
              label="Retenção"
              value={`${retention.toFixed(1)}%`}
              trend={pctVar(retention, retentionPrev)}
              trendLabel="vs. período anterior"
              icon={<TrendingUp size={20} strokeWidth={2.25} />}
              highlight="success"
              showCta={false}
            />
          </ReportKpiCell>
        ) : null}
        {hasSales && salesLoading ? (
          <ReportKpiCell>
            <ReportKpiCardSkeleton />
          </ReportKpiCell>
        ) : null}
        {hasSales && !salesLoading && salesSummary ? (
          <ReportKpiCell footerTo="/reports?tab=loja">
            <ReportKpiCard
              label="Faturamento (vendas)"
              value={formatBRL(Number(salesSummary.concludedTotal) || 0)}
              trendLabel={`${salesSummary.concludedCount ?? 0} venda(s)`}
              icon={<ShoppingBag size={20} strokeWidth={2.25} />}
              showCta={false}
            />
          </ReportKpiCell>
        ) : null}
        {hasInventory && inventoryLoading ? (
          <ReportKpiCell>
            <ReportKpiCardSkeleton />
          </ReportKpiCell>
        ) : null}
        {hasInventory && !inventoryLoading && inventorySummary ? (
          <ReportKpiCell footerTo="/reports?tab=estoque">
            <ReportKpiCard
              label="Produtos parados"
              value={inventorySummary.stalled ?? 0}
              trendLabel="Sem vendas no período"
              icon={<Package size={20} strokeWidth={2.25} />}
              highlight="warning"
              showCta={false}
            />
          </ReportKpiCell>
        ) : null}
      </div>

      <div className="reports-visao-geral__section-divider" role="presentation" />

      <section className="reports-funnel-card" aria-label="Taxas de captação">
        <ReportSectionHeading title="Taxas de captação" subtitle="Conversão entre etapas do funil" />
        <div className="reports-rates-grid">
          {ratesCards.map((item) => {
            const Icon = RATE_ICONS[item.icon] || Percent;
            return (
              <div key={item.key} className="reports-rate-card">
                <Icon size={18} aria-hidden style={{ color: item.accent }} />
                <div className="reports-rate-value">{item.pct}%</div>
                <div className="reports-rate-label">{item.label}</div>
                <div className="reports-rate-insight">{item.insight}</div>
              </div>
            );
          })}
        </div>
        <p className="reports-section-footer-link mb-0">
          <ReportInlineLink to="/reports?tab=funil">Ver relatório completo do funil →</ReportInlineLink>
        </p>
      </section>

      <nav className="reports-section-footer-links-row" aria-label="Relatórios relacionados">
        <ReportInlineLink to="/reports?tab=funil">Funil →</ReportInlineLink>
        <ReportInlineLink to="/reports?tab=alunos">Alunos →</ReportInlineLink>
        {hasFinance ? <ReportInlineLink to="/reports?tab=financeiro">Financeiro →</ReportInlineLink> : null}
        {hasSales ? <ReportInlineLink to="/reports?tab=loja">Vendas →</ReportInlineLink> : null}
        {hasInventory ? <ReportInlineLink to="/reports?tab=estoque">Estoque →</ReportInlineLink> : null}
      </nav>

      <ReportsMethodologyNote className="mt-4" />
    </div>
  );
}
