import React, { lazy, Suspense } from 'react';
import ReportsFunilPanel from './ReportsFunilPanel.jsx';
import ReportsLeadEmptyStates from './ReportsLeadEmptyStates.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';

const ReportsFinancePanel = lazy(() => import('./ReportsFinancePanel.jsx'));
const ReportsLojaPanel = lazy(() => import('./ReportsLojaPanel.jsx'));
const ReportsEstoquePanel = lazy(() => import('./ReportsEstoquePanel.jsx'));
const ReportsStudentsPanel = lazy(() => import('./ReportsStudentsPanel.jsx'));
const ReportsAtividadePanel = lazy(() => import('./ReportsAtividadePanel.jsx'));
const ReportsFrequenciaPanel = lazy(() => import('./ReportsFrequenciaPanel.jsx'));

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
  hasFinance,
  hasSales,
  hasInventory,
  loading,
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
  periodLabel,
  academyId,
  operatorFilter = '',
  onDrill,
  isOwner = false,
  operatorTeam = [],
  onOperatorFilterChange,
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
            periodLabel={periodLabel}
            kpiGoals={kpiGoals}
            studentMetrics={studentReportData?.studentMetrics}
            loading={studentShowInitialLoad}
          />
        </Suspense>
      ) : null}

      {activeTab === 'financeiro' ? (
        <Suspense fallback={lazyFallback}>
          <ReportsFinancePanel
            academyId={academyId}
            from={range.from}
            to={range.to}
            hasFinance={hasFinance}
            kpiGoals={kpiGoals}
          />
        </Suspense>
      ) : null}

      {activeTab === 'loja' ? (
        <Suspense fallback={lazyFallback}>
          <ReportsLojaPanel
            academyId={academyId}
            from={range.from}
            to={range.to}
            hasSales={hasSales}
            operatorFilter={operatorFilter}
            kpiGoals={kpiGoals}
          />
        </Suspense>
      ) : null}

      {activeTab === 'estoque' ? (
        <Suspense fallback={lazyFallback}>
          <ReportsEstoquePanel
            academyId={academyId}
            from={range.from}
            to={range.to}
            hasInventory={hasInventory}
            hasFinance={hasFinance}
            kpiGoals={kpiGoals}
          />
        </Suspense>
      ) : null}

      {activeTab === 'atividade' ? (
        <Suspense fallback={lazyFallback}>
          <ReportsAtividadePanel
            academyId={academyId}
            from={range.from}
            to={range.to}
            isOwner={isOwner}
            operatorTeam={operatorTeam}
            operatorFilter={operatorFilter}
            onOperatorFilterChange={onOperatorFilterChange}
          />
        </Suspense>
      ) : null}

      {activeTab === 'frequencia' ? (
        <Suspense fallback={lazyFallback}>
          <ReportsFrequenciaPanel
            academyId={academyId}
            rangeFrom={range.from}
            rangeTo={range.to}
            periodLabel={periodLabel}
          />
        </Suspense>
      ) : null}

    </>
  );
}
