import React, { useMemo, useState, useRef, useEffect } from 'react';
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
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
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
import ReportsFinancePanel from '../components/reports/ReportsFinancePanel.jsx';
import ReportsLojaPanel from '../components/reports/ReportsLojaPanel.jsx';
import ReportsEstoquePanel from '../components/reports/ReportsEstoquePanel.jsx';
import ReportsMovimentacoesPanel from '../components/reports/ReportsMovimentacoesPanel.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import ReportsOperadorPanel from '../components/reports/ReportsOperadorPanel.jsx';
import ReportsStudentsPanel from '../components/reports/ReportsStudentsPanel.jsx';
import { downloadCsv, leadToCsvRow } from '../lib/reportsExport.js';

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

const formatChartTickPt = (rawLabel) => {
    const raw = String(rawLabel || '').trim();
    if (!raw) return raw;
    let d = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) d = parseYMD(raw);
    else if (/^\d{2}\/\d{2}$/.test(raw)) {
        const [day, month] = raw.split('/').map(Number);
        d = new Date(new Date().getFullYear(), (month || 1) - 1, day || 1);
    }
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return raw;
    return d
        .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
        .replace('.', '');
};


const Card = ({ title, value, variation, icon, color, onClick, disabled, trendHint }) => {
    const isUp = typeof variation === 'number' ? variation >= 0 : true;
    const clickable = Boolean(onClick) && !disabled;
    const safeColor = ['accent', 'warning', 'success', 'danger', 'purple'].includes(color) ? color : 'accent';
    return (
        <div
            className={`reports-kpi-card reports-kpi-card--${safeColor}${clickable ? ' reports-kpi-card--clickable' : ''}`}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onClick={clickable ? onClick : undefined}
            onKeyDown={
                clickable
                    ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onClick();
                          }
                      }
                    : undefined
            }
        >
            <div className="reports-kpi-card-head">
                <span className="reports-kpi-label">{title}</span>
                <span className="reports-kpi-icon-wrap" aria-hidden>
                    {icon}
                </span>
            </div>
            <div className="reports-kpi-value">{value}</div>
            {typeof variation === 'number' && (
                <div className={`reports-kpi-trend ${isUp ? 'is-up' : 'is-down'}`}>
                    {isUp ? <TrendingUp size={16} strokeWidth={2.25} aria-hidden /> : <TrendingDown size={16} strokeWidth={2.25} aria-hidden />}
                    <span>
                        {isUp && variation > 0 ? '+' : ''}
                        {variation}%
                    </span>
                    <span className="reports-kpi-trend-hint" title={trendHint || undefined}>
                        vs. período anterior
                    </span>
                </div>
            )}
            {clickable ? <span className="reports-kpi-cta">Ver detalhes →</span> : null}
        </div>
    );
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

    const fetchReport = async (forceRefresh = false) => {
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
            setError(String(e?.message || 'Não foi possível carregar o relatório. Tente novamente.'));
            setReportData(null);
            console.error(e);
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    };

    useEffect(() => {
        if (!needsFunnelReport) return;
        void fetchReport(false);
    }, [range, chartMode, academyId, preset, needsFunnelReport]);

    useEffect(() => {
        if (!needsFunnelReport) return;
        if (filterDebounceSkip.current) {
            filterDebounceSkip.current = false;
            return;
        }
        const t = window.setTimeout(() => void fetchReport(false), 300);
        return () => window.clearTimeout(t);
    }, [originFilter, profileFilter, needsFunnelReport]);

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
            { key: 'scheduled', label: 'Agendados', current: scheduledCurrent, previous: scheduledPrev, drillKey: 'scheduled', prevBase: newLeadsCurrent, color: '#004466' },
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
    const heatmapSlots = [8, 10, 14, 17, 19, 20];
    const heatmapDays = [
        { key: 1, label: 'Seg' },
        { key: 2, label: 'Ter' },
        { key: 3, label: 'Qua' },
        { key: 4, label: 'Qui' },
        { key: 5, label: 'Sex' },
        { key: 6, label: 'Sáb' },
        { key: 0, label: 'Dom' },
    ];
    const heatmapMax = useMemo(() => {
        if (!reportData?.heatmapData) return 0;
        return heatmapDays.reduce((maxAcc, day) => {
            const dayMap = reportData.heatmapData?.[day.key] || {};
            return heatmapSlots.reduce((slotAcc, h) => Math.max(slotAcc, Number(dayMap[h] || 0)), maxAcc);
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
        for (const d of heatmapDays) {
            for (const h of heatmapSlots) {
                rows.push({
                    dia: d.label,
                    hora: `${String(h).padStart(2, '0')}h`,
                    agendamentos: Number(reportData.heatmapData?.[d.key]?.[h] || 0),
                });
            }
        }
        return rows;
    }, [reportData, heatmapDays, heatmapSlots]);

    return (
        <div className="container navi-hub-page" style={{ paddingTop: 20, paddingBottom: 20 }}>
            <div>
                <PageHeader
                    className="navi-page-header--flush"
                    title="Relatórios"
                    subtitle="Analise indicadores por período."
                    metaClassName="reports-header-eyebrow"
                    meta={
                        <>
                            <span>Período · {prettyRange}</span>
                            {needsFunnelReport && reportData?.snapshotUpdatedAt ? (
                                <span className="reports-snapshot-meta text-small text-muted">
                                    {' '}
                                    · Atualizado em{' '}
                                    {new Date(reportData.snapshotUpdatedAt).toLocaleString('pt-BR', {
                                        day: '2-digit',
                                        month: 'short',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    })}
                                    {reportData.fromSnapshot ? ' (cache)' : ''}
                                    <button
                                        type="button"
                                        className="btn-outline reports-refresh-mini"
                                        onClick={() => void fetchReport(true)}
                                        disabled={loading}
                                        style={{ marginLeft: 8 }}
                                    >
                                        <RefreshCw size={14} className={loading ? 'reports-spin' : ''} aria-hidden />
                                        Atualizar agora
                                    </button>
                                </span>
                            ) : null}
                        </>
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
                        <div key={i} className="reports-kpi-card reports-kpi-skeleton" style={{ minHeight: 100 }} />
                    ))}
                </div>
            ) : null}

            {isPeriodTab ? (
            <div className="page-header-card">
                <div className="page-header-row navi-toolbar reports-filters-row">
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
            <div className="reports-funnel-card mt-4 animate-in">
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
                                    <span className="reports-funnel-fill" style={{ width: `${stage.barPct}%`, background: stage.color }} />
                                </div>
                                <div className="reports-funnel-value">{stage.isPercent ? `${stage.current}%` : stage.current}</div>
                                <div className="reports-funnel-label">{stage.label}</div>
                                <div className={`reports-funnel-variation ${stage.variation >= 0 ? 'is-up' : 'is-down'}`}>
                                    {stage.variation >= 0 ? '+' : ''}{stage.variation}% vs período anterior
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
            </div>
            ) : null}

            {activeTab === 'funil' && !error && !showInitialLoad && reportData?.metrics ? (
            <div className="reports-kpi-grid mt-4">
                <Card
                    title={`Novos ${contactsPlural.toLowerCase()}`}
                    value={reportData.metrics.newLeads?.current ?? 0}
                    variation={pctVar(reportData.metrics.newLeads?.current ?? 0, reportData.metrics.newLeads?.previous ?? 0)}
                    icon={<UserPlus size={20} strokeWidth={2.25} />}
                    color="accent"
                    onClick={() => setDrillKey('newLeads')}
                    trendHint={trendHintFor('newLeads', preset)}
                />
                <Card
                    title="Agendados"
                    value={reportData.metrics.scheduled?.current ?? 0}
                    variation={pctVar(reportData.metrics.scheduled?.current ?? 0, reportData.metrics.scheduled?.previous ?? 0)}
                    icon={<Calendar size={20} strokeWidth={2.25} />}
                    color="warning"
                    onClick={() => setDrillKey('scheduled')}
                    trendHint={trendHintFor('scheduled', preset)}
                />
                <Card
                    title="Compareceram"
                    value={reportData.metrics.completed?.current ?? reportData.metrics.showed?.current ?? 0}
                    variation={pctVar(
                        reportData.metrics.completed?.current ?? reportData.metrics.showed?.current ?? 0,
                        reportData.metrics.completed?.previous ?? reportData.metrics.showed?.previous ?? 0
                    )}
                    icon={<CheckCircle2 size={20} strokeWidth={2.25} />}
                    color="success"
                    onClick={() => setDrillKey('completed')}
                    trendHint={trendHintFor('completed', preset)}
                />
                <Card
                    title={terms.reportsMetricConvertedShort}
                    value={reportData.metrics.converted?.current ?? 0}
                    variation={pctVar(reportData.metrics.converted?.current ?? 0, reportData.metrics.converted?.previous ?? 0)}
                    icon={<Users size={20} strokeWidth={2.25} />}
                    color="purple"
                    onClick={() => setDrillKey('converted')}
                    trendHint={trendHintFor('converted', preset)}
                />
                <Card
                    title="Não compareceram"
                    value={reportData.metrics.missed?.current ?? 0}
                    variation={pctVar(reportData.metrics.missed?.current ?? 0, reportData.metrics.missed?.previous ?? 0)}
                    icon={<XCircle size={20} strokeWidth={2.25} />}
                    color="danger"
                    onClick={() => setDrillKey('missed')}
                    trendHint={trendHintFor('missed', preset)}
                />
                <Card
                    title="Taxa de conversão"
                    value={`${reportData.metrics.conversionRate?.current ?? 0}%`}
                    variation={pctVar(reportData.metrics.conversionRate?.current ?? 0, reportData.metrics.conversionRate?.previous ?? 0)}
                    icon={<TrendingUp size={20} strokeWidth={2.25} />}
                    color="accent"
                    trendHint={trendHintFor('conversionRate', preset)}
                />
            </div>
            ) : null}

            {activeTab === 'alunos' ? (
                <ReportsStudentsPanel
                    studentMetrics={reportData?.studentMetrics}
                    loading={showInitialLoad || (loading && !reportData)}
                />
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
                {(!reportData || !reportData.chart || reportData.chart.length === 0) ? (
                    <p className="text-small" style={{ color: 'var(--text-muted)' }}>
                        Período muito curto ou inválido para agrupar.
                    </p>
                ) : (
                    <ResponsiveContainer width="100%" height={chartHeight}>
                        <BarChart data={chartDataComparison}>
                            <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} tickFormatter={formatChartTickPt} />
                            <YAxis hide />
                            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                            <Bar dataKey="current" name="Este período" fill="var(--petroleo)" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="previous" name="Período anterior" fill="#B8C9D9" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                )}
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
                {conversionChartData.length === 0 ? (
                    <p className="text-small" style={{ color: 'var(--text-muted)' }}>
                        Dados insuficientes para este período.
                    </p>
                ) : (
                    <>
                        <p className="text-xs text-light" style={{ marginBottom: 10 }}>
                            Último ponto: <strong>{Number(lastConversionPoint?.rate || 0).toFixed(1)}%</strong>
                        </p>
                        <ResponsiveContainer width="100%" height={chartHeight}>
                            <LineChart data={conversionChartData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                                <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
                                <YAxis hide />
                                <Tooltip cursor={{ stroke: 'var(--petroleo)', strokeOpacity: 0.2 }} formatter={(value) => `${Number(value || 0).toFixed(1)}%`} />
                                <Line type="monotone" dataKey="rate" name="Este período" stroke="var(--petroleo)" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                                <Line type="monotone" dataKey="previousRate" name="Período anterior" stroke="#755468" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 2 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </>
                )}
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
                                {heatmapDays.map((d) => (
                                    <span key={d.label} className="reports-heatmap-day">{d.label}</span>
                                ))}
                            </div>
                            {heatmapSlots.map((hour) => (
                                <div key={hour} className="reports-heatmap-row">
                                    <span className="reports-heatmap-hour">{String(hour).padStart(2, '0')}h</span>
                                    {heatmapDays.map((d) => {
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
                <ReportsFinancePanel
                    academyId={academyId}
                    from={range.from}
                    to={range.to}
                    hasFinance={hasFinance}
                    isOwner={isOwner}
                />
            ) : null}

            {activeTab === 'loja' ? (
                <ReportsLojaPanel academyId={academyId} from={range.from} to={range.to} hasSales={hasSales} />
            ) : null}

            {activeTab === 'estoque' ? (
                <ReportsEstoquePanel
                    academyId={academyId}
                    from={range.from}
                    to={range.to}
                    hasInventory={hasInventory}
                />
            ) : null}

            {activeTab === 'movimentacoes' ? (
                <ReportsMovimentacoesPanel
                    academyId={academyId}
                    from={range.from}
                    to={range.to}
                    hasInventory={hasInventory}
                />
            ) : null}

            {activeTab === 'operador' ? (
                <ReportsOperadorPanel
                    academyId={academyId}
                    from={range.from}
                    to={range.to}
                    hasSales={hasSales}
                />
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

            <style
                dangerouslySetInnerHTML={{
                    __html: `
        .reports-kpi-grid {
          display: grid;
          gap: 14px;
          grid-template-columns: 1fr;
        }
        @media (min-width: 520px) {
          .reports-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (min-width: 960px) {
          .reports-kpi-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        .reports-kpi-card {
          position: relative;
          padding: 18px 18px 16px;
          border-radius: 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          box-shadow: 0 1px 2px rgba(0, 4, 53, 0.04), 0 8px 28px rgba(0, 68, 102, 0.07);
          overflow: hidden;
          transition: transform 0.2s ease, box-shadow 0.22s ease, border-color 0.2s ease;
        }
        .reports-kpi-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          border-radius: 16px 16px 0 0;
          opacity: 0.95;
        }
        .reports-kpi-card--accent::before {
          background: linear-gradient(90deg, var(--petroleo), color-mix(in srgb, var(--petroleo) 75%, var(--cosmos)));
        }
        .reports-kpi-card--warning::before {
          background: linear-gradient(90deg, #c9a227, #e8b84a);
        }
        .reports-kpi-card--success::before {
          background: linear-gradient(90deg, var(--lima), color-mix(in srgb, var(--lima) 70%, var(--petroleo)));
        }
        .reports-kpi-card--danger::before {
          background: linear-gradient(90deg, var(--danger), var(--c300));
        }
        .reports-kpi-card--purple::before {
          background: linear-gradient(90deg, var(--dourado), color-mix(in srgb, var(--dourado) 70%, var(--cosmos)));
        }
        .reports-kpi-card-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
        }
        .reports-kpi-label {
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--text-secondary);
          line-height: 1.35;
          padding-right: 4px;
        }
        .reports-kpi-icon-wrap {
          width: 36px;
          height: 36px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .reports-kpi-card--accent .reports-kpi-icon-wrap { background: var(--accent-light); }
        .reports-kpi-card--warning .reports-kpi-icon-wrap { background: var(--warn-bg); }
        .reports-kpi-card--success .reports-kpi-icon-wrap { background: var(--success-bg); }
        .reports-kpi-card--danger .reports-kpi-icon-wrap { background: var(--danger-light); }
        .reports-kpi-card--purple .reports-kpi-icon-wrap { background: rgba(228, 181, 93, 0.12); }
        .reports-kpi-value {
          font-size: clamp(1.65rem, 4vw, 2rem);
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          line-height: 1.05;
          letter-spacing: -0.03em;
        }
        .reports-kpi-card--accent .reports-kpi-value { color: var(--v500); }
        .reports-kpi-card--warning .reports-kpi-value { color: var(--warn-text); }
        .reports-kpi-card--success .reports-kpi-value { color: var(--success-text); }
        .reports-kpi-card--danger .reports-kpi-value { color: var(--danger); }
        .reports-kpi-card--purple .reports-kpi-value { color: var(--dourado); }
        .reports-kpi-trend {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px 8px;
          margin-top: 12px;
          font-size: 0.8125rem;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
        .reports-kpi-trend.is-up { color: var(--success-text); }
        .reports-kpi-trend.is-down { color: var(--danger); }
        .reports-kpi-trend-hint {
          width: 100%;
          flex-basis: 100%;
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          color: var(--text-secondary);
          opacity: 0.75;
          margin-top: 2px;
        }
        .reports-kpi-cta {
          display: block;
          font-size: 0.76rem;
          font-weight: 700;
          color: var(--accent);
          margin-top: 10px;
          text-transform: none;
          letter-spacing: 0;
        }
        .reports-kpi-card--clickable { cursor: pointer; }
        .reports-kpi-card--clickable:hover {
          transform: translateY(-3px);
          border-color: rgba(0, 68, 102, 0.22);
          box-shadow: 0 4px 12px rgba(0, 4, 53, 0.06), 0 16px 40px rgba(0, 68, 102, 0.12);
        }
        .reports-kpi-card--clickable:focus {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .reports-kpi-card { transition: none; }
          .reports-kpi-card--clickable:hover { transform: none; }
        }
        .reports-filters-card,
        .reports-evo-card {
          border: 1px solid var(--border);
          box-shadow: 0 1px 2px rgba(0, 4, 53, 0.04), 0 8px 28px rgba(0, 68, 102, 0.07);
          border-radius: 16px;
        }
        .reports-evo-card {
          position: relative;
          overflow: hidden;
        }
        .reports-evo-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, var(--petroleo), color-mix(in srgb, var(--petroleo) 75%, var(--cosmos)));
          border-radius: 16px 16px 0 0;
          opacity: 0.95;
        }
        .reports-filters-card { margin-top: 12px; }
        .reports-filters-row { display: flex; align-items: center; gap: 10px; flex-wrap: nowrap; overflow-x: auto; }
        .reports-period-block { display: inline-flex; align-items: center; gap: 8px; flex-wrap: nowrap; }
        .reports-filters-divider { width: 1px; height: 30px; background: var(--color-border-tertiary, var(--border-light)); flex: 0 0 1px; }
        .reports-selects-inline { display: inline-flex; align-items: center; gap: 8px; flex-wrap: nowrap; }
        .filters-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .custom-range { display: inline-flex; align-items: center; gap: 8px; }
        .reports-secondary-filters { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border-light); }
        .reports-select-label { display: flex; flex-direction: column; gap: 4px; font-size: 0.72rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
        .reports-select { min-width: 160px; max-width: 100%; padding: 8px 10px; font-size: 0.875rem; }
        .reports-sync-bar {
          display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: var(--radius-sm);
          background: var(--accent-light); color: var(--accent); font-size: 0.85rem; font-weight: 600;
        }
        .reports-loading-card {
          display: flex; flex-direction: column; align-items: center; text-align: center;
          padding: 40px 24px; min-height: 200px; justify-content: center;
          border-radius: 16px;
          border: 1px solid var(--border);
          box-shadow: 0 1px 2px rgba(0, 4, 53, 0.04), 0 8px 28px rgba(0, 68, 102, 0.07);
        }
        .reports-loading-spinner { color: var(--accent); }
        .reports-partial-banner {
          margin-top: 12px; padding: 12px 14px; border-radius: var(--radius-sm);
          background: var(--warn-bg); color: var(--warn-text); font-size: 0.85rem; line-height: 1.45;
        }
        .reports-partial-banner p { margin: 0 0 10px; }
        .reports-partial-actions { display: flex; flex-wrap: wrap; gap: 8px; }
        .reports-refresh-mini { display: inline-flex; align-items: center; gap: 6px; font-size: 0.78rem; padding: 6px 12px; min-height: 34px; }
        .reports-spin { animation: reportsSpin 0.7s linear infinite; }
        @keyframes reportsSpin { to { transform: rotate(360deg); } }
        .reports-methodology {
          padding: 0; overflow: hidden;
          border-radius: 16px;
          border: 1px solid var(--border);
          box-shadow: 0 1px 2px rgba(0, 4, 53, 0.04), 0 8px 24px rgba(0, 68, 102, 0.06);
        }
        .reports-methodology-summary {
          display: flex; align-items: center; gap: 8px; padding: 12px 14px; cursor: pointer;
          font-weight: 700; font-size: 0.85rem; color: var(--text-secondary); list-style: none;
        }
        .reports-methodology-summary::-webkit-details-marker { display: none; }
        .reports-methodology-body { padding: 0 14px 14px; color: var(--text-secondary); }
        .reports-methodology-body p { margin: 0 0 8px; }
        .reports-methodology-body code { font-size: 0.8em; background: var(--surface-hover); padding: 1px 4px; border-radius: 4px; }
        .reports-empty {
          padding: 32px 22px; text-align: center;
          border-radius: 16px;
          border: 1px solid var(--border);
          box-shadow: 0 1px 2px rgba(0, 4, 53, 0.04), 0 8px 24px rgba(0, 68, 102, 0.06);
        }
        .reports-export-wrap { position: relative; }
        .reports-export-btn {
          display: inline-flex; align-items: center; gap: 6px;
          background: transparent;
          border: 1px solid var(--accent);
          color: var(--accent);
        }
        .reports-export-btn:hover {
          background: var(--accent-light);
          border-color: var(--accent);
          color: var(--accent);
        }
        .reports-export-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .reports-chevron-open { transform: rotate(180deg); transition: transform 0.15s ease; }
        .reports-export-menu { z-index: 20; min-width: 220px; }
        .reports-export-menu .navi-menu__item { font-size: 0.85rem; font-weight: 600; }
        .reports-export-menu .navi-menu__item:hover { background: var(--accent-light); color: var(--accent); }
        .reports-funnel-card {
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 14px;
          background: var(--surface);
          box-shadow: 0 1px 2px rgba(0, 4, 53, 0.04), 0 8px 24px rgba(0, 68, 102, 0.06);
        }
        .reports-funnel-row {
          display: flex;
          align-items: stretch;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 2px;
        }
        .reports-funnel-stage {
          min-width: 170px;
          border: 1px solid var(--border-light);
          border-radius: 12px;
          background: var(--surface);
          padding: 10px;
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-family: inherit;
        }
        .reports-funnel-stage.is-clickable { cursor: pointer; }
        .reports-funnel-stage:not(.is-clickable) { cursor: default; }
        .reports-funnel-track { width: 100%; height: 6px; border-radius: 999px; background: var(--surface-hover); overflow: hidden; }
        .reports-funnel-fill { display: block; height: 100%; border-radius: 999px; }
        .reports-funnel-value { font-size: 26px; font-weight: 500; color: var(--text); line-height: 1; }
        .reports-funnel-label { font-size: 11px; color: var(--text-secondary); }
        .reports-funnel-variation { font-size: 11px; }
        .reports-funnel-variation.is-up { color: var(--success); }
        .reports-funnel-variation.is-down { color: var(--danger); }
        .reports-funnel-relative {
          display: inline-flex; align-self: flex-start;
          font-size: 10px; color: var(--text-secondary);
          background: var(--surface-hover); border: 1px solid var(--border-light);
          border-radius: 999px; padding: 2px 7px;
        }
        .reports-funnel-arrow {
          display: inline-flex;
          align-items: center;
          color: var(--text-muted);
          font-size: 16px;
        }
        .reports-rates-grid {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }
        .reports-rate-card {
          background: var(--color-background-secondary, var(--surface-hover));
          border: 1px solid var(--border-light);
          border-radius: 12px;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .reports-rate-card .ti { font-size: 16px; line-height: 1; }
        .reports-rate-value { font-size: 22px; font-weight: 600; color: var(--text); line-height: 1.1; }
        .reports-rate-label { font-size: 11px; color: var(--text-secondary); }
        .reports-rate-insight { font-size: 11px; color: var(--text-muted); line-height: 1.35; }
        .reports-chart-legend { display: flex; align-items: center; gap: 16px; margin-bottom: 8px; }
        .reports-chart-legend-item { font-size: 11px; color: var(--text-secondary); display: inline-flex; align-items: center; gap: 6px; }
        .reports-chart-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
        .reports-chart-dot.is-current { background: var(--petroleo); }
        .reports-chart-dot.is-previous { background: #B8C9D9; }
        .reports-aux-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .reports-heatmap {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .reports-heatmap-head,
        .reports-heatmap-row {
          display: grid;
          grid-template-columns: 38px repeat(7, minmax(18px, 1fr));
          gap: 6px;
          align-items: center;
        }
        .reports-heatmap-day {
          font-size: 10px;
          color: var(--text-secondary);
          text-align: center;
          font-weight: 600;
        }
        .reports-heatmap-hour {
          font-size: 10px;
          color: var(--text-muted);
          font-weight: 600;
        }
        .reports-heatmap-cell {
          height: 20px;
          border-radius: 6px;
          border: 0.5px solid color-mix(in srgb, var(--v500) 14%, transparent);
        }
        .reports-heatmap-cell--0 { background: var(--v50); }
        .reports-heatmap-cell--1 { background: color-mix(in srgb, var(--v200) 35%, var(--v50)); }
        .reports-heatmap-cell--2 { background: color-mix(in srgb, var(--v200) 65%, var(--v50)); }
        .reports-heatmap-cell--3 { background: var(--v200); }
        .reports-heatmap-cell--4 { background: color-mix(in srgb, var(--v500) 55%, var(--v200)); }
        .reports-heatmap-cell--5 { background: var(--v500); }
        .reports-heatmap-table { width: 100%; font-size: 12px; border-collapse: collapse; }
        .reports-heatmap-table th,
        .reports-heatmap-table td { padding: 6px 8px; border-bottom: 1px solid var(--border-light); text-align: left; }
        .reports-chart-skeleton {
          background: linear-gradient(90deg, var(--surface-hover) 25%, var(--v50) 50%, var(--surface-hover) 75%);
          background-size: 200% 100%;
          animation: reports-shimmer 1.2s ease-in-out infinite;
          border-radius: 12px;
        }
        @keyframes reports-shimmer {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
        .reports-kpi-info {
          margin-left: 4px;
          padding: 0;
          border: none;
          background: none;
          color: var(--text-muted);
          cursor: help;
          vertical-align: middle;
        }
        .reports-snapshot-meta { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 4px; margin-left: 8px; }
        .navi-mobile-only { display: none; }
        @media (max-width: 640px) {
          .navi-mobile-only { display: inline-flex; }
        }
        .reports-heatmap-legend {
          margin-top: 4px;
          font-size: 11px;
          color: var(--text-secondary);
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .reports-timing-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0;
          border: 1px solid var(--border-light);
          border-radius: 12px;
          overflow: hidden;
        }
        .reports-timing-col {
          padding: 12px 10px;
          border-right: 1px solid var(--border-light);
          background: var(--surface);
        }
        .reports-timing-col:last-child { border-right: none; }
        .reports-timing-col.is-total { background: var(--accent-light); }
        .reports-timing-value {
          font-size: 24px;
          font-weight: 600;
          color: var(--text);
          line-height: 1.1;
        }
        .reports-timing-col.is-total .reports-timing-value { color: var(--accent); }
        .reports-timing-label {
          margin-top: 6px;
          font-size: 11px;
          color: var(--text-secondary);
        }
        .evo-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; gap: 12px; flex-wrap: wrap; }
        .evo-title { margin: 0; margin-right: 12px; }
        .evo-controls { display: flex; align-items: flex-start; gap: 20px; flex-wrap: wrap; }
        .evo-group { display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .reports-chart-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 0 -4px; padding: 0 4px; }
        .reports-drill-overlay {
          position: fixed; inset: 0; z-index: 60;
          background: rgba(0, 4, 53, 0.48);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          display: flex; align-items: flex-end; justify-content: center; padding: 16px;
          animation: reportsDrillFade 0.2s ease;
        }
        @keyframes reportsDrillFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes reportsDrillUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @media (min-width: 640px) {
          .reports-drill-overlay { align-items: center; }
        }
        .reports-drill-panel {
          position: relative;
          width: 100%; max-width: 28rem; max-height: min(72vh, 540px);
          overflow: hidden;
          display: flex; flex-direction: column;
          padding: 18px 18px 16px;
          border-radius: 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          box-shadow:
            0 1px 2px rgba(0, 4, 53, 0.05),
            0 16px 48px rgba(0, 68, 102, 0.14),
            0 32px 80px rgba(0, 4, 53, 0.12);
          animation: reportsDrillUp 0.28s ease;
        }
        .reports-drill-panel::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          border-radius: 16px 16px 0 0;
          opacity: 0.95;
        }
        .reports-drill-panel--accent::before {
          background: linear-gradient(90deg, var(--petroleo), color-mix(in srgb, var(--petroleo) 75%, var(--cosmos)));
        }
        .reports-drill-panel--warning::before {
          background: linear-gradient(90deg, #c9a227, #e8b84a);
        }
        .reports-drill-panel--success::before {
          background: linear-gradient(90deg, var(--success-dot), #5cbf8a);
        }
        .reports-drill-panel--danger::before {
          background: linear-gradient(90deg, var(--danger), var(--c300));
        }
        .reports-drill-panel--purple::before {
          background: linear-gradient(90deg, var(--dourado), color-mix(in srgb, var(--dourado) 70%, var(--cosmos)));
        }
        .reports-drill-head {
          display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
          margin-bottom: 6px;
        }
        .reports-drill-title {
          margin: 0;
          font-size: 1.05rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--text);
          line-height: 1.25;
          padding-right: 8px;
        }
        .reports-drill-close {
          flex-shrink: 0;
          width: 40px; height: 40px;
          display: flex; align-items: center; justify-content: center;
          border: none; border-radius: 12px;
          background: var(--accent-light);
          color: var(--accent);
          cursor: pointer;
          transition: background 0.15s ease, transform 0.12s ease;
        }
        .reports-drill-close:hover { background: var(--v100); transform: scale(1.03); }
        .reports-drill-close:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .reports-drill-list {
          list-style: none; margin: 0; padding: 4px 0 0;
          overflow-y: auto; flex: 1; min-height: 0;
          border-top: 1px solid var(--border-light);
        }
        .reports-drill-list li { border-bottom: 1px solid var(--border-light); }
        .reports-drill-list li:last-child { border-bottom: none; }
        .reports-drill-link {
          display: flex; flex-direction: column; gap: 3px;
          padding: 12px 6px; margin: 0 -6px;
          text-decoration: none; color: inherit;
          border-radius: 10px;
          transition: background 0.12s ease;
        }
        .reports-drill-link:hover { background: var(--surface-hover); }
        .reports-drill-name { font-weight: 700; font-size: 0.9rem; color: var(--text); }
        .reports-drill-meta { font-size: 0.75rem; color: var(--text-muted); font-weight: 500; }
        @media (max-width: 959px) {
          .reports-filters-row { flex-wrap: wrap; overflow-x: visible; }
          .reports-filters-divider { display: none; }
          .reports-rates-grid { grid-template-columns: 1fr; }
          .reports-aux-grid { grid-template-columns: 1fr; }
          .reports-timing-grid { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 520px) {
          .reports-timing-grid { grid-template-columns: 1fr; }
          .reports-timing-col { border-right: none; border-bottom: 1px solid var(--border-light); }
          .reports-timing-col:last-child { border-bottom: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .reports-drill-overlay, .reports-drill-panel { animation: none; }
          .reports-drill-close:hover { transform: none; }
        }
      `,
                }}
            />
        </div>
    );
};

export default Reports;
