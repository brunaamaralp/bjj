import React, { lazy, Suspense } from 'react';
import ReportsVisaoGeralSection from './ReportsVisaoGeralSection.jsx';
import ReportsFunilPanel from './ReportsFunilPanel.jsx';
import ReportsLeadEmptyStates from './ReportsLeadEmptyStates.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';

const ReportsFinancePanel = lazy(() => import('./ReportsFinancePanel.jsx'));
const ReportsLojaPanel = lazy(() => import('./ReportsLojaPanel.jsx'));
const ReportsEstoquePanel = lazy(() => import('./ReportsEstoquePanel.jsx'));
const ReportsMovimentacoesPanel = lazy(() => import('./ReportsMovimentacoesPanel.jsx'));
const ReportsOperadorPanel = lazy(() => import('./ReportsOperadorPanel.jsx'));
const ReportsStudentsPanel = lazy(() => import('./ReportsStudentsPanel.jsx'));

const lazyFallback = <PageSkeleton variant="cards" rows={4} />;

export default function ReportsTabPanels({
  activeTab,
  needsFunnelReport,
  needsStudentMetrics,
  showNoLeadsEmpty,
  showNoActivityEmpty,
  showLeadFunnelContent,
  contactLabel,
  contactsPlural,
  workspaceNoun,
  reportData,
  studentReportData,
  studentShowInitialLoad,
  kpiGoals,
  ratesCards,
  overviewKpis,
  hasFinance,
  hasSales,
  hasInventory,
  canViewFinance,
  loading,
  showInitialLoad,
  showFunilChartSkeleton,
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
  terms,
  preset,
  range,
  academyId,
  onDrill,
}) {
  return (
    <>
      {needsFunnelReport ? (
        <>
          <ReportsLeadEmptyStates
            showNoLeadsEmpty={showNoLeadsEmpty}
            showNoActivityEmpty={showNoActivityEmpty}
            contactLabel={contactLabel}
            contactsPlural={contactsPlural}
            workspaceNoun={workspaceNoun}
          />

          {activeTab === 'visao-geral' && showLeadFunnelContent ? (
            <ReportsVisaoGeralSection
              reportData={reportData}
              kpiGoals={kpiGoals}
              ratesCards={ratesCards}
              hasFinance={hasFinance}
              hasSales={hasSales}
              hasInventory={hasInventory}
              canViewFinance={canViewFinance}
              financeSummary={overviewKpis.financeKpi}
              financeSummaryPrev={overviewKpis.financeKpiPrev}
              financeLoading={overviewKpis.financeKpiLoading}
              financeError={overviewKpis.financeKpiError}
              salesSummary={overviewKpis.salesKpi}
              salesSummaryPrev={overviewKpis.salesKpiPrev}
              salesLoading={overviewKpis.salesKpiLoading}
              inventorySummary={overviewKpis.inventoryKpi}
              inventorySummaryPrev={overviewKpis.inventoryKpiPrev}
              inventoryLoading={overviewKpis.inventoryKpiLoading}
              preset={preset}
              onFunnelDrill={onDrill}
            />
          ) : null}

          {activeTab === 'funil' ? (
            <ReportsFunilPanel
              reportData={reportData}
              kpiGoals={kpiGoals}
              showContent={showLeadFunnelContent}
              loading={loading}
              showChartSkeleton={showFunilChartSkeleton}
              chartMetric={chartMetric}
              onChartMetricChange={onChartMetricChange}
              chartMode={chartMode}
              onChartModeChange={onChartModeChange}
              chartHeight={chartHeight}
              chartDataComparison={chartDataComparison}
              conversionChartData={conversionChartData}
              lastConversionPoint={lastConversionPoint}
              funnelStages={funnelStages}
              heatmapTableView={heatmapTableView}
              onHeatmapTableViewChange={onHeatmapTableViewChange}
              contactLabel={contactLabel}
              contactsPlural={contactsPlural}
              terms={terms}
              preset={preset}
              range={range}
              onDrill={onDrill}
            />
          ) : null}

        </>
      ) : null}

      {needsStudentMetrics ? (
        <Suspense fallback={lazyFallback}>
          <ReportsStudentsPanel
            academyId={academyId}
            rangeFrom={range.from}
            rangeTo={range.to}
            preset={preset}
            kpiGoals={kpiGoals}
            studentMetrics={studentReportData?.studentMetrics}
            loading={studentShowInitialLoad}
          />
        </Suspense>
      ) : null}

      {activeTab === 'financeiro' ? (
        <Suspense fallback={lazyFallback}>
          <ReportsFinancePanel academyId={academyId} from={range.from} to={range.to} hasFinance={hasFinance} />
        </Suspense>
      ) : null}

      {activeTab === 'loja' ? (
        <Suspense fallback={lazyFallback}>
          <ReportsLojaPanel academyId={academyId} from={range.from} to={range.to} hasSales={hasSales} />
        </Suspense>
      ) : null}

      {activeTab === 'estoque' ? (
        <Suspense fallback={lazyFallback}>
          <ReportsEstoquePanel
            academyId={academyId}
            from={range.from}
            to={range.to}
            hasInventory={hasInventory}
          />
        </Suspense>
      ) : null}

      {activeTab === 'movimentacoes' ? (
        <Suspense fallback={lazyFallback}>
          <ReportsMovimentacoesPanel
            academyId={academyId}
            from={range.from}
            to={range.to}
            hasInventory={hasInventory}
          />
        </Suspense>
      ) : null}

      {activeTab === 'operador' ? (
        <Suspense fallback={lazyFallback}>
          <ReportsOperadorPanel academyId={academyId} from={range.from} to={range.to} hasSales={hasSales} />
        </Suspense>
      ) : null}
    </>
  );
}
