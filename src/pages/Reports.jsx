import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLeadStore, LEAD_STATUS, LEAD_ORIGIN } from '../store/useLeadStore';
import { hasAnyActivity } from '../lib/reportActivity.js';
import { account } from '../lib/appwrite';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
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


function downloadCsv(rows, filename) {
    const header = Object.keys(rows[0] || {});
    const csv = [
        header.join(';'),
        ...rows.map((r) => header.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(';')),
    ].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

const leadToCsvRow = (l) => ({
    nome: l.name || '',
    telefone: l.phone || '',
    tipo: l.type || '',
    origem: l.origin || '',
    status: l.status || '',
    data_aula: l.scheduledDate || '',
    horario: l.scheduledTime || '',
    criado_em: l.createdAt ? new Date(l.createdAt).toISOString() : '',
});

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
            {clickable ? <span className="reports-kpi-cta">Ver lista</span> : null}
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

const Reports = () => {
    const { leads, fetchLeads, fetchMoreLeads } = useLeadStore();
    const leadsLoading = useLeadStore((s) => s.loading);
    const loadingMore = useLeadStore((s) => s.loadingMore);
    const leadsHasMore = useLeadStore((s) => s.leadsHasMore);

    const [preset, setPreset] = useState('month');
    const [from, setFrom] = useState(ymd(startOfMonth(new Date())));
    const [to, setTo] = useState(ymd(endOfMonth(new Date())));
    const [chartMetric, setChartMetric] = useState('new');
    const [chartMode, setChartMode] = useState('weekly');
    const [originFilter, setOriginFilter] = useState('all');
    const [profileFilter, setProfileFilter] = useState('all');
    const [exportOpen, setExportOpen] = useState(false);
    const [drillKey, setDrillKey] = useState(null);
    const [listRefreshing, setListRefreshing] = useState(false);
    const exportWrapRef = useRef(null);

    const [reportData, setReportData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [dateError, setDateError] = useState(null);
    const [chartHeight, setChartHeight] = useState(() =>
        typeof window !== 'undefined' && window.innerWidth < 640 ? 200 : 260
    );
    const academyId = useLeadStore((s) => s.academyId);

    const showInitialLoad = loading && !reportData;
    const showRefreshing = loading && reportData;

    useEffect(() => {
        const onResize = () => setChartHeight(window.innerWidth < 640 ? 200 : 260);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        if (!exportOpen) return;
        const onMouseDown = (e) => {
            if (exportWrapRef.current && !exportWrapRef.current.contains(e.target)) {
                setExportOpen(false);
            }
        };
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, [exportOpen]);

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

    const fetchReport = async () => {
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
                    chartMode
                })
            });
            if (!res.ok) throw new Error('Falha na resposta do servidor');
            const data = await res.json();
            setReportData(data);
        } catch (e) {
            setError('Não foi possível carregar o relatório. Tente novamente.');
            setReportData(null);
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchReport();
    }, [range, originFilter, profileFilter, chartMode, academyId, preset]);

    const rangeSlug = `${range.from}_${range.to}`;

    const exportList = (listKey, slug) => {
        if (!reportData || !reportData.metrics[listKey]) return;
        const list = reportData.metrics[listKey].list || [];
        const rows = list.map(leadToCsvRow);
        if (rows.length === 0) {
            downloadCsv([{ mensagem: 'Nenhum registro no período com os filtros atuais' }], `relatorio-${slug}-vazio.csv`);
            return;
        }
        downloadCsv(rows, `relatorio-${slug}-${rangeSlug}.csv`);
        setExportOpen(false);
    };

    const handleRefreshList = async () => {
        if (listRefreshing || leadsLoading) return;
        setListRefreshing(true);
        try {
            await fetchLeads({ reset: true });
        } finally {
            setListRefreshing(false);
        }
    };

    const handleLoadMore = async () => {
        if (loadingMore || leadsLoading || !leadsHasMore) return;
        await fetchMoreLeads();
    };

    const reportHasActivity = hasAnyActivity(reportData);

    const drillList = reportData && drillKey ? reportData.metrics[drillKey]?.list || [] : [];

    return (
        <div className="container" style={{ paddingTop: 20, paddingBottom: 20 }}>
            <div className="flex justify-between items-center flex-wrap gap-3">
                <div>
                    <h1 className="navi-page-title">Relatórios</h1>
                    <p className="navi-eyebrow reports-header-eyebrow" style={{ marginTop: 6 }}>
                        <span>
                            Indicadores por período · {range.from} — {range.to}
                        </span>
                        {leadsHasMore ? (
                            <>
                                <span
                                    className="reports-partial-badge"
                                    title="Relatório pode refletir só os registros já carregados no app. Atualize a lista ou carregue mais na base de leads para aproximar o total."
                                >
                                    Parcial
                                </span>
                                <span className="reports-partial-inline-actions">
                                    <button type="button" className="btn-outline reports-refresh-mini" onClick={() => void handleRefreshList()} disabled={listRefreshing || leadsLoading}>
                                        <RefreshCw size={14} className={listRefreshing || leadsLoading ? 'reports-spin' : ''} aria-hidden />
                                        Atualizar lista
                                    </button>
                                    <button type="button" className="btn-outline reports-refresh-mini" onClick={() => void handleLoadMore()} disabled={loadingMore || leadsLoading}>
                                        {loadingMore ? 'Carregando…' : 'Carregar mais'}
                                    </button>
                                </span>
                            </>
                        ) : null}
                    </p>
                </div>
                <div className="reports-export-wrap" ref={exportWrapRef}>
                    <button
                        type="button"
                        className="btn-secondary reports-export-btn"
                        onClick={() => !showInitialLoad && reportHasActivity && !error && setExportOpen((o) => !o)}
                        aria-expanded={exportOpen}
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
                        <div className="reports-export-menu" role="menu">
                            <button type="button" className="reports-export-item" role="menuitem" onClick={() => exportList('newLeads', 'novos-leads')}>
                                Novos no período
                            </button>
                            <button type="button" className="reports-export-item" role="menuitem" onClick={() => exportList('scheduled', 'agendados')}>
                                Agendados
                            </button>
                            <button type="button" className="reports-export-item" role="menuitem" onClick={() => exportList('completed', 'compareceram')}>
                                Compareceram
                            </button>
                            <button type="button" className="reports-export-item" role="menuitem" onClick={() => exportList('missed', 'nao-compareceram')}>
                                Não compareceram
                            </button>
                            <button type="button" className="reports-export-item" role="menuitem" onClick={() => exportList('converted', 'matriculas')}>
                                Matrículas
                            </button>
                        </div>
                    ) : null}
                </div>
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

            {showInitialLoad ? (
                <div className="reports-kpi-grid mt-4" role="status" aria-live="polite" aria-busy="true" aria-label="Carregando indicadores">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="reports-kpi-card reports-kpi-skeleton" style={{ minHeight: 100 }} />
                    ))}
                </div>
            ) : null}

            <div className="card reports-filters-card mt-4" style={{ padding: 16 }}>
                <div className="filters-row">
                    <Calendar size={16} aria-hidden />
                    <div className="filter-strip">
                        {presets.map((p) => (
                            <button
                                key={p.key}
                                type="button"
                                className={`filter-pill ${preset === p.key ? 'active' : ''}`}
                                onClick={() => setPreset(p.key)}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    {preset === 'custom' && (
                        <div className="custom-range-wrap">
                            <div className="custom-range">
                                <input type="date" className="form-input" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Data inicial" />
                                <span>até</span>
                                <input type="date" className="form-input" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Data final" />
                            </div>
                            {dateError ? <span className="reports-field-error">{dateError}</span> : null}
                        </div>
                    )}
                </div>
                <div className="reports-secondary-filters">
                    <label className="reports-select-label">
                        <span>Origem</span>
                        <select className="form-input reports-select" value={originFilter} onChange={(e) => setOriginFilter(e.target.value)} aria-label="Filtrar por origem">
                            <option value="all">Todas</option>
                            {LEAD_ORIGIN.map((o) => (
                                <option key={o} value={o}>
                                    {o}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="reports-select-label">
                        <span>Perfil</span>
                        <select className="form-input reports-select" value={profileFilter} onChange={(e) => setProfileFilter(e.target.value)} aria-label="Filtrar por perfil">
                            <option value="all">Todos</option>
                            <option value="Adulto">Adulto</option>
                            <option value="Criança">Criança</option>
                            <option value="Juniores">Juniores</option>
                        </select>
                    </label>
                </div>
            </div>

            {!error && !showInitialLoad && leads.length === 0 && !leadsLoading ? (
                <div className="reports-empty card mt-4">
                    <p className="navi-section-heading" style={{ marginBottom: 8 }}>
                        Nenhum lead carregado
                    </p>
                    <p className="text-small" style={{ color: 'var(--text-muted)' }}>
                        Volte ao início ou ao funil e aguarde o carregamento. Se a academia ainda não tiver leads, cadastre o primeiro no menu.
                    </p>
                </div>
            ) : !error && !showInitialLoad && !reportHasActivity ? (
                <div className="reports-empty card mt-4">
                    <p className="navi-section-heading" style={{ marginBottom: 8 }}>
                        Sem atividade neste período
                    </p>
                    <p className="text-small" style={{ color: 'var(--text-muted)' }}>
                        Tente outro intervalo de datas ou remova os filtros de origem/perfil.
                    </p>
                </div>
            ) : null}

            {!error && !showInitialLoad && reportData?.metrics ? (
            <div className="reports-kpi-grid mt-4 animate-in">
                <Card
                    title="Novos leads"
                    value={reportData.metrics.newLeads.current}
                    variation={reportData.metrics.newLeads.var || reportData.metrics.newLeads.variation || pctVar(reportData.metrics.newLeads.current, reportData.metrics.newLeads.previous)}
                    icon={<UserPlus size={18} color="var(--v500)" strokeWidth={2} />}
                    color="accent"
                    trendHint={trendHintFor('newLeads', preset)}
                    onClick={() => setDrillKey('newLeads')}
                />
                <Card
                    title="Aulas agendadas"
                    value={reportData.metrics.scheduled.current}
                    variation={reportData.metrics.scheduled.var || reportData.metrics.scheduled.variation || pctVar(reportData.metrics.scheduled.current, reportData.metrics.scheduled.previous)}
                    icon={<Calendar size={18} color="var(--warn-text)" strokeWidth={2} />}
                    color="warning"
                    trendHint={trendHintFor('scheduled', preset)}
                    onClick={() => setDrillKey('scheduled')}
                />
                <Card
                    title="Compareceram"
                    value={reportData.metrics.completed?.current ?? reportData.metrics.showed?.current}
                    variation={reportData.metrics.completed ? pctVar(reportData.metrics.completed.current, reportData.metrics.completed.previous) : (reportData.metrics.showed?.var || reportData.metrics.showed?.variation)}
                    icon={<CheckCircle2 size={18} color="var(--success-dot)" strokeWidth={2} />}
                    color="success"
                    trendHint={trendHintFor('completed', preset)}
                    onClick={() => setDrillKey('completed')}
                />
                <Card
                    title="Não compareceram"
                    value={reportData.metrics.missed.current}
                    variation={reportData.metrics.missed.var || reportData.metrics.missed.variation || pctVar(reportData.metrics.missed.current, reportData.metrics.missed.previous)}
                    icon={<XCircle size={18} color="var(--danger)" strokeWidth={2} />}
                    color="danger"
                    trendHint={trendHintFor('missed', preset)}
                    onClick={() => setDrillKey('missed')}
                />
                <Card
                    title="Matrículas"
                    value={reportData.metrics.converted.current}
                    variation={reportData.metrics.converted.var || reportData.metrics.converted.variation || pctVar(reportData.metrics.converted.current, reportData.metrics.converted.previous)}
                    icon={<Users size={18} color="var(--v700)" strokeWidth={2} />}
                    color="purple"
                    trendHint={trendHintFor('converted', preset)}
                    onClick={() => setDrillKey('converted')}
                />
                <Card
                    title="Taxa de conversão"
                    value={`${reportData.metrics.conversionRate.current}%`}
                    variation={reportData.metrics.conversionRate.var || reportData.metrics.conversionRate.variation || pctVar(reportData.metrics.conversionRate.current, reportData.metrics.conversionRate.previous)}
                    icon={<TrendingUp size={18} color="var(--v500)" strokeWidth={2} />}
                    color="accent"
                    trendHint={trendHintFor('conversionRate', preset)}
                />
            </div>
            ) : null}

            {!error && !showInitialLoad && reportData?.chart ? (
            <div className="card reports-evo-card mt-4">
                <div className="evo-header">
                    <h3 className="navi-section-heading evo-title">Evolução no período</h3>
                    <div className="evo-controls">
                        <div className="evo-group">
                            <span className="navi-eyebrow" style={{ alignSelf: 'center' }}>
                                Métrica
                            </span>
                            <div className="filter-strip">
                                <button type="button" className={`filter-pill ${chartMetric === 'new' ? 'active' : ''}`} onClick={() => setChartMetric('new')}>
                                    Novos leads
                                </button>
                                <button type="button" className={`filter-pill ${chartMetric === 'scheduled' ? 'active' : ''}`} onClick={() => setChartMetric('scheduled')}>
                                    Agendados
                                </button>
                                <button type="button" className={`filter-pill ${chartMetric === 'converted' ? 'active' : ''}`} onClick={() => setChartMetric('converted')}>
                                    Matrículas
                                </button>
                            </div>
                        </div>
                        <div className="evo-group">
                            <span className="navi-eyebrow" style={{ alignSelf: 'center' }}>
                                Agrupar
                            </span>
                            <div className="filter-strip">
                                <button type="button" className={`filter-pill ${chartMode === 'weekly' ? 'active' : ''}`} onClick={() => setChartMode('weekly')}>
                                    Semanal
                                </button>
                                <button type="button" className={`filter-pill ${chartMode === 'monthly' ? 'active' : ''}`} onClick={() => setChartMode('monthly')}>
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
                {(!reportData || !reportData.chart || reportData.chart.length === 0) ? (
                    <p className="text-small" style={{ color: 'var(--text-muted)' }}>
                        Período muito curto ou inválido para agrupar.
                    </p>
                ) : (
                    <ResponsiveContainer width="100%" height={chartHeight}>
                        <BarChart data={reportData.chart}>
                            <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
                            <YAxis fontSize={11} tickLine={false} axisLine={false} />
                            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                            {chartMetric === 'new' && <Bar dataKey="newLeads" name="Novos leads" fill="var(--v500)" radius={[4, 4, 0, 0]} />}
                            {chartMetric === 'scheduled' && <Bar dataKey="scheduled" name="Agendados" fill="var(--warn-text)" radius={[4, 4, 0, 0]} />}
                            {chartMetric === 'converted' && <Bar dataKey="converted" name="Matrículas" fill="var(--success-text)" radius={[4, 4, 0, 0]} />}
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>
            ) : null}

            {!error && !showInitialLoad ? (
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
                                {DRILL_LABELS[drillKey]}
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
                        {drillList.length === 0 ? <p className="text-small" style={{ color: 'var(--text-muted)' }}>Nenhum registro.</p> : null}
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
          box-shadow: 0 1px 2px rgba(18, 16, 42, 0.04), 0 8px 28px rgba(91, 63, 191, 0.07);
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
          background: linear-gradient(90deg, var(--v500), rgba(124, 99, 214, 0.95));
        }
        .reports-kpi-card--warning::before {
          background: linear-gradient(90deg, #c9a227, #e8b84a);
        }
        .reports-kpi-card--success::before {
          background: linear-gradient(90deg, var(--success-dot), #5cbf8a);
        }
        .reports-kpi-card--danger::before {
          background: linear-gradient(90deg, var(--danger), var(--c300));
        }
        .reports-kpi-card--purple::before {
          background: linear-gradient(90deg, var(--v700), var(--v500));
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
        .reports-kpi-card--purple .reports-kpi-icon-wrap { background: var(--purple-light); }
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
        .reports-kpi-card--purple .reports-kpi-value { color: var(--v700); }
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
          font-size: 0.65rem;
          font-weight: 700;
          color: var(--text-muted);
          margin-top: 10px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .reports-kpi-card--clickable { cursor: pointer; }
        .reports-kpi-card--clickable:hover {
          transform: translateY(-3px);
          border-color: rgba(91, 63, 191, 0.22);
          box-shadow: 0 4px 12px rgba(18, 16, 42, 0.06), 0 16px 40px rgba(91, 63, 191, 0.12);
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
          box-shadow: 0 1px 2px rgba(18, 16, 42, 0.04), 0 8px 28px rgba(91, 63, 191, 0.07);
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
          background: linear-gradient(90deg, var(--v500), rgba(124, 99, 214, 0.95));
          border-radius: 16px 16px 0 0;
          opacity: 0.95;
        }
        .reports-filters-card { margin-top: 12px; }
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
          box-shadow: 0 1px 2px rgba(18, 16, 42, 0.04), 0 8px 28px rgba(91, 63, 191, 0.07);
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
          box-shadow: 0 1px 2px rgba(18, 16, 42, 0.04), 0 8px 24px rgba(91, 63, 191, 0.06);
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
          box-shadow: 0 1px 2px rgba(18, 16, 42, 0.04), 0 8px 24px rgba(91, 63, 191, 0.06);
        }
        .reports-export-wrap { position: relative; }
        .reports-export-btn { display: inline-flex; align-items: center; gap: 6px; }
        .reports-export-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .reports-chevron-open { transform: rotate(180deg); transition: transform 0.15s ease; }
        .reports-export-menu {
          position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; min-width: 220px;
          background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm);
          box-shadow: var(--shadow); padding: 6px;
        }
        .reports-export-item {
          display: block; width: 100%; text-align: left; padding: 10px 12px; border: none; background: none;
          font-size: 0.85rem; font-weight: 600; color: var(--text); cursor: pointer; border-radius: 6px; font-family: inherit;
        }
        .reports-export-item:hover { background: var(--accent-light); color: var(--accent); }
        .evo-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; gap: 12px; flex-wrap: wrap; }
        .evo-title { margin: 0; margin-right: 12px; }
        .evo-controls { display: flex; align-items: flex-start; gap: 20px; flex-wrap: wrap; }
        .evo-group { display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .reports-chart-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 0 -4px; padding: 0 4px; }
        .reports-drill-overlay {
          position: fixed; inset: 0; z-index: 60;
          background: rgba(18, 16, 42, 0.48);
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
            0 1px 2px rgba(18, 16, 42, 0.05),
            0 16px 48px rgba(91, 63, 191, 0.14),
            0 32px 80px rgba(18, 16, 42, 0.12);
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
          background: linear-gradient(90deg, var(--v500), rgba(124, 99, 214, 0.95));
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
          background: linear-gradient(90deg, var(--v700), var(--v500));
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
