import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLeadStore, LEAD_ORIGIN } from '../store/useLeadStore';
import { resolveHubTab } from '../lib/hubTabs';
import HubTabBar from '../components/shared/HubTabBar.jsx';
import { useUserRole } from '../lib/useUserRole';
import { RefreshCw, Loader2 } from 'lucide-react';
import { useTerms, contactLabelSingular } from '../lib/terminology.js';
import ErrorBanner from '../components/shared/ErrorBanner.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import ReportsPeriodToolbar from '../components/reports/ReportsPeriodToolbar.jsx';
import ReportsDrillDialog from '../components/reports/ReportsDrillDialog.jsx';
import ReportsTabPanels from '../components/reports/ReportsTabPanels.jsx';
import { ReportKpiCardSkeleton } from '../components/reports/shared/ReportKpiCard.jsx';
import { useCanViewStudentFinance } from '../lib/canViewStudentFinance.js';
import { DRILL_LABELS } from '../lib/reportsFunnelUtils.js';
import { REPORT_TABS, getReportTabItems, getReportsTabFlags } from '../lib/reportsPageConfig.js';
import { useReportsPeriod } from '../hooks/useReportsPeriod.js';
import { useFunnelReport } from '../hooks/useFunnelReport.js';
import { useReportsOverviewKpis } from '../hooks/useReportsOverviewKpis.js';
import { useFunnelDerived } from '../hooks/useFunnelDerived.js';
import { useReportsLeadExport } from '../hooks/useReportsLeadExport.js';
import '../components/reports/reports.css';

export default function Reports() {
    const terms = useTerms();
    const labels = useLeadStore((s) => s.labels);
    const contactLabel = useMemo(() => contactLabelSingular(labels), [labels]);
    const contactsPlural = String(labels?.leads || 'Contatos').trim() || 'Contatos';
    const drillLabels = useMemo(
        () => ({
            ...DRILL_LABELS,
            converted: terms.reportsDrillConvertedTitle,
            newLeads: `Novos ${contactsPlural.toLowerCase()} no período`,
        }),
        [terms.reportsDrillConvertedTitle, contactsPlural]
    );

    const leadsCount = useLeadStore((s) => s.leads.length);
    const leadsLoading = useLeadStore((s) => s.loading);
    const leadsReady = useLeadStore((s) => s.leadsReady);
    const academyId = useLeadStore((s) => s.academyId);
    const academyList = useLeadStore((s) => s.academyList);
    const modules = useLeadStore((s) => s.modules);
    const [searchParams, setSearchParams] = useSearchParams();

    const [chartMetric, setChartMetric] = useState('new');
    const [chartMode, setChartMode] = useState('weekly');
    const [originFilter, setOriginFilter] = useState('all');
    const [profileFilter, setProfileFilter] = useState('all');
    const [exportOpen, setExportOpen] = useState(false);
    const [drillKey, setDrillKey] = useState(null);
    const [heatmapTableView, setHeatmapTableView] = useState(false);
    const [chartHeight, setChartHeight] = useState(() =>
        typeof window !== 'undefined' && window.innerWidth < 640 ? 200 : 260
    );

    const period = useReportsPeriod();
    const { presets, preset, setPreset, from, setFrom, to, setTo, range, prettyRange, rangeSlug, dateError, setDateError } =
        period;

    const academyDoc = useMemo(() => {
        if (!academyId) return null;
        const a = (academyList || []).find((x) => x.id === academyId);
        if (!a) return null;
        return { ownerId: String(a.ownerId || ''), teamId: String(a.teamId || '') };
    }, [academyList, academyId]);

    const isOwner = useUserRole(academyDoc) === 'owner';
    const canViewFinance = useCanViewStudentFinance(academyDoc);
    const hasFinance = modules?.finance === true;
    const hasSales = modules?.sales === true;
    const hasInventory = modules?.inventory === true;

    const reportTabItems = useMemo(
        () => getReportTabItems({ hasFinance, hasSales, hasInventory }),
        [hasFinance, hasSales, hasInventory]
    );

    const activeTab = resolveHubTab(searchParams.get('tab'), REPORT_TABS, 'visao-geral');
    const { isLeadReportTab, needsFunnelReport, isPeriodTab } = getReportsTabFlags(activeTab);

    const funnel = useFunnelReport({
        enabled: needsFunnelReport,
        academyId,
        preset,
        range,
        originFilter,
        profileFilter,
        chartMode,
        onDateError: setDateError,
    });
    const { reportData, loading, error, fetchReport, showInitialLoad, showRefreshing } = funnel;

    const overviewKpis = useReportsOverviewKpis({
        active: activeTab === 'visao-geral',
        academyId,
        range,
        preset,
        hasFinance,
        canViewFinance,
        hasSales,
        hasInventory,
    });

    const derived = useFunnelDerived({ reportData, chartMetric, terms, contactsPlural });
    const { reportHasActivity, exportDisabled, exportTitle, exportList } = useReportsLeadExport({
        reportData,
        rangeSlug,
        isOwner,
        loading,
        error,
    });

    const handleRefresh = useCallback(() => void fetchReport(true), [fetchReport]);
    const handleRetry = useCallback(() => void fetchReport(false), [fetchReport]);
    const closeExport = useCallback(() => setExportOpen(false), []);

    useEffect(() => {
        const t = String(searchParams.get('tab') || '').trim().toLowerCase();
        if (!REPORT_TABS.has(t)) setSearchParams({ tab: activeTab }, { replace: true });
    }, [activeTab, searchParams, setSearchParams]);

    useEffect(() => {
        const onResize = () => setChartHeight(window.innerWidth < 640 ? 200 : 260);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const showNoLeadsEmpty =
        isLeadReportTab && !error && !showInitialLoad && leadsReady && leadsCount === 0 && !leadsLoading;
    const showNoActivityEmpty =
        isLeadReportTab && !error && !showInitialLoad && !showNoLeadsEmpty && !reportHasActivity;
    const showLeadFunnelContent =
        isLeadReportTab && !error && !showInitialLoad && !showNoLeadsEmpty && !showNoActivityEmpty && reportData?.metrics;
    const drillList = reportData && drillKey ? reportData.metrics[drillKey]?.list || [] : [];
    const showFunilChartSkeleton = activeTab === 'funil' && !error && (showInitialLoad || loading);

    return (
        <div className="container navi-hub-page reports-root">
            <div className="navi-hub-page__head">
                <PageHeader
                    className="navi-page-header--flush"
                    title="Relatórios"
                    subtitle="Analise indicadores por período."
                    meta={<span>Período · {prettyRange}</span>}
                    actions={
                        needsFunnelReport && reportData?.snapshotUpdatedAt ? (
                            <button
                                type="button"
                                className="reports-meta-refresh"
                                onClick={handleRefresh}
                                disabled={loading}
                                aria-label="Atualizar dados do relatório"
                            >
                                <span>
                                    Atualizado em{' '}
                                    {new Date(reportData.snapshotUpdatedAt).toLocaleString('pt-BR', {
                                        day: '2-digit',
                                        month: 'short',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    })}
                                    {reportData.fromSnapshot ? ' (cache)' : ''}
                                </span>
                                <RefreshCw
                                    size={14}
                                    strokeWidth={2}
                                    className={`reports-meta-refresh__icon${loading ? ' reports-spin' : ''}`}
                                    aria-hidden
                                />
                                <span>Atualizar</span>
                            </button>
                        ) : null
                    }
                />
                <HubTabBar
                    tabs={reportTabItems}
                    activeId={activeTab}
                    onChange={(id) => setSearchParams({ tab: id }, { replace: true })}
                    ariaLabel="Relatórios"
                    fullWidth
                />
            </div>

            <div className="navi-hub-page__body">
                {showRefreshing ? (
                    <div className="reports-sync-bar mt-3" role="status" aria-live="polite">
                        <Loader2 size={18} className="reports-spin" aria-hidden />
                        <span>Atualizando dados do servidor…</span>
                    </div>
                ) : null}

                {error ? <ErrorBanner className="mt-3" message={error} onRetry={handleRetry} /> : null}

                {showInitialLoad && needsFunnelReport ? (
                    <div className="reports-kpi-grid mt-4" role="status" aria-live="polite" aria-busy="true" aria-label="Carregando indicadores">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <ReportKpiCardSkeleton key={i} />
                        ))}
                    </div>
                ) : null}

                {isPeriodTab ? (
                    <ReportsPeriodToolbar
                        presets={presets}
                        preset={preset}
                        onPresetChange={setPreset}
                        from={from}
                        to={to}
                        onFromChange={setFrom}
                        onToChange={setTo}
                        dateError={dateError}
                        showLeadFilters={isLeadReportTab}
                        originFilter={originFilter}
                        onOriginFilterChange={setOriginFilter}
                        leadOrigins={LEAD_ORIGIN}
                        profileFilter={profileFilter}
                        onProfileFilterChange={setProfileFilter}
                        exportOpen={exportOpen}
                        onExportOpenChange={setExportOpen}
                        exportDisabled={exportDisabled}
                        exportTitle={exportTitle}
                        exportLoading={loading}
                        onExportNewLeads={() => exportList('newLeads', 'novos-leads', closeExport)}
                        onExportScheduled={() => exportList('scheduled', 'agendados', closeExport)}
                        onExportCompleted={() => exportList('completed', 'compareceram', closeExport)}
                        onExportMissed={() => exportList('missed', 'nao-compareceram', closeExport)}
                        onExportConverted={() => exportList('converted', terms.reportsExportConvertedFileSlug, closeExport)}
                        convertedExportLabel={terms.reportsMetricConvertedShort}
                    />
                ) : null}

                <ReportsTabPanels
                    activeTab={activeTab}
                    needsFunnelReport={needsFunnelReport}
                    showNoLeadsEmpty={showNoLeadsEmpty}
                    showNoActivityEmpty={showNoActivityEmpty}
                    showLeadFunnelContent={showLeadFunnelContent}
                    contactLabel={contactLabel}
                    contactsPlural={contactsPlural}
                    workspaceNoun={terms.workspaceNoun}
                    reportData={reportData}
                    ratesCards={derived.ratesCards}
                    overviewKpis={overviewKpis}
                    hasFinance={hasFinance}
                    hasSales={hasSales}
                    hasInventory={hasInventory}
                    canViewFinance={canViewFinance}
                    loading={loading}
                    showInitialLoad={showInitialLoad}
                    showFunilChartSkeleton={showFunilChartSkeleton}
                    chartMetric={chartMetric}
                    onChartMetricChange={setChartMetric}
                    chartMode={chartMode}
                    onChartModeChange={setChartMode}
                    chartHeight={chartHeight}
                    chartDataComparison={derived.chartDataComparison}
                    conversionChartData={derived.conversionChartData}
                    lastConversionPoint={derived.lastConversionPoint}
                    funnelStages={derived.funnelStages}
                    heatmapTableView={heatmapTableView}
                    onHeatmapTableViewChange={setHeatmapTableView}
                    terms={terms}
                    preset={preset}
                    range={range}
                    academyId={academyId}
                    onDrill={setDrillKey}
                />

                <ReportsDrillDialog
                    drillKey={drillKey}
                    title={drillKey ? drillLabels[drillKey] : ''}
                    list={drillList}
                    range={range}
                    onClose={() => setDrillKey(null)}
                />
            </div>
        </div>
    );
}
