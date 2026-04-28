import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { useNavigate } from 'react-router-dom';
import { databases, DB_ID, ACADEMIES_COL } from '../lib/appwrite';
import { DEFAULT_WHATSAPP_TEMPLATES } from '../../lib/whatsappTemplateDefaults.js';
import { sendWhatsappTemplateOutbound } from '../lib/outboundWhatsappTemplate.js';
import { Plus, CheckCircle, XCircle, Calendar, Clock, ChevronRight, MessageCircle, RefreshCcw, Edit3, TrendingUp, TrendingDown, List, LayoutGrid } from 'lucide-react';
import { PIPELINE_WAITING_DECISION_STAGE, PIPELINE_STAGES } from '../constants/pipeline.js';
import { addLeadEvent } from '../lib/leadEvents.js';
import { buildSchedulePatch } from '../lib/scheduleHelpers.js';
import { isLeadScheduledForExperimental } from '../lib/leadStageRules.js';
import { useSlaAlerts } from '../lib/useSlaAlerts.js';
import NlCommandBar, { NlCommandBarTrigger } from '../components/NlCommandBar';
import { LEADS_REFRESH } from '../lib/leadTimelineEvents.js';
import ScheduleModal from '../components/ScheduleModal.jsx';
import AgendaCalendarWeek from '../components/AgendaCalendarWeek.jsx';
import { getAcademyQuickTimeChipValues } from '../lib/academyQuickTimes.js';
const DEFAULT_STAGE_SLA_DAYS = 3;
const DAY_FILTERS = [
    { key: 'today', label: 'Hoje' },
    { key: 'tomorrow', label: 'Amanhã' },
    {
        key: 'week',
        label: 'Semana',
        title: 'Próximos 7 dias corridos a partir de hoje (não é semana civil segunda–domingo).',
    },
    { key: 'all', label: 'Todos' },
];
/** Follow-ups com aula há >= N dias somem desta agenda e ficam só no Kanban */
const FOLLOWUP_AGENDA_MAX_DAYS = 7;
const Dashboard = () => {
    const navigate = useNavigate();
    const { leads, loading, fetchLeads, academyId, academyList, leadsError } = useLeadStore();
    const addToast = useUiStore((s) => s.addToast);
    const [dateFilter, setDateFilter] = useState('all');
    const [agendaView, setAgendaView] = useState(() => {
        try {
            if (typeof window === 'undefined') return 'list';
            const v = localStorage.getItem('nave_agenda_view');
            return v === 'week' ? 'week' : 'list';
        } catch {
            return 'list';
        }
    });
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [scheduleModalLead, setScheduleModalLead] = useState(null);
    const [dashboardQuickTimes, setDashboardQuickTimes] = useState([]);

    const [academyWa, setAcademyWa] = useState({
        name: '',
        zapster_instance_id: '',
        templates: DEFAULT_WHATSAPP_TEMPLATES
    });
    const [academyWaLoadFailed, setAcademyWaLoadFailed] = useState(false);
    const [savingPresence, setSavingPresence] = useState({});
    const [nlOpen, setNlOpen] = useState(false);
    const hiddenAtRef = useRef(null);

    const pipelineStagesNl = useMemo(() => {
        const fixed = PIPELINE_STAGES.map((s) => ({ id: s, label: s, slaDays: DEFAULT_STAGE_SLA_DAYS }));
        const acad = (academyList || []).find((a) => a.id === academyId) || {};
        let conf = acad?.stagesConfig;
        if (!conf) return fixed;
        try {
            if (typeof conf === 'string') conf = JSON.parse(conf);
            if (!Array.isArray(conf)) return fixed;
            const normalized = conf
                .filter(Boolean)
                .map((s) => {
                    if (typeof s === 'string') return { id: String(s).trim(), label: String(s).trim(), slaDays: DEFAULT_STAGE_SLA_DAYS };
                    const id = String(s?.id || '').trim();
                    const label = String(s?.label || s?.id || '').trim();
                    const slaDays = Number.isFinite(Number(s?.slaDays)) ? Number(s.slaDays) : DEFAULT_STAGE_SLA_DAYS;
                    return id ? { id, label: label || id, slaDays } : null;
                })
                .filter(Boolean);
            return normalized.length > 0 ? normalized : fixed;
        } catch {
            return fixed;
        }
    }, [academyList, academyId]);

    useEffect(() => {
        try {
            localStorage.setItem('nave_agenda_view', agendaView);
        } catch {
            /* ignore quota / private mode */
        }
    }, [agendaView]);

    useEffect(() => {
        if (academyId) {
            fetchLeads();
        }
    }, [academyId]);

    useEffect(() => {
        if (!academyId) return;
        const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                hiddenAtRef.current = Date.now();
                return;
            }
            if (document.visibilityState === 'visible') {
                const hiddenAt = hiddenAtRef.current;
                if (!hiddenAt) return;
                const elapsed = Date.now() - hiddenAt;
                hiddenAtRef.current = null;
                if (elapsed > REFRESH_THRESHOLD_MS) {
                    void fetchLeads({ reset: false });
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [academyId, fetchLeads]);

    useEffect(() => {
        function onLeadsRefresh() {
            if (!academyId) return;
            void fetchLeads({ reset: true });
        }
        if (typeof window === 'undefined') return undefined;
        window.addEventListener(LEADS_REFRESH, onLeadsRefresh);
        return () => window.removeEventListener(LEADS_REFRESH, onLeadsRefresh);
    }, [academyId, fetchLeads]);

    useEffect(() => {
        if (!academyId) return;
        let cancelled = false;
        setAcademyWaLoadFailed(false);
        databases
            .getDocument(DB_ID, ACADEMIES_COL, academyId)
            .then((doc) => {
                if (cancelled) return;
                let parsed = {};
                try {
                    const raw = doc.whatsappTemplates;
                    const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
                    if (p && typeof p === 'object' && !Array.isArray(p)) parsed = p;
                } catch {
                    parsed = {};
                }
                setAcademyWaLoadFailed(false);
                setAcademyWa({
                    name: String(doc?.name || '').trim(),
                    zapster_instance_id: String(doc?.zapster_instance_id || '').trim(),
                    templates: { ...DEFAULT_WHATSAPP_TEMPLATES, ...parsed }
                });
                setDashboardQuickTimes(getAcademyQuickTimeChipValues(doc));
            })
            .catch(() => {
                if (!cancelled) {
                    setAcademyWaLoadFailed(true);
                    setAcademyWa({ name: '', zapster_instance_id: '', templates: DEFAULT_WHATSAPP_TEMPLATES });
                    setDashboardQuickTimes(getAcademyQuickTimeChipValues(null));
                }
            });
        return () => {
            cancelled = true;
        };
    }, [academyId]);

    const handleRefresh = async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        try {
            await fetchLeads();
        } finally {
            setTimeout(() => setIsRefreshing(false), 300);
        }
    };

    const openScheduleModal = (lead) => {
        setScheduleModalLead(lead);
    };

    const onConfirmScheduleDashboard = async ({ date, time, note }) => {
        if (!scheduleModalLead) return;
        const st = useLeadStore.getState();
        const modalLead = scheduleModalLead;
        const patch = buildSchedulePatch(modalLead, { date, time });
        const textBody = String(note || '').trim() || 'Aula experimental agendada';
        const acad = (st.academyList || []).find((a) => a.id === st.academyId) || {};
        const permCtx = { ownerId: acad.ownerId, teamId: acad.teamId, userId: st.userId || '' };
        try {
            try {
                await addLeadEvent({
                    academyId: st.academyId,
                    leadId: modalLead.id,
                    type: 'schedule',
                    to: date,
                    text: textBody,
                    createdBy: st.userId || 'user',
                    permissionContext: permCtx,
                    payloadJson: { date, time },
                });
                await st.updateLead(modalLead.id, patch);
            } catch {
                await st.updateLead(modalLead.id, patch);
            }
            addToast({ type: 'success', message: 'Aula agendada com sucesso.' });
        } catch (e) {
            addToast({ type: 'error', message: 'Erro ao atualizar agendamento.' });
            throw e;
        }
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + 7);

    // Agenda with date filter
    const toDateTime = (lead) => {
        const base = lead.scheduledDate || lead.createdAt || '';
        if (!base) return new Date(8640000000000000); // max date
        const [y, m, d] = base.split('T')[0].split('-').map(Number);
        let hh = 23, mm = 59;
        if (lead.scheduledTime && /^\d{2}:\d{2}$/.test(lead.scheduledTime)) {
            const [h, mi] = lead.scheduledTime.split(':').map(Number);
            if (Number.isFinite(h) && Number.isFinite(mi)) {
                hh = h; mm = mi;
            }
        }
        return new Date(y, (m || 1) - 1, d || 1, hh, mm, 0, 0);
    };

    const excludeImportedOrigin = (l) => String(l?.origin || '').trim() !== 'Planilha';

    const allScheduled = (leads || [])
        .filter(isLeadScheduledForExperimental)
        .sort((a, b) => toDateTime(a) - toDateTime(b));

    const agendaLeads = allScheduled
        .filter((lead) => {
            if (dateFilter === 'all') return true;
            if (!lead.scheduledDate) return false;

            // Use YYYY-MM-DD from lead.scheduledDate directly for comparison to avoid TZ shifts
            const [y, m, d] = lead.scheduledDate.split('-').map(Number);
            const leadDate = new Date(y, m - 1, d);

            if (dateFilter === 'today') return leadDate.toDateString() === today.toDateString();
            if (dateFilter === 'tomorrow') return leadDate.toDateString() === tomorrow.toDateString();
            if (dateFilter === 'week') return leadDate >= today && leadDate < weekEnd;
            return true;
        });

    // Follow-ups: dias desde a data da aula experimental; na agenda, só os primeiros 7 dias; mais recentes no topo
    const followUpsAll = leads
        .filter(l => excludeImportedOrigin(l) && (l.status === LEAD_STATUS.COMPLETED || l.status === LEAD_STATUS.MISSED))
        .map(l => {
            const classDate = l.scheduledDate ? new Date(l.scheduledDate + 'T00:00:00') : new Date(l.createdAt);
            const diffMs = new Date() - classDate;
            const daysAgo = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            return { ...l, daysAgo };
        });
    const followUpsKanbanOnlyCount = followUpsAll.filter((l) => l.daysAgo >= FOLLOWUP_AGENDA_MAX_DAYS).length;
    const followUps = followUpsAll
        .filter((l) => l.daysAgo < FOLLOWUP_AGENDA_MAX_DAYS)
        .sort((a, b) => {
            if (a.daysAgo !== b.daysAgo) return a.daysAgo - b.daysAgo;
            const ta = new Date(a.statusChangedAt || a.pipelineStageChangedAt || a.createdAt || 0).getTime();
            const tb = new Date(b.statusChangedAt || b.pipelineStageChangedAt || b.createdAt || 0).getTime();
            return tb - ta;
        });
    const slaAlerts = useSlaAlerts(leads, pipelineStagesNl);
    const stalledLeads = useMemo(
        () =>
            (leads || [])
                .filter((lead) => Boolean(slaAlerts[lead.id]))
                .map((lead) => ({ ...lead, slaAlert: slaAlerts[lead.id] }))
                .sort((a, b) => {
                    const d = (b.slaAlert?.daysInStage || 0) - (a.slaAlert?.daysInStage || 0);
                    if (d !== 0) return d;
                    return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
                }),
        [leads, slaAlerts]
    );

    const getUrgency = (days) => {
        if (days >= 5) return { level: 'critical', label: 'Urgente', color: 'var(--danger)' };
        if (days >= 3) return { level: 'high', label: 'Atenção', color: 'var(--warning)' };
        if (days >= 1) return { level: 'medium', label: 'Acompanhar', color: 'var(--accent)' };
        return { level: 'low', label: 'Recente', color: 'var(--success)' };
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr + 'T00:00:00');
        if (d.toDateString() === today.toDateString()) return 'Hoje';
        if (d.toDateString() === tomorrow.toDateString()) return 'Amanhã';
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    };

    // Count per filter
    const countFor = (key) => {
        if (key === 'all') return allScheduled.length;
        return allScheduled.filter(l => {
            if (!l.scheduledDate) return false;
            const [y, m, d] = l.scheduledDate.split('-').map(Number);
            const leadDate = new Date(y, m - 1, d);
            if (key === 'today') return leadDate.toDateString() === today.toDateString();
            if (key === 'tomorrow') return leadDate.toDateString() === tomorrow.toDateString();
            if (key === 'week') return leadDate >= today && leadDate < weekEnd;
            return false;
        }).length;
    };

    const scheduledOutsideFilter =
        !loading &&
        agendaLeads.length === 0 &&
        allScheduled.length > 0 &&
        dateFilter !== 'all';

    const sendDashboardTemplate = async (lead, templateKey) => {
        await sendWhatsappTemplateOutbound({
            lead,
            academyId,
            academyName: academyWa.name,
            templateKey,
            templatesMap: academyWa.templates,
            zapsterInstanceId: academyWa.zapster_instance_id,
            onToast: (t) => addToast(t)
        });
    };

    const handleWhatsApp = (lead) => {
        const key = lead?.status === LEAD_STATUS.MISSED ? 'missed' : 'post_class';
        void sendDashboardTemplate(lead, key);
    };

    const handleWhatsAppScheduled = (lead) => {
        void sendDashboardTemplate(lead, 'confirm');
    };

    const markLeadAttended = async (lead) => {
        const k = `${lead.id}:attended`;
        setSavingPresence((p) => ({ ...p, [k]: true }));
        try {
            const st = useLeadStore.getState();
            const acad = (st.academyList || []).find((a) => a.id === st.academyId) || {};
            const permCtx = { ownerId: acad.ownerId, teamId: acad.teamId, userId: st.userId || '' };
            await addLeadEvent({
                academyId: st.academyId,
                leadId: lead.id,
                type: 'attended',
                from: lead.pipelineStage || lead.status || '',
                to: LEAD_STATUS.COMPLETED,
                createdBy: st.userId || 'user',
                permissionContext: permCtx
            });
            await st.updateLead(lead.id, {
                status: LEAD_STATUS.COMPLETED,
                pipelineStage: PIPELINE_WAITING_DECISION_STAGE,
                attendedAt: new Date().toISOString()
            });
            addToast({ type: 'success', message: 'Comparecimento registrado.' });
        } catch {
            addToast({ type: 'error', message: 'Erro ao registrar comparecimento.' });
        } finally {
            setSavingPresence((p) => {
                const n = { ...p };
                delete n[k];
                return n;
            });
        }
    };

    const markLeadMissed = async (lead) => {
        const k = `${lead.id}:missed`;
        setSavingPresence((p) => ({ ...p, [k]: true }));
        try {
            const st = useLeadStore.getState();
            const acad = (st.academyList || []).find((a) => a.id === st.academyId) || {};
            const permCtx = { ownerId: acad.ownerId, teamId: acad.teamId, userId: st.userId || '' };
            await addLeadEvent({
                academyId: st.academyId,
                leadId: lead.id,
                type: 'missed',
                from: lead.pipelineStage || lead.status || '',
                to: LEAD_STATUS.MISSED,
                createdBy: st.userId || 'user',
                permissionContext: permCtx
            });
            await st.updateLead(lead.id, {
                status: LEAD_STATUS.MISSED,
                pipelineStage: LEAD_STATUS.MISSED,
                missedAt: new Date().toISOString()
            });
            addToast({ type: 'success', message: 'Não compareceu registrado.' });
        } catch {
            addToast({ type: 'error', message: 'Erro ao registrar não compareceu.' });
        } finally {
            setSavingPresence((p) => {
                const n = { ...p };
                delete n[k];
                return n;
            });
        }
    };

    return (
        <div className="container" style={{ paddingTop: 20, paddingBottom: 20 }}>
            <div className={`reception-agenda-inner${agendaView === 'week' ? ' reception-agenda-inner--week' : ''} reception-agenda-inner--wide`}>
            <div className="animate-in">
                <h1 className="navi-page-title">Agenda da Recepção</h1>
                <p className="navi-eyebrow" style={{ marginTop: 6 }}>Controle de aulas experimentais e retornos</p>
            </div>

            {leadsError && (
                <div className="dashboard-error-banner" role="alert">
                    <span>Não foi possível carregar os dados.</span>
                    <button type="button" className="btn-secondary" onClick={() => void fetchLeads()}>
                        Tentar novamente
                    </button>
                </div>
            )}

            {loading ? (
                <div className="agenda-kpi-grid mt-4 animate-in" style={{ animationDelay: '0.05s' }} aria-busy="true" aria-label="Carregando indicadores">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="agenda-kpi-card agenda-kpi-skeleton" style={{ minHeight: 120 }} />
                    ))}
                </div>
            ) : (() => {
                const startOfWeek = (d) => { const dd = new Date(d); const day = dd.getDay(); const diff = (day + 6) % 7; dd.setDate(dd.getDate()-diff); dd.setHours(0,0,0,0); return dd; };
                const endOfWeek = (d) => { const dd = startOfWeek(d); dd.setDate(dd.getDate()+6); dd.setHours(23,59,59,999); return dd; };
                const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1, 0,0,0,0);
                const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999);
                const parseYMD = (s) => { if (!s) return null; const [Y,M,D] = s.split('-').map(Number); return new Date(Y,(M||1)-1,D||1); };
                const inRange = (ts,a,b) => { if (!ts) return false; const t = new Date(ts).getTime(); return t>=a.getTime() && t<=b.getTime(); };
                const now = new Date();
                const mFrom = startOfMonth(now), mTo = endOfMonth(now);
                const pmFrom = startOfMonth(new Date(now.getFullYear(), now.getMonth()-1, 1)), pmTo = endOfMonth(new Date(now.getFullYear(), now.getMonth()-1, 1));
                const wFrom = startOfWeek(now), wTo = endOfWeek(now);
                const pwFrom = new Date(wFrom); pwFrom.setDate(pwFrom.getDate()-7);
                const pwTo = new Date(wTo); pwTo.setDate(pwTo.getDate()-7);
                const pctVar = (cur, prev) => { if (prev === 0) return cur > 0 ? 100 : 0; return Math.round(((cur - prev) / prev) * 100); };
                const isRealLead = (l) => l.origin !== 'Planilha';
                const newLeadsCur = leads.filter(l => isRealLead(l) && inRange(l.createdAt, mFrom, mTo)).length;
                const newLeadsPrev = leads.filter(l => isRealLead(l) && inRange(l.createdAt, pmFrom, pmTo)).length;
                const schedCur = leads.filter((l) => {
                    if (!isRealLead(l)) return false;
                    const d = parseYMD(l.scheduledDate);
                    return d && inRange(d, wFrom, wTo);
                }).length;
                const schedPrev = leads.filter((l) => {
                    if (!isRealLead(l)) return false;
                    const d = parseYMD(l.scheduledDate);
                    return d && inRange(d, pwFrom, pwTo);
                }).length;
                const convCur = leads.filter((l) => {
                    if (!isRealLead(l) || !l.convertedAt) return false;
                    return inRange(l.convertedAt, mFrom, mTo);
                }).length;
                const convPrev = leads.filter((l) => {
                    if (!isRealLead(l) || !l.convertedAt) return false;
                    return inRange(l.convertedAt, pmFrom, pmTo);
                }).length;
                const cards = [
                    {
                        title: 'Novos leads no mês',
                        cur: newLeadsCur,
                        var: pctVar(newLeadsCur, newLeadsPrev),
                        trendTitle: 'Comparado com o mês civil anterior (novos leads criados no período).',
                    },
                    {
                        title: 'Aulas agendadas (semana)',
                        cur: schedCur,
                        var: pctVar(schedCur, schedPrev),
                        trendTitle: 'Comparado com o intervalo de 7 dias imediatamente anterior (mesma lógica de “semana” do card).',
                    },
                    {
                        title: 'Matrículas no mês',
                        cur: convCur,
                        var: pctVar(convCur, convPrev),
                        trendTitle: 'Comparado com o mês civil anterior (matrículas registradas no período).',
                    },
                ];
                return (
                    <div className="agenda-kpi-grid mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
                        {cards.map((c, i) => {
                            const up = c.var >= 0;
                            return (
                                <div key={i} className="agenda-kpi-card">
                                    <div className="agenda-kpi-label">{c.title}</div>
                                    <div className="agenda-kpi-value">{c.cur}</div>
                                    <div className={`agenda-kpi-trend ${up ? 'is-up' : 'is-down'}`}>
                                        {up ? <TrendingUp size={16} strokeWidth={2.25} aria-hidden /> : <TrendingDown size={16} strokeWidth={2.25} aria-hidden />}
                                        <span>
                                            {up && c.var > 0 ? '+' : ''}
                                            {c.var}%
                                        </span>
                                        <span className="agenda-kpi-trend-hint" title={c.trendTitle}>vs. período anterior</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                );
            })()}

            <button className="btn-secondary btn-large mt-4" onClick={() => navigate('/new-lead')} style={{ borderRadius: 'var(--radius)' }}>
                <Plus size={22} /> {`Novo ${(() => {
                    const l = useLeadStore.getState().labels?.leads || 'Leads';
                    const basePlural = String(l).trim();
                    const singular = basePlural.toLowerCase().endsWith('s') && basePlural.length > 1
                        ? basePlural.slice(0, -1)
                        : basePlural.toLowerCase();
                    return singular.slice(0,1).toUpperCase() + singular.slice(1);
                })()}`}
            </button>

            <div className="agenda-page-stack">
            <div className="agenda-top-row">
            <section className="mt-6 animate-in agenda-today-week-section" style={{ animationDelay: '0.1s' }}>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="navi-section-heading">
                        <Calendar size={18} color="var(--v500)" /> Aulas Experimentais
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <NlCommandBarTrigger onClick={() => setNlOpen(true)} />
                        <button
                            className="refresh-btn"
                            onClick={handleRefresh}
                            disabled={loading || isRefreshing}
                        >
                            <RefreshCcw size={16} className={isRefreshing ? 'spin-refresh' : ''} />
                        </button>
                    </div>
                </div>

                <div className="agenda-block-head">
                    <h4 className="navi-section-heading" style={{ fontSize: '0.95rem' }}>
                        Hoje
                    </h4>
                    <span className="badge badge-secondary">{countFor('today')}</span>
                </div>

                <div className="flex-col gap-3 agenda-experimental-cards">
                    {loading ? (
                        <div className="flex justify-center p-8">
                            <div className="spinner" />
                        </div>
                    ) : countFor('today') === 0 ? (
                        <div className="empty-state">
                            <Calendar size={28} color="var(--text-muted)" style={{ marginBottom: 10, opacity: 0.5 }} />
                            <p>Nenhuma aula para hoje.</p>
                            <p className="text-xs text-light mt-1">Abaixo você encontra a visão completa da semana.</p>
                        </div>
                    ) : (
                        allScheduled.filter((lead) => {
                            if (!lead.scheduledDate) return false;
                            const [y, m, d] = lead.scheduledDate.split('-').map(Number);
                            const leadDate = new Date(y, m - 1, d);
                            return leadDate.toDateString() === today.toDateString();
                        }).map((lead, i) => {
                        const noScheduleDate = !String(lead.scheduledDate || '').trim();
                        const showNoDateWarning = noScheduleDate;
                        const hasPhone = String(lead.phone || '').replace(/\D/g, '').length >= 8;
                        return (
                        <div
                            key={lead.id}
                            className={`card agenda-card animate-in${showNoDateWarning ? ' agenda-card--no-date' : ''}`}
                            style={{ animationDelay: `${0.04 * i}s` }}
                        >
                            <div className="flex justify-between items-center" onClick={() => navigate(`/lead/${lead.id}`)} style={{ cursor: 'pointer' }}>
                                <div style={{ flex: 1 }}>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <strong style={{ fontSize: '1rem' }}>{lead.name}</strong>
                                        {showNoDateWarning && (
                                            <span className="agenda-no-date-badge">Sem data — defina no Remarcar</span>
                                        )}
                                    </div>
                                    <p className="text-small" style={{ marginTop: 2 }}>
                                        {lead.type || 'Adulto'} • {lead.phone}{lead.intention ? ` • ${lead.intention}` : ''}{lead.priority ? ` • ${lead.priority}` : ''}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
                                        <Clock size={14} color="var(--v500)" />
                                        <strong className="navi-ui-time">{lead.scheduledTime || '--:--'}</strong>
                                        <button
                                            className="edit-time-btn"
                                            onClick={(e) => { e.stopPropagation(); openScheduleModal(lead); }}
                                            title="Editar agendamento"
                                            aria-label="Editar agendamento"
                                        >
                                            <Edit3 size={18} strokeWidth={2.6} />
                                        </button>
                                    </div>
                                    <span className="navi-ui-date">{noScheduleDate ? 'Definir data' : formatDate(lead.scheduledDate)}</span>
                                </div>
                            </div>

                            <div className="flex gap-2 mt-3 pt-3 border-t flex-wrap">
                                <button
                                    type="button"
                                    className="followup-action-btn flex-1"
                                    style={{ minWidth: '120px' }}
                                    disabled={!hasPhone}
                                    title={!hasPhone ? 'Cadastre um telefone válido no perfil' : 'Abrir WhatsApp com mensagem de confirmação'}
                                    onClick={(e) => { e.stopPropagation(); handleWhatsAppScheduled(lead); }}
                                >
                                    <span className="dashboard-wa-btn-inner">
                                        {academyWaLoadFailed && (
                                            <span
                                                className="dashboard-wa-warning-badge"
                                                title="Não foi possível carregar a configuração da academia. O WhatsApp pode não funcionar."
                                                aria-hidden
                                            >
                                                ⚠️
                                            </span>
                                        )}
                                        <MessageCircle size={14} color="#25D366" /> WhatsApp
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    className="followup-action-btn flex-1"
                                    style={{ minWidth: '120px' }}
                                    title="Alterar data, horário ou status"
                                    onClick={(e) => { e.stopPropagation(); openScheduleModal(lead); }}
                                >
                                    <Calendar size={14} color="var(--accent)" /> Remarcar
                                </button>
                            </div>
                            <div className="flex gap-2 mt-2">
                                <button
                                    type="button"
                                    className="btn-success flex-1"
                                    disabled={Boolean(savingPresence[`${lead.id}:attended`] || savingPresence[`${lead.id}:missed`])}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        void markLeadAttended(lead);
                                    }}
                                >
                                    <CheckCircle size={16} />{' '}
                                    {savingPresence[`${lead.id}:attended`] ? 'Salvando…' : 'Compareceu'}
                                </button>
                                <button
                                    type="button"
                                    className="btn-outline flex-1"
                                    disabled={Boolean(savingPresence[`${lead.id}:attended`] || savingPresence[`${lead.id}:missed`])}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        void markLeadMissed(lead);
                                    }}
                                >
                                    <XCircle size={16} />{' '}
                                    {savingPresence[`${lead.id}:missed`] ? 'Salvando…' : 'Não compareceu'}
                                </button>
                            </div>
                        </div>
                        );
                    })
                    )}
                </div>

            </section>

            <section className="mt-6 animate-in agenda-followups-section" style={{ animationDelay: '0.2s' }}>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="navi-section-heading">Follow-ups Pendentes</h3>
                    <span className="badge badge-secondary">{followUps.length}</span>
                </div>
                <p className="text-xs text-light" style={{ marginBottom: 10, lineHeight: 1.4 }}>
                    Do mais recente para o mais antigo. Após {FOLLOWUP_AGENDA_MAX_DAYS} dias da data da aula, o follow-up sai desta lista e fica só no Kanban.
                </p>

                <div className="flex-col gap-2">
                    {followUps.length > 0 ? followUps.map((lead, i) => {
                        const urgency = getUrgency(lead.daysAgo);
                        return (
                            <div key={lead.id} className="card follow-card animate-in" style={{ animationDelay: `${0.04 * i}s` }}>
                                <div className="flex justify-between items-center" onClick={() => navigate(`/lead/${lead.id}`)} style={{ cursor: 'pointer' }}>
                                    <div style={{ flex: 1 }}>
                                        <div className="flex items-center gap-2">
                                            <strong>{lead.name}</strong>
                                            <span
                                                className="urgency-tag"
                                                style={{ background: urgency.color + '18', color: urgency.color }}
                                                title={lead.daysAgo === 0 ? 'Dia da aula experimental' : `Há ${lead.daysAgo} dias desde a data da aula`}
                                            >
                                                {lead.daysAgo === 0 ? 'Hoje' : `há ${lead.daysAgo} dias`}
                                            </span>
                                        </div>
                                        <p className="text-small">{lead.phone}{lead.intention ? ` • ${lead.intention}` : ''}{lead.priority ? ` • ${lead.priority}` : ''} • {urgency.label}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`status-pill ${lead.status === LEAD_STATUS.COMPLETED ? 'pill-success' : 'pill-danger'}`}>
                                            {lead.status === LEAD_STATUS.COMPLETED ? 'Pós-Aula' : 'Recuperar'}
                                        </span>
                                    </div>
                                </div>

                                {/* Quick actions */}
                                <div className="flex gap-2 mt-3 pt-3 border-t">
                                    <button
                                        type="button"
                                        className="followup-action-btn flex-1"
                                        onClick={(e) => { e.stopPropagation(); handleWhatsApp(lead); }}
                                    >
                                        <span className="dashboard-wa-btn-inner">
                                            {academyWaLoadFailed && (
                                                <span
                                                    className="dashboard-wa-warning-badge"
                                                    title="Não foi possível carregar a configuração da academia. O WhatsApp pode não funcionar."
                                                    aria-hidden
                                                >
                                                    ⚠️
                                                </span>
                                            )}
                                            <MessageCircle size={14} color="#25D366" /> WhatsApp
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        className="followup-action-btn flex-1"
                                        onClick={(e) => { e.stopPropagation(); navigate(`/lead/${lead.id}`); }}
                                    >
                                        <ChevronRight size={14} /> Ver Perfil
                                    </button>
                                </div>
                            </div>
                        );
                    }) : (
                        <div className="empty-state">
                            <p>Nada pendente por agora.</p>
                            {followUpsKanbanOnlyCount > 0 && (
                                <p className="text-xs text-light mt-2">
                                    {followUpsKanbanOnlyCount} {followUpsKanbanOnlyCount === 1 ? 'interessado está' : 'interessados estão'} só no Kanban (aula há {FOLLOWUP_AGENDA_MAX_DAYS}+ dias).
                                </p>
                            )}
                        </div>
                    )}
                </div>
                {followUps.length > 0 && followUpsKanbanOnlyCount > 0 && (
                    <p className="text-xs text-light mt-2" style={{ lineHeight: 1.35 }}>
                        + {followUpsKanbanOnlyCount} no Kanban (follow-up com {FOLLOWUP_AGENDA_MAX_DAYS}+ dias desde a aula).
                    </p>
                )}

                <div className="mt-4">
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="navi-section-heading" style={{ fontSize: '0.95rem' }}>Parados no funil</h4>
                        <span className="badge badge-secondary">{stalledLeads.length}</span>
                    </div>
                    <div className="flex-col gap-2">
                        {stalledLeads.length > 0 ? stalledLeads.map((lead, i) => {
                            const alert = lead.slaAlert;
                            const isCritical = alert?.urgency === 'critical';
                            return (
                                <div
                                    key={`sla-${lead.id}`}
                                    className={`card follow-card sla-follow-card animate-in${isCritical ? ' sla-follow-card--critical' : ''}`}
                                    style={{ animationDelay: `${0.03 * i}s` }}
                                >
                                    <div className="flex justify-between items-center" onClick={() => navigate(`/lead/${lead.id}`)} style={{ cursor: 'pointer' }}>
                                        <div style={{ flex: 1 }}>
                                            <div className="flex items-center gap-2">
                                                <strong>{lead.name}</strong>
                                                <span
                                                    className="urgency-tag"
                                                    style={{ background: isCritical ? 'var(--danger-light)' : 'var(--warning-light)', color: isCritical ? 'var(--danger)' : '#b45309' }}
                                                    title={`Há ${alert.daysInStage} dia(s) na etapa. SLA configurado: ${alert.slaDays} dia(s).`}
                                                >
                                                    {`${alert.daysInStage}d`}
                                                </span>
                                            </div>
                                            <p className="text-small">
                                                {lead.phone}
                                                {lead.pipelineStage ? ` • ${lead.pipelineStage}` : ''}
                                                {' • '}
                                                SLA {alert.slaDays}d
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            className="followup-action-btn"
                                            onClick={(e) => { e.stopPropagation(); navigate(`/lead/${lead.id}`); }}
                                        >
                                            <ChevronRight size={14} /> Ver Perfil
                                        </button>
                                    </div>
                                </div>
                            );
                        }) : (
                            <div className="empty-state">
                                <p>Nenhum lead acima do SLA no momento.</p>
                            </div>
                        )}
                    </div>
                </div>
            </section>
            </div>
            <section className="mt-6 animate-in agenda-week-section" style={{ animationDelay: '0.23s' }}>
                <div className="agenda-block-head">
                    <h4 className="navi-section-heading" style={{ fontSize: '0.95rem' }}>
                        Semana
                    </h4>
                    <span className="badge badge-secondary">{allScheduled.length}</span>
                </div>
                <p className="text-xs text-light agenda-week-hint">
                    Visual completo da semana civil (segunda a domingo) em largura total.
                </p>
                <div className="agenda-week-fullwidth">
                    <AgendaCalendarWeek
                        leads={allScheduled}
                        onCompareceu={markLeadAttended}
                        onNaoCompareceu={markLeadMissed}
                        onOpenLead={(lead) => navigate(`/lead/${lead.id}`)}
                        savingPresence={savingPresence}
                    />
                </div>
            </section>
            </div>

            <ScheduleModal
                open={scheduleModalLead !== null}
                onClose={() => setScheduleModalLead(null)}
                onConfirm={onConfirmScheduleDashboard}
                lead={scheduleModalLead}
                quickTimes={dashboardQuickTimes}
                initialDate={scheduleModalLead?.scheduledDate || ''}
                initialTime={scheduleModalLead?.scheduledTime || ''}
                title="Editar agendamento"
            />

            <style dangerouslySetInnerHTML={{
                __html: `
        .reception-agenda-inner {
          width: 100%;
          max-width: 720px;
          margin-left: auto;
          margin-right: auto;
        }
        .reception-agenda-inner--week {
          max-width: 1180px;
        }
        .reception-agenda-inner--wide {
          max-width: 1180px;
        }
        .agenda-today-week-section,
        .agenda-followups-section,
        .agenda-week-section {
          width: 100%;
          display: block;
          clear: both;
          float: none !important;
          position: static !important;
          max-width: 100%;
          flex: 0 0 auto;
        }
        .agenda-page-stack {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 0;
          width: 100%;
        }
        .agenda-top-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 14px;
          align-items: start;
        }
        @media (max-width: 980px) {
          .agenda-top-row {
            grid-template-columns: minmax(0, 1fr);
            gap: 0;
          }
        }
        .agenda-kpi-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }
        @media (max-width: 700px) {
          .agenda-kpi-grid { grid-template-columns: 1fr; }
        }
        .agenda-kpi-card {
          position: relative;
          padding: 18px 18px 16px;
          border-radius: 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          box-shadow: 0 1px 2px rgba(18, 16, 42, 0.04), 0 8px 28px rgba(91, 63, 191, 0.07);
          transition: transform 0.2s ease, box-shadow 0.22s ease, border-color 0.2s ease;
          overflow: hidden;
        }
        .agenda-kpi-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, var(--v500), rgba(124, 99, 214, 0.95));
          border-radius: 16px 16px 0 0;
          opacity: 0.9;
        }
        .agenda-kpi-card:hover {
          transform: translateY(-3px);
          border-color: rgba(91, 63, 191, 0.22);
          box-shadow: 0 4px 12px rgba(18, 16, 42, 0.06), 0 16px 40px rgba(91, 63, 191, 0.12);
        }
        @media (prefers-reduced-motion: reduce) {
          .agenda-kpi-card { transition: none; }
          .agenda-kpi-card:hover { transform: none; }
        }
        .agenda-kpi-label {
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--text-secondary);
          margin-bottom: 10px;
          line-height: 1.35;
          padding-right: 4px;
        }
        .agenda-kpi-value {
          font-size: clamp(1.75rem, 4vw, 2.125rem);
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          line-height: 1.05;
          color: var(--v500);
          letter-spacing: -0.03em;
        }
        .agenda-kpi-trend {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px 8px;
          margin-top: 12px;
          font-size: 0.8125rem;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
        .agenda-kpi-trend.is-up { color: var(--success-text); }
        .agenda-kpi-trend.is-down { color: var(--danger); }
        .agenda-kpi-trend-hint {
          width: 100%;
          flex-basis: 100%;
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          color: var(--text-secondary);
          opacity: 0.75;
          margin-top: 2px;
          cursor: help;
        }
        @keyframes dashboardSk { from { background-position: 200% 0; } to { background-position: -200% 0; } }
        .agenda-kpi-skeleton {
          pointer-events: none;
          border-radius: 16px;
          background: linear-gradient(90deg, rgba(148,163,184,0.12) 25%, rgba(148,163,184,0.24) 50%, rgba(148,163,184,0.12) 75%);
          background-size: 200% 100%;
          animation: dashboardSk 1.2s ease-in-out infinite;
        }
        .dashboard-error-banner {
          display: flex; flex-wrap: wrap; align-items: center; gap: 12px;
          padding: 12px 14px; margin: 12px 0 16px; border-radius: 10px;
          background: rgba(220, 38, 38, 0.08);
          border: 1px solid rgba(220, 38, 38, 0.35);
          color: var(--text);
          font-size: 0.9rem;
        }
        .dashboard-wa-btn-inner {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .dashboard-wa-warning-badge {
          font-size: 0.95rem;
          line-height: 1;
        }
        .dashboard-confirm-overlay {
          position: fixed; inset: 0; z-index: 400;
          background: rgba(18, 16, 42, 0.5);
          backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          padding: 20px;
        }
        .dashboard-confirm-modal {
          background: var(--surface);
          border-radius: var(--radius);
          padding: 24px;
          width: 100%;
          max-width: 380px;
          text-align: center;
          border: 0.5px solid var(--border-violet);
          box-shadow: var(--shadow-lg);
        }
        .dashboard-confirm-icon-wrap {
          width: 56px; height: 56px; border-radius: 50%;
          background: var(--danger-light);
          margin: 0 auto 16px;
          display: flex; align-items: center; justify-content: center;
        }
        .dashboard-confirm-actions {
          display: flex; gap: 10px; justify-content: center; margin-top: 20px; flex-wrap: wrap;
        }
        .dashboard-confirm-actions .btn-outline,
        .dashboard-confirm-actions .btn-danger {
          flex: 1;
          min-width: 120px;
        }
        .dashboard-confirm-overlay .btn-danger {
          background: var(--danger);
          color: #fff;
          border: none;
          border-radius: var(--radius-sm);
          font-weight: 700;
          padding: 10px 16px;
          cursor: pointer;
          font-family: inherit;
        }
        .dashboard-confirm-overlay .btn-danger:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .hub-quick-row {
          display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px;
        }
        @media (max-width: 900px) { .hub-quick-row { grid-template-columns: 1fr; } }
        .hub-quick-card {
          text-align: left; padding: 14px 16px; cursor: pointer; border: 1.5px solid var(--border);
          background: var(--surface); border-radius: var(--radius); transition: var(--transition);
          display: flex; flex-direction: column; gap: 4px; font-family: inherit;
        }
        .hub-quick-card:hover { border-color: var(--accent); box-shadow: var(--shadow); }
        .hub-quick-label { font-size: 0.78rem; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.03em; }
        .hub-quick-count { font-size: 1.5rem; font-weight: 800; color: var(--text); }
        .hub-quick-arrow { font-size: 0.95rem; font-weight: 800; color: var(--accent); }
        .hub-quick-sub { font-size: 0.72rem; color: var(--text-muted); font-weight: 600; }
        .agenda-experimental-filter-strip {
          margin-bottom: 20px;
        }
        .agenda-week-hint {
          margin: 0 0 14px;
          line-height: 1.35;
          color: var(--text-secondary);
        }
        .agenda-block-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin: 8px 0 10px;
        }
        .agenda-week-fullwidth {
          width: 100%;
        }
        .agenda-experimental-cards {
          margin-top: 2px;
        }
        .reception-agenda-inner .agenda-card.card {
          position: relative;
          border-radius: 16px;
          padding: 18px 18px 16px;
          border: 1px solid var(--border);
          border-left: 4px solid var(--accent);
          box-shadow:
            0 1px 2px rgba(18, 16, 42, 0.05),
            0 10px 32px rgba(91, 63, 191, 0.08);
          overflow: hidden;
          transition: transform 0.2s ease, box-shadow 0.22s ease, border-color 0.2s ease;
        }
        .reception-agenda-inner .agenda-card.card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, var(--v500), rgba(124, 99, 214, 0.75));
          opacity: 0.7;
          pointer-events: none;
          border-radius: 16px 16px 0 0;
        }
        .reception-agenda-inner .agenda-card.card:hover {
          transform: translateY(-2px);
          border-color: rgba(91, 63, 191, 0.22);
          box-shadow:
            0 4px 14px rgba(18, 16, 42, 0.07),
            0 16px 40px rgba(91, 63, 191, 0.12);
        }
        @media (prefers-reduced-motion: reduce) {
          .reception-agenda-inner .agenda-card.card { transition: none; }
          .reception-agenda-inner .agenda-card.card:hover { transform: none; }
        }
        .agenda-card--no-date {
          border-left-color: var(--warning);
        }
        .reception-agenda-inner .agenda-card--no-date.card::before {
          background: linear-gradient(90deg, #d97706, #fbbf24);
          opacity: 0.55;
        }
        .agenda-no-date-badge {
          font-size: 0.65rem; font-weight: 800; padding: 2px 8px; border-radius: var(--radius-full);
          background: var(--warning-light); color: #b45309; text-transform: uppercase; letter-spacing: 0.02em;
        }
        .follow-card { border-left: 4px solid var(--warning); }
        .sla-follow-card { border-left-color: #d97706; }
        .sla-follow-card--critical { border-left-color: var(--danger); }
        .status-pill { 
          font-size: 0.7rem; padding: 4px 10px; border-radius: var(--radius-full); 
          font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; white-space: nowrap;
        }
        .pill-success { background: var(--success-light); color: var(--success); }
        .pill-danger { background: var(--danger-light); color: var(--danger); }
        .urgency-tag {
          font-size: 0.65rem; font-weight: 800; padding: 2px 7px;
          border-radius: var(--radius-full); letter-spacing: 0.02em;
        }
        .followup-action-btn {
          background: var(--surface-hover); border: 1px solid var(--border-light);
          border-radius: var(--radius-sm); font-size: 0.78rem; font-weight: 600;
          min-height: 44px;
          padding-inline: 12px;
          gap: 6px; color: var(--text-secondary);
        }
        .followup-action-btn:hover { border-color: var(--accent); color: var(--accent); }
        .followup-action-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .followup-action-btn:disabled:hover { border-color: var(--border-light); color: var(--text-secondary); }
        .reception-agenda-inner .agenda-card.card .border-t {
          border-top: 1px solid rgba(91, 63, 191, 0.09);
        }
        .reception-agenda-inner .followup-action-btn {
          border-radius: 10px;
          min-height: 44px;
          padding-inline: 12px;
          font-weight: 700;
        }
        @media (max-width: 900px) {
          .reception-agenda-inner {
            max-width: 100%;
          }
          .reception-agenda-inner .agenda-card.card,
          .reception-agenda-inner .follow-card.card {
            padding: 14px 14px 12px;
            border-radius: 14px;
          }
          .agenda-today-week-section > .flex.justify-between.items-center.mb-2,
          .agenda-followups-section > .flex.justify-between.items-center.mb-2 {
            align-items: flex-start;
            gap: 8px;
            flex-wrap: wrap;
          }
        }
        @media (max-width: 760px) {
          .agenda-block-head {
            margin-top: 10px;
          }
          .reception-agenda-inner .agenda-card.card > .flex.justify-between.items-center,
          .reception-agenda-inner .follow-card.card > .flex.justify-between.items-center {
            flex-direction: column;
            align-items: flex-start;
            gap: 10px;
          }
          .reception-agenda-inner .agenda-card.card .text-right {
            width: 100%;
            text-align: left;
          }
          .reception-agenda-inner .agenda-card.card .text-right .flex.items-center.gap-2 {
            justify-content: flex-start !important;
          }
          .reception-agenda-inner .agenda-card.card .mt-2,
          .reception-agenda-inner .agenda-card.card .mt-3.pt-3.border-t,
          .reception-agenda-inner .follow-card.card .mt-3.pt-3.border-t {
            width: 100%;
          }
          .reception-agenda-inner .agenda-card.card .mt-2,
          .reception-agenda-inner .agenda-card.card .mt-3.pt-3.border-t,
          .reception-agenda-inner .follow-card.card .mt-3.pt-3.border-t {
            flex-direction: column;
          }
          .reception-agenda-inner .agenda-card.card .mt-2 > button,
          .reception-agenda-inner .agenda-card.card .mt-3.pt-3.border-t > button,
          .reception-agenda-inner .follow-card.card .mt-3.pt-3.border-t > button {
            width: 100%;
            min-width: 100% !important;
          }
          .reception-agenda-inner .followup-action-btn {
            min-height: 40px;
          }
          .edit-time-btn {
            width: 40px;
            height: 40px;
            min-width: 40px;
            min-height: 40px;
            flex-basis: 40px;
          }
        }
        .refresh-btn {
          background: none; border: none; color: var(--text-muted);
          min-width: 44px;
          min-height: 44px;
          width: auto;
          height: auto;
          padding: 0;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: var(--transition);
        }
        .refresh-btn:hover { color: var(--accent); }
        .refresh-btn:disabled { opacity: 0.5; }
        .spin-refresh { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .edit-time-btn { 
          min-width: 44px;
          min-height: 44px;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: var(--v500); color: #fff;
          display: inline-flex; align-items: center; justify-content: center;
          border: none; cursor: pointer;
          padding: 0;
          flex: 0 0 44px;
          box-shadow: 0 4px 14px rgba(91, 63, 191, 0.28);
          transition: transform .12s ease, filter .12s ease, box-shadow .2s ease;
        }
        .edit-time-btn svg { display: block; color: #fff; stroke: currentColor; fill: none; }
        .edit-time-btn:hover { filter: brightness(0.96); }
        .edit-time-btn:active { transform: translateY(1px); }
        .edit-time-btn:focus-visible { outline: 2px solid var(--v500); outline-offset: 2px; box-shadow: 0 0 0 4px rgba(91, 63, 191, 0.2); }
        .agenda-mini-btn {
          width: 32px; height: 32px; border-radius: 50%;
          display: inline-flex; align-items: center; justify-content: center;
          padding: 0; min-height: auto;
          background: var(--surface); border: 1.5px solid var(--border);
          color: var(--text-secondary);
          transition: var(--transition);
        }
        .agenda-mini-btn svg { display: block; }
        .agenda-mini-btn:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
        .agenda-mini-btn:active { transform: translateY(1px); }
        .agenda-mini-btn.danger { border-color: var(--danger); color: var(--danger); }
        .agenda-mini-btn.danger:hover { background: var(--danger-light); }
        .agenda-mini-btn.lost { border-color: var(--warning); color: var(--warning); }
        .agenda-mini-btn.lost:hover { background: var(--warning-light); }
        .edit-modal {
          background: var(--surface); border-radius: var(--radius); width: 92%; max-width: 420px;
          padding: 16px; box-shadow: var(--shadow-lg); border: 0.5px solid var(--border-violet);
        }
        .edit-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 12px; flex-wrap: wrap; }
        @media (max-width: 460px) {
          .edit-actions { flex-direction: column; align-items: stretch; }
          .edit-actions button { width: 100%; }
        }
        .danger-outline { border-color: var(--danger) !important; color: var(--danger) !important; }
        .time-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .time-chip {
          min-height: 44px;
          padding: 6px 12px;
          border-radius: var(--radius-full);
          background: var(--surface-hover); border: 1px solid var(--border);
          font-size: 0.75rem; font-weight: 700; color: var(--text-secondary);
        }
        .time-chip.active, .time-chip:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
      `}} />
            <NlCommandBar
                open={nlOpen}
                onOpenChange={setNlOpen}
                academyName={academyWa.name}
                context="perfil"
                pipelineStages={pipelineStagesNl}
                recentPayments={[]}
            />
        </div>
    );
};

export default Dashboard;
