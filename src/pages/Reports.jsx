import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLeadStore } from '../store/useLeadStore';
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
import { DRILL_LABELS } from '../lib/reportsFunnelUtils.js';
import {
    getDefaultReportTab,
    getReportTabItems,
    getReportsTabFlags,
    normalizeReportTabParam,
} from '../lib/reportsPageConfig.js';
import { useReportsPeriod } from '../hooks/useReportsPeriod.js';
import { useFunnelReport } from '../hooks/useFunnelReport.js';
import { useStudentMetricsReport } from '../hooks/useStudentMetricsReport.js';
import { useReportsKpiGoals } from '../hooks/useReportsKpiGoals.js';
import { useFunnelDerived } from '../hooks/useFunnelDerived.js';
import { useReportsLeadExport } from '../hooks/useReportsLeadExport.js';
import { ReportsExportSlotProvider, useReportsExportSlot } from '../hooks/useReportsExportSlot.jsx';
import { fetchTeamMemberships } from '../lib/teamApi.js';
import { isAttendanceConfigured } from '../lib/attendance.js';
import { normalizeReportsOperatorTeam } from '../lib/reportsOperatorTeam.js';
import '../components/reports/reports.css';

function ReportsPeriodToolbarBridge({
    isLeadReportTab,
    activeTab,
    hasSales,
    exportOpen,
    onExportOpenChange,
    leadExportDisabled,
    leadExportTitle,
    leadExportLoading,
    onExportNewLeads,
    onExportScheduled,
    onExportCompleted,
    onExportMissed,
    onExportConverted,
    convertedExportLabel,
    operatorFilter,
    onOperatorFilterChange,
    operatorTeam,
    ...toolbarProps
}) {
    const exportCtx = useReportsExportSlot();
    const tabExport = exportCtx?.slot;
    const exportVariant = isLeadReportTab ? 'menu' : tabExport?.onExport ? 'single' : 'none';
    const exportDisabled = isLeadReportTab ? leadExportDisabled : Boolean(tabExport?.disabled ?? true);
    const exportLoading = isLeadReportTab ? leadExportLoading : Boolean(tabExport?.loading);
    const exportTitle = isLeadReportTab ? leadExportTitle : tabExport?.title || 'Exportar CSV';

    return (
        <ReportsPeriodToolbar
            {...toolbarProps}
            showLeadFilters={isLeadReportTab}
            showSalesOperatorFilters={activeTab === 'loja' && hasSales}
            operatorFilter={operatorFilter}
            onOperatorFilterChange={onOperatorFilterChange}
            operatorTeam={operatorTeam}
            exportOpen={exportOpen}
            onExportOpenChange={onExportOpenChange}
            exportDisabled={exportDisabled}
            exportTitle={exportTitle}
            exportLoading={exportLoading}
            exportVariant={exportVariant}
            onExportSingle={() => tabExport?.onExport?.()}
            onExportNewLeads={onExportNewLeads}
            onExportScheduled={onExportScheduled}
            onExportCompleted={onExportCompleted}
            onExportMissed={onExportMissed}
            onExportConverted={onExportConverted}
            convertedExportLabel={convertedExportLabel}
        />
    );
}

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
    const [profileFilter, setProfileFilter] = useState('all');
    const [operatorFilter, setOperatorFilter] = useState('');
    const [salesTeam, setSalesTeam] = useState([]);
    const salesTeamCacheRef = useRef({ academyId: null, data: [] });
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
    const hasFinance = modules?.finance === true;
    const hasSales = modules?.sales === true;
    const hasInventory = modules?.inventory === true;
    const hasAttendance = isAttendanceConfigured();

    const reportTabItems = useMemo(
        () => getReportTabItems({ hasFinance, hasSales, hasInventory, hasAttendance }),
        [hasFinance, hasSales, hasInventory, hasAttendance]
    );

    const defaultReportTab = useMemo(
        () => getDefaultReportTab({ hasFinance, hasSales, hasInventory, hasAttendance }),
        [hasFinance, hasSales, hasInventory, hasAttendance]
    );

    const allowedReportTabIds = useMemo(
        () => new Set(reportTabItems.map((tab) => tab.id)),
        [reportTabItems]
    );

    const activeTab = resolveHubTab(searchParams.get('tab'), allowedReportTabIds, defaultReportTab);
    const { isLeadReportTab, needsFunnelReport, needsStudentMetrics, isPeriodTab } =
      getReportsTabFlags(activeTab);

    const funnel = useFunnelReport({
        enabled: needsFunnelReport,
        academyId,
        preset,
        range,
        profileFilter,
        chartMode,
        onDateError: setDateError,
    });
    const { reportData, loading, error, fetchReport, showInitialLoad, showRefreshing } = funnel;

    const studentReport = useStudentMetricsReport({
        enabled: needsStudentMetrics,
        academyId,
        preset,
        range,
        onDateError: setDateError,
    });
    const {
        reportData: studentReportData,
        loading: studentLoading,
        error: studentError,
        fetchReport: fetchStudentReport,
        showInitialLoad: studentShowInitialLoad,
        showRefreshing: studentShowRefreshing,
    } = studentReport;

    const kpiGoals = useReportsKpiGoals(academyId);

    const derived = useFunnelDerived({ reportData, chartMetric, terms, contactsPlural });
    const { reportHasActivity, exportDisabled, exportTitle, exportList } = useReportsLeadExport({
        reportData,
        rangeSlug,
        isOwner,
        loading,
        error,
    });

    const handleRefresh = useCallback(() => {
        if (needsFunnelReport) void fetchReport(true);
        if (needsStudentMetrics) void fetchStudentReport(true);
    }, [needsFunnelReport, needsStudentMetrics, fetchReport, fetchStudentReport]);
    const handleRetry = useCallback(() => {
        if (needsFunnelReport) void fetchReport(false);
        if (needsStudentMetrics) void fetchStudentReport(false);
    }, [needsFunnelReport, needsStudentMetrics, fetchReport, fetchStudentReport]);

    const activeError = needsStudentMetrics && !needsFunnelReport ? studentError : error;
    const activeShowRefreshing =
        (needsFunnelReport && showRefreshing) || (needsStudentMetrics && studentShowRefreshing);
    const activeSnapshotData = needsStudentMetrics && !needsFunnelReport ? studentReportData : reportData;
    const closeExport = useCallback(() => setExportOpen(false), []);

    useEffect(() => {
        const current = String(searchParams.get('tab') || '').trim().toLowerCase();
        const normalized = normalizeReportTabParam(current);
        const target =
            normalized && allowedReportTabIds.has(normalized) ? normalized : defaultReportTab;
        if (current !== target) {
            setSearchParams({ tab: target }, { replace: true });
        }
    }, [allowedReportTabIds, defaultReportTab, searchParams, setSearchParams]);

    useEffect(() => {
        const activeBtn = document.querySelector(
            '.reports-root .navi-hub-tab[aria-selected="true"]'
        );
        activeBtn?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, [activeTab]);

    useEffect(() => {
        const onResize = () => setChartHeight(window.innerWidth < 640 ? 200 : 260);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        if (activeTab !== 'loja' && activeTab !== 'atividade') setOperatorFilter('');
    }, [activeTab]);

    useEffect(() => {
        if ((activeTab !== 'loja' && activeTab !== 'atividade') || !academyId) {
            setSalesTeam([]);
            return undefined;
        }
        // Cache: re-usar dados já carregados ao alternar entre abas da mesma academia.
        if (salesTeamCacheRef.current.academyId === academyId) {
            setSalesTeam(salesTeamCacheRef.current.data);
            return undefined;
        }
        let alive = true;
        fetchTeamMemberships(academyId)
            .then((members) => {
                if (!alive) return;
                const normalized = normalizeReportsOperatorTeam(members);
                salesTeamCacheRef.current = { academyId, data: normalized };
                setSalesTeam(normalized);
            })
            .catch(() => {
                if (alive) setSalesTeam([]);
            });
        return () => {
            alive = false;
        };
    }, [activeTab, academyId]);

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
                        (needsFunnelReport || needsStudentMetrics) && activeSnapshotData?.snapshotUpdatedAt ? (
                            <button
                                type="button"
                                className="reports-meta-refresh"
                                onClick={handleRefresh}
                                disabled={loading || studentLoading}
                                aria-label="Atualizar dados do relatório"
                            >
                                <span>
                                    Atualizado em{' '}
                                    {new Date(activeSnapshotData.snapshotUpdatedAt).toLocaleString('pt-BR', {
                                        day: '2-digit',
                                        month: 'short',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    })}
                                    {activeSnapshotData.fromSnapshot ? ' (cache)' : ''}
                                </span>
                                <RefreshCw
                                    size={14}
                                    strokeWidth={2}
                                    className={`reports-meta-refresh__icon${loading || studentLoading ? ' reports-spin' : ''}`}
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
                {activeShowRefreshing ? (
                    <div className="reports-sync-bar mt-3" role="status" aria-live="polite">
                        <Loader2 size={18} className="reports-spin" aria-hidden />
                        <span>Atualizando dados do servidor…</span>
                    </div>
                ) : null}

                {activeError ? (
                    <ErrorBanner className="mt-3" message={activeError} onRetry={handleRetry} />
                ) : null}

                {isPeriodTab ? (
                    <ReportsExportSlotProvider>
                        <ReportsPeriodToolbarBridge
                            presets={presets}
                            preset={preset}
                            onPresetChange={setPreset}
                            from={from}
                            to={to}
                            onFromChange={setFrom}
                            onToChange={setTo}
                            dateError={dateError}
                            isLeadReportTab={isLeadReportTab}
                            activeTab={activeTab}
                            hasSales={hasSales}
                            profileFilter={profileFilter}
                            onProfileFilterChange={setProfileFilter}
                            operatorFilter={operatorFilter}
                            onOperatorFilterChange={setOperatorFilter}
                            operatorTeam={salesTeam}
                            exportOpen={exportOpen}
                            onExportOpenChange={setExportOpen}
                            leadExportDisabled={exportDisabled}
                            leadExportTitle={exportTitle}
                            leadExportLoading={loading}
                            onExportNewLeads={() => exportList('newLeads', 'novos-leads', closeExport)}
                            onExportScheduled={() => exportList('scheduled', 'agendados', closeExport)}
                            onExportCompleted={() => exportList('completed', 'compareceram', closeExport)}
                            onExportMissed={() => exportList('missed', 'nao-compareceram', closeExport)}
                            onExportConverted={() =>
                                exportList('converted', terms.reportsExportConvertedFileSlug, closeExport)
                            }
                            convertedExportLabel={terms.reportsMetricConvertedShort}
                        />

                        <ReportsTabPanels
                    activeTab={activeTab}
                    needsFunnelReport={needsFunnelReport}
                    needsStudentMetrics={needsStudentMetrics}
                    showNoLeadsEmpty={showNoLeadsEmpty}
                    studentReportData={studentReportData}
                    studentShowInitialLoad={studentShowInitialLoad}
                    kpiGoals={kpiGoals}
                    showNoActivityEmpty={showNoActivityEmpty}
                    showLeadFunnelContent={showLeadFunnelContent}
                    contactLabel={contactLabel}
                    contactsPlural={contactsPlural}
                    workspaceNoun={terms.workspaceNoun}
                    reportData={reportData}
                    hasFinance={hasFinance}
                    hasSales={hasSales}
                    hasInventory={hasInventory}
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
                    periodLabel={prettyRange}
                    academyId={academyId}
                    operatorFilter={operatorFilter}
                    onOperatorFilterChange={setOperatorFilter}
                    isOwner={isOwner}
                    operatorTeam={salesTeam}
                    onDrill={setDrillKey}
                        />
                    </ReportsExportSlotProvider>
                ) : null}

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
