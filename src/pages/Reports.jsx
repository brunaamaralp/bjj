import React, { useMemo, useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLeadStore, LEAD_STATUS, LEAD_ORIGIN } from '../store/useLeadStore';
import { resolveHubTab } from '../lib/hubTabs';
import HubTabBar from '../components/shared/HubTabBar.jsx';
import FieldError from '../components/shared/FieldError.jsx';
import FilterBar from '../components/shared/FilterBar.jsx';
import { DateInputField } from '../components/DateInput';
import { DropdownMenu, DropdownMenuPanel, DropdownMenuItem } from '../components/shared/menu';
import { useUserRole } from '../lib/useUserRole';
import { hasAnyActivity } from '../lib/reportActivity.js';
import { account } from '../lib/appwrite';
import {
    Calendar,
    Download,
    TrendingUp,
    TrendingDown,
    Users,
    CheckCircle2,
    XCircle,
    UserPlus,
    ChevronDown,
    RefreshCw,
    Info,
    X,
    Loader2,
} from 'lucide-react';
import { useTerms, contactLabelSingular } from '../lib/terminology.js';
import EmptyState from '../components/shared/EmptyState.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import ReportsVisaoGeralSection from '../components/reports/ReportsVisaoGeralSection.jsx';
import PageSkeleton from '../components/shared/PageSkeleton.jsx';

const ReportsFinancePanel = lazy(() => import('../components/reports/ReportsFinancePanel.jsx'));
const ReportsLojaPanel = lazy(() => import('../components/reports/ReportsLojaPanel.jsx'));
const ReportsEstoquePanel = lazy(() => import('../components/reports/ReportsEstoquePanel.jsx'));
const ReportsMovimentacoesPanel = lazy(() => import('../components/reports/ReportsMovimentacoesPanel.jsx'));
const ReportsOperadorPanel = lazy(() => import('../components/reports/ReportsOperadorPanel.jsx'));
const ReportsStudentsPanel = lazy(() => import('../components/reports/ReportsStudentsPanel.jsx'));
const HEATMAP_SLOTS = [8, 10, 14, 17, 19, 20];
const HEATMAP_DAYS = [
    { key: 1, label: 'Seg' },
    { key: 2, label: 'Ter' },
    { key: 3, label: 'Qua' },
    { key: 4, label: 'Qui' },
    { key: 5, label: 'Sex' },
    { key: 6, label: 'Sáb' },
    { key: 0, label: 'Dom' },
];

const ReportsFunilBarChart = lazy(() =>
    import('../components/reports/ReportsFunilCharts.jsx').then((m) => ({ default: m.ReportsFunilBarChart }))
);
const ReportsFunilConversionChart = lazy(() =>
    import('../components/reports/ReportsFunilCharts.jsx').then((m) => ({ default: m.ReportsFunilConversionChart }))
);
import { friendlyError } from '../lib/errorMessages.js';
import ReportKpiCard, { ReportKpiCardSkeleton } from '../components/reports/shared/ReportKpiCard.jsx';
import { useCanViewStudentFinance } from '../lib/canViewStudentFinance.js';
import { fetchReportsFinanceLightResult } from '../lib/reportsLightApi.js';
import { previousPeriodRange } from '../lib/reportsPeriod.js';
import { getFinanceRegime } from '../lib/financeCompetence.js';
import { downloadCsv, leadToCsvRow } from '../lib/reportsExport.js';
import '../components/reports/reports.css';

const presets = [
    { key: 'today', label: 'Hoje' },
    { key: 'week', label: 'Esta semana' },
    { key: 'month', label: 'Este mês' },
    { key: 'last_month', label: 'Mês anterior' },
    { key: 'custom', label: 'Personalizado' },
];

const ymd = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};
const startOfWeek = (d) => {
    const dd = new Date(d);
    const day = dd.getDay();
    const diff = (day + 6) % 7;
    dd.setDate(dd.getDate() - diff);
    dd.setHours(0, 0, 0, 0);
    return dd;
};
const endOfWeek = (d) => {
    const dd = startOfWeek(d);
    dd.setDate(dd.getDate() + 6);
    dd.setHours(23, 59, 59, 999);
    return dd;
};
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
const parseYMD = (s) => {
    if (!s) return null;
    const [Y, M, D] = s.split('-').map(Number);
    return new Date(Y, (M || 1) - 1, D || 1);
};

const formatLongPtDate = (dateInput) => {
    const d = typeof dateInput === 'string' ? parseYMD(dateInput) : dateInput;
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
};

const formatRangeLongPt = (fromInput, toInput) => {
    const fromLabel = formatLongPtDate(fromInput);
    const toDate = typeof toInput === 'string' ? parseYMD(toInput) : toInput;
    if (!fromLabel || !(toDate instanceof Date) || Number.isNaN(toDate.getTime())) return `${fromInput} — ${toInput}`;
    const toDayMonth = toDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
    const toYear = toDate.getFullYear();
    return `${fromLabel} — ${toDayMonth} de ${toYear}`;
};

const HIGHLIGHT_BY_COLOR = {
    accent: 'default',
    warning: 'warning',
    success: 'success',
    danger: 'danger',
    purple: 'default',
};

const DRILL_LABELS = {
    newLeads: 'Novos leads no período',
    scheduled: 'Aulas agendadas no período',
    showed: 'Compareceram (registrado no período)',
    completed: 'Compareceram (registrado no período)',
    missed: 'Não compareceram (registrado no período)',
    converted: 'Matrículas no período',
};

/** Faixa superior do painel drill — alinhada às cores dos KPIs */
const DRILL_PANEL_ACCENT = {
    newLeads: 'accent',
    scheduled: 'warning',
    showed: 'success',
    completed: 'success',
    missed: 'danger',
    converted: 'purple',
};

function trendHintFor(metricKey, presetKey) {
    if (metricKey === 'conversionRate') {
        return 'Taxa do período atual vs período anterior (mesma duração).';
    }
    if (presetKey === 'today') {
        return 'Comparado com o dia anterior.';
    }
    if (presetKey === 'week') {
        return 'Comparado com a semana anterior (mesma duração).';
    }
    if (presetKey === 'month' || presetKey === 'last_month') {
        return 'Comparado com o mês civil anterior.';
    }
    return 'Comparado com o intervalo imediatamente anterior de mesma duração.';
}

const pctVar = (cur, prev) => {
    if (prev === 0) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 100);
};

const REPORT_TABS = new Set([
    'visao-geral',
    'funil',
    'alunos',
    'financeiro',
    'loja',
    'estoque',
    'movimentacoes',
    'operador',
]);

const REPORT_TAB_ITEMS_BASE = [
    { id: 'visao-geral', label: 'Visão geral' },
    { id: 'funil', label: 'Funil' },
    { id: 'alunos', label: 'Alunos' },
    { id: 'financeiro', label: 'Financeiro' },
    { id: 'loja', label: 'Vendas' },
    { id: 'estoque', label: 'Estoque' },
    { id: 'movimentacoes', label: 'Movimentações' },
    { id: 'operador', label: 'Por Operador' },
];

const Reports = () => {
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
    const leads = useLeadStore((s) => s.leads);
    const leadsLoading = useLeadStore((s) => s.loading);

    const [preset, setPreset] = useState('month');
    const [from, setFrom] = useState(ymd(startOfMonth(new Date())));
    const [to, setTo] = useState(ymd(endOfMonth(new Date())));
    const [chartMetric, setChartMetric] = useState('new');
    const [chartMode, setChartMode] = useState('weekly');
    const [originFilter, setOriginFilter] = useState('all');
    const [profileFilter, setProfileFilter] = useState('all');
    const [exportOpen, setExportOpen] = useState(false);
    const [drillKey, setDrillKey] = useState(null);
    const reportAbortRef = useRef(null);
    const filterDebounceSkip = useRef(true);
    const [heatmapTableView, setHeatmapTableView] = useState(false);
    const [financeKpi, setFinanceKpi] = useState(null);
    const [financeKpiPrev, setFinanceKpiPrev] = useState(null);
    const [financeKpiLoading, setFinanceKpiLoading] = useState(false);

    const [reportData, setReportData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [dateError, setDateError] = useState(null);
    const [chartHeight, setChartHeight] = useState(() =>
        typeof window !== 'undefined' && window.innerWidth < 640 ? 200 : 260
    );
    const academyId = useLeadStore((s) => s.academyId);
    const academyList = useLeadStore((s) => s.academyList);
    const modules = useLeadStore((s) => s.modules);
    const [searchParams, setSearchParams] = useSearchParams();

    const academyDoc = useMemo(() => {
        if (!academyId) return null;
        const a = (academyList || []).find((x) => x.id === academyId);
        if (!a) return null;
        return { ownerId: String(a.ownerId || ''), teamId: String(a.teamId || '') };
    }, [academyList, academyId]);
    const navRole = useUserRole(academyDoc);
    const isOwner = navRole === 'owner';
    const canViewFinance = useCanViewStudentFinance(academyDoc);
    const hasFinance = modules?.finance === true;
    const hasSales = modules?.sales === true;
    const hasInventory = modules?.inventory === true;

    const reportTabItems = useMemo(() => {
        return REPORT_TAB_ITEMS_BASE.filter((t) => {
            if (t.id === 'financeiro') return hasFinance;
            if (t.id === 'loja') return hasSales;
            if (t.id === 'estoque' || t.id === 'movimentacoes') return hasInventory;
            if (t.id === 'operador') return hasSales;
            return true;
        });
    }, [hasFinance, hasSales, hasInventory]);

    const activeTab = resolveHubTab(searchParams.get('tab'), REPORT_TABS, 'visao-geral');
    const isLeadReportTab = activeTab === 'visao-geral' || activeTab === 'funil';
    const needsFunnelReport = isLeadReportTab || activeTab === 'alunos';
    const isPeriodTab =
        needsFunnelReport ||
        activeTab === 'financeiro' ||
        activeTab === 'loja' ||
        activeTab === 'estoque' ||
        activeTab === 'movimentacoes' ||
        activeTab === 'operador';

    useEffect(() => {
        const t = String(searchParams.get('tab') || '').trim().toLowerCase();
        if (!REPORT_TABS.has(t)) {
            setSearchParams({ tab: activeTab }, { replace: true });
        }
    }, [activeTab, searchParams, setSearchParams]);

    const showInitialLoad = loading && !reportData;
    const showRefreshing = loading && reportData;

    useEffect(() => {
        const onResize = () => setChartHeight(window.innerWidth < 640 ? 200 : 260);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const range = useMemo(() => {
        const now = new Date();
        if (preset === 'today') return { from: ymd(now), to: ymd(now) };
        if (preset === 'week') return { from: ymd(startOfWeek(now)), to: ymd(endOfWeek(now)) };
        if (preset === 'month') return { from: ymd(startOfMonth(now)), to: ymd(endOfMonth(now)) };
        if (preset === 'last_month') {
            const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            return { from: ymd(startOfMonth(d)), to: ymd(endOfMonth(d)) };
        }
        return { from, to };
    }, [preset, from, to]);

    const fetchReport = useCallback(async (forceRefresh = false) => {
        if (!academyId) return;
        if (preset === 'custom') {
            const fa = parseYMD(range.from);
            const ta = parseYMD(range.to);
            if (fa && ta && fa.getTime() > ta.getTime()) {
                setDateError('A data inicial deve ser anterior à data final.');
                setError(null);
                return;
            }
        }
        setDateError(null);
        reportAbortRef.current?.abort();
        const controller = new AbortController();
        reportAbortRef.current = controller;
        setLoading(true);
        setError(null);

        const fromDay = parseYMD(range.from);
        const toDay = parseYMD(range.to);
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

        try {
            const jwt = await account.createJWT();
            const res = await fetch('/api/reports', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${jwt.jwt}`,
                    'x-academy-id': String(academyId || '')
                },
                body: JSON.stringify({
                    academyId,
                    from: fromDay.toISOString(),
                    to: toDEndLocal.toISOString(),
                    prevFrom: prevFromDLocal.toISOString(),
                    prevTo: prevToDLocal.toISOString(),
                    filters: { origin: originFilter, type: profileFilter },
                    chartMode,
                    refresh: forceRefresh === true,
                }),
                signal: controller.signal,
            });
            if (res.status === 504) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.message || 'Muitos dados — tente um período menor');
            }
            if (!res.ok) throw new Error('Falha na resposta do servidor');
            const data = await res.json();
            if (!controller.signal.aborted) setReportData(data);
        } catch (e) {
            if (e?.name === 'AbortError') return;
            setError(friendlyError(e, 'load'));
            setReportData(null);
            console.error(e);
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, [academyId, preset, range.from, range.to, originFilter, profileFilter, chartMode]);

    useEffect(() => {
        if (!needsFunnelReport) return;
        void fetchReport(false);
    }, [range, chartMode, academyId, preset, needsFunnelReport, fetchReport]);

    const prevRangeYmd = useMemo(() => previousPeriodRange(preset, range), [preset, range]);

    useEffect(() => {
        let active = true;
        if (activeTab !== 'visao-geral' || !academyId || !hasFinance || !canViewFinance) {
            setFinanceKpi(null);
            setFinanceKpiPrev(null);
            setFinanceKpiLoading(false);
            return undefined;
        }
        const regime = getFinanceRegime(academyId);
        setFinanceKpiLoading(true);
        Promise.all([
            fetchReportsFinanceLightResult({ academyId, from: range.from, to: range.to, regime }),
            fetchReportsFinanceLightResult({
                academyId,
                from: prevRangeYmd.from,
                to: prevRangeYmd.to,
                regime,
            }),
        ])
            .then(([cur, prev]) => {
                if (!active) return;
                setFinanceKpi(cur.ok && !cur.permissionDenied ? cur.data : null);
                setFinanceKpiPrev(prev.ok && !prev.permissionDenied ? prev.data : null);
            })
            .catch(() => {
                if (active) {
                    setFinanceKpi(null);
                    setFinanceKpiPrev(null);
                }
            })
            .finally(() => {
                if (active) setFinanceKpiLoading(false);
            });
        return () => {
            active = false;
        };
    }, [activeTab, academyId, hasFinance, canViewFinance, range.from, range.to, prevRangeYmd.from, prevRangeYmd.to]);

    useEffect(() => {
        if (!needsFunnelReport) return;
        if (filterDebounceSkip.current) {
            filterDebounceSkip.current = false;
            return;
        }
        const t = window.setTimeout(() => void fetchReport(false), 300);
        return () => window.clearTimeout(t);
    }, [originFilter, profileFilter, needsFunnelReport, fetchReport]);

    const rangeSlug = `${range.from}_${range.to}`;
    const prettyRange = useMemo(() => formatRangeLongPt(range.from, range.to), [range.from, range.to]);

    const exportList = (listKey, slug) => {
        if (!reportData || !reportData.metrics[listKey]) return;
        const list = reportData.metrics[listKey].list || [];
        const rows = list.map((l) => leadToCsvRow(l, { includeContact: isOwner }));
        if (rows.length === 0) {
            downloadCsv([{ mensagem: 'Nenhum registro no período com os filtros atuais' }], `relatorio-${slug}-vazio.csv`);
            return;
        }
        downloadCsv(rows, `relatorio-${slug}-${rangeSlug}.csv`);
        setExportOpen(false);
    };

    const reportHasActivity = hasAnyActivity(reportData);

    const drillList = reportData && drillKey ? reportData.metrics[drillKey]?.list || [] : [];
    const funnelStages = useMemo(() => {
        if (!reportData?.metrics) return [];
        const m = reportData.metrics;
        const newLeadsCurrent = Number(m.newLeads?.current || 0);
        const safeBase = Math.max(newLeadsCurrent, 1);
        const scheduledCurrent = Number(m.scheduled?.current || 0);
        const completedCurrent = Number(m.completed?.current ?? m.showed?.current ?? 0);
        const convertedCurrent = Number(m.converted?.current || 0);
        const conversionCurrent = Number(m.conversionRate?.current || 0);
        const scheduledPrev = Number(m.scheduled?.previous || 0);
        const completedPrev = Number(m.completed?.previous || m.showed?.previous || 0);
        const convertedPrev = Number(m.converted?.previous || 0);
        const conversionPrev = Number(m.conversionRate?.previous || 0);
        const stageRows = [
            { key: 'newLeads', label: 'Novos leads', current: newLeadsCurrent, previous: Number(m.newLeads?.previous || 0), drillKey: 'newLeads', prevBase: newLeadsCurrent, color: 'var(--petroleo)' },
            { key: 'scheduled', label: 'Agendados', current: scheduledCurrent, previous: scheduledPrev, drillKey: 'scheduled', prevBase: newLeadsCurrent, color: 'var(--color-primary)' },
            { key: 'completed', label: 'Compareceram', current: completedCurrent, previous: completedPrev, drillKey: 'completed', prevBase: scheduledCurrent, color: '#003654' },
            { key: 'converted', label: terms.reportsMetricConvertedShort, current: convertedCurrent, previous: convertedPrev, drillKey: 'converted', prevBase: completedCurrent, color: 'var(--petroleo)' },
            { key: 'conversionRate', label: 'Conversão total', current: conversionCurrent, previous: conversionPrev, drillKey: null, prevBase: 100, color: '#000435', isPercent: true },
        ];
        return stageRows.map((s, index) => {
            const variation = pctVar(s.current, s.previous);
            const relativeBase = s.isPercent ? 100 : Math.max(Number(s.prevBase || 0), 1);
            const relativePct = Math.max(0, Math.round((Number(s.current || 0) / relativeBase) * 100));
            const barPct = s.isPercent
                ? Math.min(100, Math.max(0, s.current))
                : Math.min(100, Math.round((Number(s.current || 0) / safeBase) * 100));
            return { ...s, variation, relativePct, barPct, isLast: index === stageRows.length - 1 };
        });
    }, [reportData, terms.reportsMetricConvertedShort]);
    const ratesCards = useMemo(() => {
        if (!reportData?.metrics) return [];
        const m = reportData.metrics;
        const newLeads = Number(m.newLeads?.current || 0);
        const scheduled = Number(m.scheduled?.current || 0);
        const completed = Number(m.completed?.current ?? m.showed?.current ?? 0);
        const converted = Number(m.converted?.current || 0);
        const safePct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : 0);
        return [
            {
                key: 'scheduled',
                label: 'Taxa de agendamento',
                icon: 'ti ti-percentage',
                accent: 'var(--warning)',
                pct: safePct(scheduled, newLeads),
                insight: `${scheduled} de ${newLeads} leads agendaram`,
            },
            {
                key: 'attendance',
                label: 'Taxa de presença',
                icon: 'ti ti-door-enter',
                accent: '#0B8A8F',
                pct: safePct(completed, scheduled),
                insight: `${completed} de ${scheduled} agendados compareceram`,
            },
            {
                key: 'closure',
                label: 'Taxa de fechamento',
                icon: 'ti ti-award',
                accent: 'var(--accent)',
                pct: safePct(converted, completed),
                insight: terms.reportsClosureRateInsight
                    .replace(/\{converted\}/g, String(converted))
                    .replace(/\{completed\}/g, String(completed)),
            },
        ];
    }, [reportData, terms.reportsClosureRateInsight]);
    const chartDataComparison = useMemo(() => {
        const rows = reportData?.chartComparison;
        if (!rows?.length) return [];
        const metricMap = chartMetric === 'new' ? 'newLeads' : chartMetric === 'scheduled' ? 'scheduled' : 'converted';
        const prevMap =
            chartMetric === 'new' ? 'prevNewLeads' : chartMetric === 'scheduled' ? 'prevScheduled' : 'prevConverted';
        return rows.map((bucket) => ({
            label: bucket.label,
            current: Number(bucket[metricMap] || 0),
            previous: Number(bucket[prevMap] || 0),
        }));
    }, [reportData, chartMetric]);
    const conversionChartData = useMemo(
        () => (Array.isArray(reportData?.conversionSeries) ? reportData.conversionSeries : []),
        [reportData]
    );
    const lastConversionPoint = conversionChartData.length > 0 ? conversionChartData[conversionChartData.length - 1] : null;
    const heatmapMax = useMemo(() => {
        if (!reportData?.heatmapData) return 0;
        return HEATMAP_DAYS.reduce((maxAcc, day) => {
            const dayMap = reportData.heatmapData?.[day.key] || {};
            return HEATMAP_SLOTS.reduce((slotAcc, h) => Math.max(slotAcc, Number(dayMap[h] || 0)), maxAcc);
        }, 0);
    }, [reportData]);
    const heatmapLevelClass = (count) => {
        if (!heatmapMax || count <= 0) return 'reports-heatmap-cell--0';
        const ratio = count / heatmapMax;
        if (ratio <= 0.2) return 'reports-heatmap-cell--1';
        if (ratio <= 0.4) return 'reports-heatmap-cell--2';
        if (ratio <= 0.6) return 'reports-heatmap-cell--3';
        if (ratio <= 0.8) return 'reports-heatmap-cell--4';
        return 'reports-heatmap-cell--5';
    };

    const heatmapTableRows = useMemo(() => {
        if (!reportData?.heatmapData) return [];
        const rows = [];
        for (const d of HEATMAP_DAYS) {
            for (const h of HEATMAP_SLOTS) {
                rows.push({
                    dia: d.label,
                    hora: `${String(h).padStart(2, '0')}h`,
                    agendamentos: Number(reportData.heatmapData?.[d.key]?.[h] || 0),
                });
            }
        }
        return rows;
    }, [reportData]);

    return (
        <div className="container navi-hub-page" style={{ paddingBottom: 20 }}>
            <div>
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
                                onClick={() => void fetchReport(true)}
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

            {showRefreshing ? (
                <div className="reports-sync-bar mt-3" role="status" aria-live="polite">
                    <Loader2 size={18} className="reports-spin" aria-hidden />
                    <span>Atualizando dados do servidor…</span>
                </div>
            ) : null}

            {error ? (
                <div className="reports-error-banner mt-3" role="alert">
                    <span>{error}</span>
                    <button type="button" className="btn-secondary" onClick={() => void fetchReport()}>
                        Tentar novamente
                    </button>
                </div>
            ) : null}

            {showInitialLoad && needsFunnelReport ? (
                <div className="reports-kpi-grid mt-4" role="status" aria-live="polite" aria-busy="true" aria-label="Carregando indicadores">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <ReportKpiCardSkeleton key={i} />
                    ))}
                </div>
            ) : null}

            {isPeriodTab ? (
            <div className="page-header-card">
                <div className="page-header-row navi-toolbar reports-filters-row reports-filters-row--split">
                    <FilterBar className="reports-period-block">
                        {presets.map((p) => (
                            <button
                                key={p.key}
                                type="button"
                                className={`filter-chip${preset === p.key ? ' is-active' : ''}`}
                                onClick={() => setPreset(p.key)}
                            >
                                {p.label}
                            </button>
                        ))}
                        {preset === 'custom' && (
                            <>
                                <DateInputField type="date" className="form-input navi-date-filter navi-control--toolbar" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Data inicial" />
                                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>—</span>
                                <DateInputField type="date" className="form-input navi-date-filter navi-control--toolbar" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Data final" />
                            </>
                        )}
                    </FilterBar>
                    {needsFunnelReport ? (
                    <>
                    <div className="reports-filters-divider" aria-hidden />
                    <div className="reports-segment-block">
                        <span className="reports-segment-label">Segmentar por:</span>
                        <div className="filter-group reports-selects-inline">
                        <select
                            value={originFilter}
                            onChange={(e) => setOriginFilter(e.target.value)}
                            aria-label="Filtrar por origem"
                            style={{ width: 'auto', minWidth: 'unset' }}
                        >
                            <option value="all">Origem</option>
                            {LEAD_ORIGIN.map((o) => (
                                <option key={o} value={o}>
                                    {o}
                                </option>
                            ))}
                        </select>
                        <select
                            value={profileFilter}
                            onChange={(e) => setProfileFilter(e.target.value)}
                            aria-label="Filtrar por perfil"
                            style={{ width: 'auto', minWidth: 'unset' }}
                        >
                            <option value="all">Perfil</option>
                            <option value="Adulto">Adulto</option>
                            <option value="Criança">Criança</option>
                            <option value="Juniores">Juniores</option>
                        </select>
                        </div>
                    </div>
                    {dateError ? <FieldError>{dateError}</FieldError> : null}
                    <div style={{ flex: 1 }} />
                    <DropdownMenu
                        open={exportOpen}
                        onOpenChange={setExportOpen}
                        align="end"
                        className="reports-export-wrap"
                    >
                        <button
                            type="button"
                            className="btn-secondary reports-export-btn"
                            onClick={() => !showInitialLoad && reportHasActivity && !error && setExportOpen((o) => !o)}
                            aria-expanded={exportOpen}
                            aria-haspopup="menu"
                            disabled={!reportData || loading || !reportHasActivity || Boolean(error)}
                            title={
                                error
                                    ? 'Corrija o carregamento do relatório antes de exportar.'
                                    : !reportData || loading
                                        ? 'Aguarde o carregamento dos dados'
                                        : !reportHasActivity
                                            ? 'Sem dados para exportar neste período'
                                            : 'Exportar relatório em CSV'
                            }
                        >
                            {loading ? 'Carregando...' : (
                                <>
                                    <Download size={16} aria-hidden />
                                    Exportar CSV
                                    <ChevronDown size={16} className={exportOpen ? 'reports-chevron-open' : ''} aria-hidden />
                                </>
                            )}
                        </button>
                        {exportOpen ? (
                            <DropdownMenuPanel className="reports-export-menu">
                                <DropdownMenuItem onClick={() => exportList('newLeads', 'novos-leads')}>
                                    Novos no período
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => exportList('scheduled', 'agendados')}>
                                    Agendados
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => exportList('completed', 'compareceram')}>
                                    Compareceram
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => exportList('missed', 'nao-compareceram')}>
                                    Não compareceram
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => exportList('converted', terms.reportsExportConvertedFileSlug)}>
                                    {terms.reportsMetricConvertedShort}
                                </DropdownMenuItem>
                            </DropdownMenuPanel>
                        ) : null}
                    </DropdownMenu>
                    </>
                    ) : null}
                </div>
            </div>
            ) : null}

            {needsFunnelReport ? (
            <>
            {!error && !showInitialLoad && leads.length === 0 && !leadsLoading ? (
                <div className="reports-empty card mt-4">
                    <EmptyState
                        insideCard
                        variant="compact"
                        tone="solid"
                        title={`Nenhum ${contactLabel.toLowerCase()} carregado`}
                        description={`Volte ao início ou ao funil e aguarde o carregamento. Se a ${terms.workspaceNoun} ainda não tiver ${contactsPlural.toLowerCase()}, cadastre o primeiro no menu.`}
                        role="status"
                    />
                </div>
            ) : !error && !showInitialLoad && !reportHasActivity ? (
                <div className="reports-empty card mt-4">
                    <EmptyState
                        insideCard
                        variant="compact"
                        tone="solid"
                        title="Sem atividade neste período"
                        description="Tente outro intervalo de datas ou remova os filtros de origem/perfil."
                        role="status"
                    />
                </div>
            ) : null}

            {activeTab === 'visao-geral' && !error && !showInitialLoad && reportData?.metrics ? (
                <ReportsVisaoGeralSection
                    reportData={reportData}
                    funnelStages={funnelStages}
                    ratesCards={ratesCards}
                    terms={terms}
                    hasFinance={hasFinance}
                    canViewFinance={canViewFinance}
                    financeSummary={financeKpi}
                    financeSummaryPrev={financeKpiPrev}
                    financeLoading={financeKpiLoading}
                    onFunnelDrill={setDrillKey}
                />
            ) : null}

            {activeTab === 'funil' && !error && !showInitialLoad && reportData?.metrics ? (
            <div className="reports-kpi-grid mt-4">
                <ReportKpiCard
                    label={`Novos ${contactsPlural.toLowerCase()}`}
                    value={reportData.metrics.newLeads?.current ?? 0}
                    trend={pctVar(reportData.metrics.newLeads?.current ?? 0, reportData.metrics.newLeads?.previous ?? 0)}
                    trendLabel="vs. período anterior"
                    tooltip={trendHintFor('newLeads', preset)}
                    icon={<UserPlus size={20} strokeWidth={2.25} />}
                    highlight={HIGHLIGHT_BY_COLOR.accent}
                    onClick={() => setDrillKey('newLeads')}
                />
                <ReportKpiCard
                    label="Agendados"
                    value={reportData.metrics.scheduled?.current ?? 0}
                    trend={pctVar(reportData.metrics.scheduled?.current ?? 0, reportData.metrics.scheduled?.previous ?? 0)}
                    trendLabel="vs. período anterior"
                    tooltip={trendHintFor('scheduled', preset)}
                    icon={<Calendar size={20} strokeWidth={2.25} />}
                    highlight={HIGHLIGHT_BY_COLOR.warning}
                    onClick={() => setDrillKey('scheduled')}
                />
                <ReportKpiCard
                    label="Compareceram"
                    value={reportData.metrics.completed?.current ?? reportData.metrics.showed?.current ?? 0}
                    trend={pctVar(
                        reportData.metrics.completed?.current ?? reportData.metrics.showed?.current ?? 0,
                        reportData.metrics.completed?.previous ?? reportData.metrics.showed?.previous ?? 0
                    )}
                    trendLabel="vs. período anterior"
                    tooltip={trendHintFor('completed', preset)}
                    icon={<CheckCircle2 size={20} strokeWidth={2.25} />}
                    highlight={HIGHLIGHT_BY_COLOR.success}
                    onClick={() => setDrillKey('completed')}
                />
                <ReportKpiCard
                    label={terms.reportsMetricConvertedShort}
                    value={reportData.metrics.converted?.current ?? 0}
                    trend={pctVar(reportData.metrics.converted?.current ?? 0, reportData.metrics.converted?.previous ?? 0)}
                    trendLabel="vs. período anterior"
                    tooltip={trendHintFor('converted', preset)}
                    icon={<Users size={20} strokeWidth={2.25} />}
                    highlight={HIGHLIGHT_BY_COLOR.purple}
                    onClick={() => setDrillKey('converted')}
                />
                <ReportKpiCard
                    label="Não compareceram"
                    value={reportData.metrics.missed?.current ?? 0}
                    trend={pctVar(reportData.metrics.missed?.current ?? 0, reportData.metrics.missed?.previous ?? 0)}
                    trendLabel="vs. período anterior"
                    tooltip={trendHintFor('missed', preset)}
                    icon={<XCircle size={20} strokeWidth={2.25} />}
                    highlight={HIGHLIGHT_BY_COLOR.danger}
                    onClick={() => setDrillKey('missed')}
                />
                <ReportKpiCard
                    label="Taxa de conversão"
                    value={`${reportData.metrics.conversionRate?.current ?? 0}%`}
                    trend={pctVar(reportData.metrics.conversionRate?.current ?? 0, reportData.metrics.conversionRate?.previous ?? 0)}
                    trendLabel="vs. período anterior"
                    tooltip={trendHintFor('conversionRate', preset)}
                    icon={<TrendingUp size={20} strokeWidth={2.25} />}
                    highlight={HIGHLIGHT_BY_COLOR.accent}
                />
            </div>
            ) : null}

            {activeTab === 'alunos' ? (
                <Suspense fallback={<PageSkeleton variant="cards" rows={4} />}>
                    <ReportsStudentsPanel
                        academyId={academyId}
                        rangeFrom={range.from}
                        rangeTo={range.to}
                        preset={preset}
                        studentMetrics={reportData?.studentMetrics}
                        loading={showInitialLoad || (loading && !reportData)}
                    />
                </Suspense>
            ) : null}

            {activeTab === 'funil' && !error && (showInitialLoad || loading) ? (
                <div className="card reports-evo-card mt-4 reports-chart-skeleton" style={{ minHeight: chartHeight + 80 }} aria-busy="true" />
            ) : null}

            {activeTab === 'funil' && !error && !showInitialLoad && !loading && reportData?.chart ? (
            <div className="card reports-evo-card mt-4">
                <div className="evo-header">
                    <h3 className="navi-section-heading evo-title">Evolução no período</h3>
                    <div className="evo-controls">
                        <div className="evo-group">
                            <span className="navi-eyebrow" style={{ alignSelf: 'center' }}>
                                Métrica
                            </span>
                            <div className="filter-strip">
                                <button type="button" className={`filter-chip ${chartMetric === 'new' ? 'is-active' : ''}`} onClick={() => setChartMetric('new')}>
                                    Novos leads
                                </button>
                                <button type="button" className={`filter-chip ${chartMetric === 'scheduled' ? 'is-active' : ''}`} onClick={() => setChartMetric('scheduled')}>
                                    Agendados
                                </button>
                                <button type="button" className={`filter-chip ${chartMetric === 'converted' ? 'is-active' : ''}`} onClick={() => setChartMetric('converted')}>
                                    {terms.reportsMetricConvertedShort}
                                </button>
                            </div>
                        </div>
                        <div className="evo-group">
                            <span className="navi-eyebrow" style={{ alignSelf: 'center' }}>
                                Agrupar
                            </span>
                            <div className="filter-strip">
                                <button type="button" className={`filter-chip ${chartMode === 'weekly' ? 'is-active' : ''}`} onClick={() => setChartMode('weekly')}>
                                    Semanal
                                </button>
                                <button type="button" className={`filter-chip ${chartMode === 'monthly' ? 'is-active' : ''}`} onClick={() => setChartMode('monthly')}>
                                    Mensal
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <p className="text-xs text-light" style={{ marginBottom: 10 }}>
                    Mesmo intervalo de <strong>
                        {range.from} — {range.to}
                    </strong>
                    , respeitando filtros de origem e perfil.
                </p>
                <div className="reports-chart-legend">
                    <span className="reports-chart-legend-item"><i className="reports-chart-dot is-current" aria-hidden /> Este período</span>
                    <span className="reports-chart-legend-item"><i className="reports-chart-dot is-previous" aria-hidden /> Período anterior</span>
                </div>
                <Suspense
                    fallback={
                        <div className="reports-chart-skeleton" style={{ minHeight: chartHeight }} aria-busy="true" />
                    }
                >
                    <ReportsFunilBarChart
                        chartHeight={chartHeight}
                        chartDataComparison={chartDataComparison}
                        hasChartData={Boolean(reportData?.chart?.length)}
                    />
                </Suspense>
            </div>
            ) : null}

            {activeTab === 'funil' && !error && (showInitialLoad || loading) ? (
                <div className="card reports-evo-card mt-4 reports-chart-skeleton" style={{ minHeight: chartHeight + 60 }} aria-busy="true" />
            ) : null}

            {activeTab === 'funil' && !error && !showInitialLoad && !loading ? (
            <div className="card reports-evo-card mt-4">
                <div className="evo-header">
                    <h3 className="navi-section-heading evo-title">Evolução da taxa de conversão</h3>
                </div>
                <Suspense
                    fallback={
                        <div className="reports-chart-skeleton" style={{ minHeight: chartHeight }} aria-busy="true" />
                    }
                >
                    <ReportsFunilConversionChart
                        chartHeight={chartHeight}
                        conversionChartData={conversionChartData}
                        lastConversionPoint={lastConversionPoint}
                    />
                </Suspense>
            </div>
            ) : null}

            {activeTab === 'funil' && !error && (showInitialLoad || loading) ? (
                <div className="reports-aux-grid mt-4">
                    <div className="card reports-evo-card reports-chart-skeleton" style={{ minHeight: 220 }} aria-busy="true" />
                    <div className="card reports-evo-card reports-chart-skeleton" style={{ minHeight: 160 }} aria-busy="true" />
                </div>
            ) : null}

            {activeTab === 'funil' && !error && !showInitialLoad && !loading ? (
            <div className="reports-aux-grid mt-4">
                <div className="card reports-evo-card">
                    <div className="evo-header">
                        <h3 className="navi-section-heading evo-title">Heatmap de horários</h3>
                        {reportData?.heatmapData ? (
                            <button
                                type="button"
                                className="btn-outline btn-sm navi-mobile-only"
                                onClick={() => setHeatmapTableView((v) => !v)}
                            >
                                {heatmapTableView ? 'Ver heatmap' : 'Ver tabela'}
                            </button>
                        ) : null}
                    </div>
                    {!reportData?.heatmapData ? (
                        <p className="text-small" style={{ color: 'var(--text-muted)' }}>
                            Dados insuficientes para este período.
                        </p>
                    ) : heatmapTableView ? (
                        <div className="reports-heatmap-table-wrap">
                            <table className="reports-heatmap-table">
                                <thead>
                                    <tr>
                                        <th>Dia</th>
                                        <th>Hora</th>
                                        <th>Agendamentos</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {heatmapTableRows
                                        .filter((r) => r.agendamentos > 0)
                                        .map((r) => (
                                            <tr key={`${r.dia}-${r.hora}`}>
                                                <td>{r.dia}</td>
                                                <td>{r.hora}</td>
                                                <td>{r.agendamentos}</td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="reports-heatmap">
                            <div className="reports-heatmap-head">
                                <span />
                                {HEATMAP_DAYS.map((d) => (
                                    <span key={d.label} className="reports-heatmap-day">{d.label}</span>
                                ))}
                            </div>
                            {HEATMAP_SLOTS.map((hour) => (
                                <div key={hour} className="reports-heatmap-row">
                                    <span className="reports-heatmap-hour">{String(hour).padStart(2, '0')}h</span>
                                    {HEATMAP_DAYS.map((d) => {
                                        const count = Number(reportData.heatmapData?.[d.key]?.[hour] || 0);
                                        return (
                                            <span
                                                key={`${d.key}-${hour}`}
                                                className={`reports-heatmap-cell ${heatmapLevelClass(count)}`}
                                                title={`${d.label} ${String(hour).padStart(2, '0')}h: ${count}`}
                                            />
                                        );
                                    })}
                                </div>
                            ))}
                            <div className="reports-heatmap-legend">Menos <span className="ti ti-arrow-right" aria-hidden /> Mais</div>
                        </div>
                    )}
                </div>
                <div className="card reports-evo-card">
                    <div className="evo-header">
                        <h3 className="navi-section-heading evo-title">Tempo médio no funil</h3>
                    </div>
                    {!reportData?.funnelTiming ? (
                        <p className="text-small" style={{ color: 'var(--text-muted)' }}>
                            Dados insuficientes para este período.
                        </p>
                    ) : (
                        <div className="reports-timing-grid">
                            <div className="reports-timing-col">
                                <div className="reports-timing-value">{reportData.funnelTiming.createdToScheduled ?? '—'}d</div>
                                <div className="reports-timing-label">{`${contactLabel} → Agendamento`}</div>
                            </div>
                            <div className="reports-timing-col">
                                <div className="reports-timing-value">{reportData.funnelTiming.scheduledToAttended ?? '—'}d</div>
                                <div className="reports-timing-label">Agendamento → Aula</div>
                            </div>
                            <div className="reports-timing-col">
                                <div className="reports-timing-value">{reportData.funnelTiming.attendedToConverted ?? '—'}d</div>
                                <div className="reports-timing-label">{terms.reportsTimingAttendedToEnrolled}</div>
                            </div>
                            <div className="reports-timing-col is-total">
                                <div className="reports-timing-value">{reportData.funnelTiming.total ?? '—'}d</div>
                                <div className="reports-timing-label">Total</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            ) : null}

            {activeTab === 'funil' && !error && !showInitialLoad ? (
                <details className="reports-methodology mt-4">
                    <summary className="reports-methodology-summary">
                        <Info size={16} aria-hidden />
                        Como calculamos
                    </summary>
                    <div className="reports-methodology-body">
                        <p>Todos os KPIs comparam o período selecionado contra o período imediatamente anterior de mesma duração.</p>
                        <p>Filtros de origem e perfil são aplicados tanto nos totais quanto no gráfico.</p>
                    </div>
                </details>
            ) : null}
            </>
            ) : null}

            {activeTab === 'financeiro' ? (
                <Suspense fallback={<PageSkeleton variant="cards" rows={4} />}>
                    <ReportsFinancePanel
                        academyId={academyId}
                        from={range.from}
                        to={range.to}
                        hasFinance={hasFinance}
                        isOwner={isOwner}
                    />
                </Suspense>
            ) : null}

            {activeTab === 'loja' ? (
                <Suspense fallback={<PageSkeleton variant="cards" rows={4} />}>
                    <ReportsLojaPanel academyId={academyId} from={range.from} to={range.to} hasSales={hasSales} />
                </Suspense>
            ) : null}

            {activeTab === 'estoque' ? (
                <Suspense fallback={<PageSkeleton variant="cards" rows={4} />}>
                    <ReportsEstoquePanel
                        academyId={academyId}
                        from={range.from}
                        to={range.to}
                        hasInventory={hasInventory}
                    />
                </Suspense>
            ) : null}

            {activeTab === 'movimentacoes' ? (
                <Suspense fallback={<PageSkeleton variant="cards" rows={4} />}>
                    <ReportsMovimentacoesPanel
                        academyId={academyId}
                        from={range.from}
                        to={range.to}
                        hasInventory={hasInventory}
                    />
                </Suspense>
            ) : null}

            {activeTab === 'operador' ? (
                <Suspense fallback={<PageSkeleton variant="cards" rows={4} />}>
                    <ReportsOperadorPanel
                        academyId={academyId}
                        from={range.from}
                        to={range.to}
                        hasSales={hasSales}
                    />
                </Suspense>
            ) : null}

            {drillKey ? (
                <div
                    className="reports-drill-overlay"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="reports-drill-title"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setDrillKey(null);
                    }}
                >
                    <div
                        className={`reports-drill-panel reports-drill-panel--${DRILL_PANEL_ACCENT[drillKey] || 'accent'}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="reports-drill-head">
                            <h3 id="reports-drill-title" className="reports-drill-title">
                                {drillLabels[drillKey]}
                            </h3>
                            <button type="button" className="reports-drill-close" onClick={() => setDrillKey(null)} aria-label="Fechar">
                                <X size={20} strokeWidth={2.25} />
                            </button>
                        </div>
                        <p className="text-xs text-light" style={{ marginBottom: 12 }}>
                            {drillList.length} {drillList.length === 1 ? 'pessoa' : 'pessoas'} · período {range.from} — {range.to}
                        </p>
                        <ul className="reports-drill-list">
                            {drillList.map((l) => (
                                <li key={l.id}>
                                    <Link to={`/lead/${l.id}`} className="reports-drill-link" onClick={() => setDrillKey(null)}>
                                        <span className="reports-drill-name">{l.name || 'Sem nome'}</span>
                                        <span className="reports-drill-meta">{[l.type, l.phone].filter(Boolean).join(' · ')}</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                        {drillList.length === 0 ? (
                            <EmptyState
                                variant="compact"
                                tone="dashed"
                                title="Nenhum dado no período selecionado"
                                description="Tente ajustar o intervalo de datas."
                                role="status"
                            />
                        ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default Reports;
