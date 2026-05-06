import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import { useTaskStore } from '../store/useTaskStore';
import { useUiStore } from '../store/useUiStore';
import { useNavigate } from 'react-router-dom';
import { Query } from 'appwrite';
import { databases, DB_ID, ACADEMIES_COL, LEAD_EVENTS_COL } from '../lib/appwrite';
import { DEFAULT_WHATSAPP_TEMPLATES } from '../../lib/whatsappTemplateDefaults.js';
import { sendWhatsappTemplateOutbound } from '../lib/outboundWhatsappTemplate.js';
import { Plus, Calendar, ChevronRight, ChevronDown, MessageCircle, RefreshCcw, List, LayoutGrid, CheckSquare } from 'lucide-react';
import { PIPELINE_WAITING_DECISION_STAGE, PIPELINE_STAGES } from '../constants/pipeline.js';
import { addLeadEvent } from '../lib/leadEvents.js';
import { buildSchedulePatch } from '../lib/scheduleHelpers.js';
import { isLeadScheduledForExperimental } from '../lib/leadStageRules.js';
import NlCommandBar, { NlCommandBarTrigger } from '../components/NlCommandBar';
import { LEADS_REFRESH } from '../lib/leadTimelineEvents.js';
import ScheduleModal from '../components/ScheduleModal.jsx';
import AgendaCalendarWeek, { formatWeekRangeLabel, getWeekStart } from '../components/AgendaCalendarWeek.jsx';
import { getAcademyQuickTimeChipValues } from '../lib/academyQuickTimes.js';
const DEFAULT_STAGE_SLA_DAYS = 3;
/** Follow-ups com aula há >= N dias somem desta agenda e ficam só no Kanban */
const FOLLOWUP_AGENDA_MAX_DAYS = 7;
const Dashboard = () => {
    const navigate = useNavigate();
    const { leads, loading, fetchLeads, academyId, academyList, leadsError } = useLeadStore();
    const tasks = useTaskStore((s) => s.tasks);
    const fetchTasks = useTaskStore((s) => s.fetchTasks);
    const updateTask = useTaskStore((s) => s.updateTask);
    const addToast = useUiStore((s) => s.addToast);
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
    const [listModalType, setListModalType] = useState('');
    const [followupDoneAtByLead, setFollowupDoneAtByLead] = useState({});
    const [savingFollowupDone, setSavingFollowupDone] = useState({});
    const [savingTaskDone, setSavingTaskDone] = useState({});
    const [dashboardWeekOffset, setDashboardWeekOffset] = useState(0);
    const hiddenAtRef = useRef(null);

    const closeListModal = () => setListModalType('');

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
        if (academyId) {
            fetchLeads();
        }
    }, [academyId]);

    useEffect(() => {
        if (!academyId) return;
        void fetchTasks(academyId, { silent: true, filters: { status: 'pending' } });
    }, [academyId, fetchTasks]);

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

    useEffect(() => {
        if (!academyId || !LEAD_EVENTS_COL) {
            setFollowupDoneAtByLead({});
            return;
        }
        let cancelled = false;
        const loadDoneEvents = async () => {
            try {
                let cursor = null;
                let pageCount = 0;
                const byLead = {};
                do {
                    const queries = [
                        Query.equal('academy_id', [String(academyId || '').trim()]),
                        Query.equal('type', ['followup_done']),
                        Query.orderDesc('at'),
                        Query.limit(100),
                    ];
                    if (cursor) queries.push(Query.cursorAfter(cursor));
                    const res = await databases.listDocuments(DB_ID, LEAD_EVENTS_COL, queries);
                    const docs = Array.isArray(res?.documents) ? res.documents : [];
                    for (const d of docs) {
                        const leadId = String(d?.lead_id || '').trim();
                        const at = String(d?.at || '').trim();
                        if (!leadId || !at || byLead[leadId]) continue;
                        byLead[leadId] = at;
                    }
                    cursor = docs.length === 100 ? docs[docs.length - 1]?.$id : null;
                    pageCount += 1;
                } while (cursor && pageCount < 10);
                if (!cancelled) setFollowupDoneAtByLead(byLead);
            } catch {
                if (!cancelled) setFollowupDoneAtByLead({});
            }
        };
        void loadDoneEvents();
        return () => {
            cancelled = true;
        };
    }, [academyId]);

    const handleRefresh = async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        try {
            await Promise.all([
                fetchLeads(),
                fetchTasks(academyId, { silent: true, filters: { status: 'pending' } }),
            ]);
        } finally {
            setTimeout(() => setIsRefreshing(false), 300);
        }
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

    const todayScheduled = allScheduled.filter((lead) => {
        if (!lead.scheduledDate) return false;
        const [y, m, d] = lead.scheduledDate.split('-').map(Number);
        const leadDate = new Date(y, m - 1, d);
        return leadDate.toDateString() === today.toDateString();
    });

    const weekScheduled = allScheduled.filter((lead) => {
        if (!lead.scheduledDate) return false;
        const [y, m, d] = lead.scheduledDate.split('-').map(Number);
        const leadDate = new Date(y, m - 1, d);
        return leadDate >= today && leadDate < weekEnd;
    });

    // Follow-ups: dias desde a data da aula experimental; na agenda, só os primeiros 7 dias; mais recentes no topo
    const followUpsAll = leads
        .filter(l => excludeImportedOrigin(l) && (l.status === LEAD_STATUS.COMPLETED || l.status === LEAD_STATUS.MISSED))
        .map(l => {
            const classDate = l.scheduledDate ? new Date(l.scheduledDate + 'T00:00:00') : new Date(l.createdAt);
            const diffMs = new Date() - classDate;
            const daysAgo = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const doneAtIso = String(followupDoneAtByLead[String(l.id || '').trim()] || '').trim();
            const doneAtMs = doneAtIso ? new Date(doneAtIso).getTime() : 0;
            const classMs = classDate.getTime();
            const doneForCurrentClass = Number.isFinite(doneAtMs) && doneAtMs > 0 && doneAtMs >= classMs;
            return { ...l, daysAgo, classDate, doneForCurrentClass };
        });
    const followUpsKanbanOnlyCount = followUpsAll.filter((l) => !l.doneForCurrentClass && l.daysAgo >= FOLLOWUP_AGENDA_MAX_DAYS).length;
    const followUps = followUpsAll
        .filter((l) => !l.doneForCurrentClass && l.daysAgo < FOLLOWUP_AGENDA_MAX_DAYS)
        .sort((a, b) => {
            if (a.daysAgo !== b.daysAgo) return a.daysAgo - b.daysAgo;
            const ta = new Date(a.statusChangedAt || a.pipelineStageChangedAt || a.createdAt || 0).getTime();
            const tb = new Date(b.statusChangedAt || b.pipelineStageChangedAt || b.createdAt || 0).getTime();
            return tb - ta;
        });

    const pendingTasks = (tasks || [])
        .filter((t) => String(t?.status || '').trim().toLowerCase() !== 'done')
        .sort((a, b) => {
            const ta = String(a?.due_date || '').trim();
            const tb = String(b?.due_date || '').trim();
            if (!ta && !tb) return 0;
            if (!ta) return 1;
            if (!tb) return -1;
            return ta.localeCompare(tb);
        });

    const scheduledInVisibleWeekCount = useMemo(() => {
        const mon = getWeekStart(dashboardWeekOffset);
        const sunEnd = new Date(mon);
        sunEnd.setDate(mon.getDate() + 6);
        sunEnd.setHours(23, 59, 59, 999);
        const a = mon.getTime();
        const b = sunEnd.getTime();
        return allScheduled.filter((lead) => {
            const raw = String(lead?.scheduledDate || '').trim();
            if (!raw) return false;
            const [y, m, d] = raw.split('T')[0].split('-').map(Number);
            if (!Number.isFinite(y)) return false;
            const t = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0).getTime();
            return t >= a && t <= b;
        }).length;
    }, [allScheduled, dashboardWeekOffset]);

    const modalListItems =
        listModalType === 'today'
            ? todayScheduled
            : listModalType === 'week'
              ? weekScheduled
              : listModalType === 'followup'
                ? followUps
                : listModalType === 'tasks'
                  ? pendingTasks
                : [];

    const modalTitle =
        listModalType === 'today'
            ? 'Aulas experimentais hoje'
            : listModalType === 'week'
              ? 'Aulas experimentais esta semana'
              : listModalType === 'followup'
                ? 'Follow-ups pendentes'
                : listModalType === 'tasks'
                  ? 'Próximas tarefas'
                : '';

    const followupElapsedColor = (daysAgo) => {
        if (daysAgo === 0) return '#854F0B';
        if (daysAgo === 1) return '#6b6b88';
        return '#A32D2D';
    };

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

    const markFollowupDone = async (lead) => {
        if (!lead?.id || savingFollowupDone[lead.id]) return;
        setSavingFollowupDone((prev) => ({ ...prev, [lead.id]: true }));
        try {
            const st = useLeadStore.getState();
            const acad = (st.academyList || []).find((a) => a.id === st.academyId) || {};
            const permCtx = { ownerId: acad.ownerId, teamId: acad.teamId, userId: st.userId || '' };
            const nowIso = new Date().toISOString();
            await addLeadEvent({
                academyId: st.academyId,
                leadId: lead.id,
                type: 'followup_done',
                text: 'Follow-up marcado como concluído',
                createdBy: st.userId || 'user',
                permissionContext: permCtx,
                payloadJson: { source: 'dashboard', status: lead.status || '', scheduledDate: lead.scheduledDate || '' },
            });
            setFollowupDoneAtByLead((prev) => ({ ...prev, [lead.id]: nowIso }));
            addToast({ type: 'success', message: 'Follow-up marcado como feito.' });
        } catch {
            addToast({ type: 'error', message: 'Erro ao marcar follow-up como feito.' });
        } finally {
            setSavingFollowupDone((prev) => {
                const next = { ...prev };
                delete next[lead.id];
                return next;
            });
        }
    };

    const markTaskAsDone = async (task) => {
        const taskId = String(task?.id || '').trim();
        if (!taskId || savingTaskDone[taskId]) return;
        setSavingTaskDone((prev) => ({ ...prev, [taskId]: true }));
        try {
            await updateTask(taskId, { status: 'done' });
            addToast({ type: 'success', message: 'Tarefa concluída.' });
        } catch {
            addToast({ type: 'error', message: 'Erro ao concluir tarefa.' });
        } finally {
            setSavingTaskDone((prev) => {
                const next = { ...prev };
                delete next[taskId];
                return next;
            });
        }
    };

    return (
        <div className="container reception-dashboard" style={{ paddingTop: 20, paddingBottom: 28 }}>
            <div className="reception-agenda-inner reception-agenda-inner--wide">
            <header className="reception-page-header reception-page-header--split animate-in">
                <div className="reception-page-header__intro">
                    <h1 className="navi-page-title">Agenda da Recepção</h1>
                    <p className="navi-subtitle" style={{ marginTop: 2 }}>Controle de aulas experimentais e retornos</p>
                </div>
                <div className="reception-page-header__actions">
                    <div className="reception-header-ai">
                        <NlCommandBarTrigger onClick={() => setNlOpen(true)} />
                    </div>
                    <button type="button" className="btn-primary reception-header-new-lead" onClick={() => navigate('/new-lead')}>
                        <Plus size={20} strokeWidth={2.25} />{' '}
                        {`Novo ${(() => {
                            const l = useLeadStore.getState().labels?.leads || 'Leads';
                            const basePlural = String(l).trim();
                            const singular = basePlural.toLowerCase().endsWith('s') && basePlural.length > 1
                                ? basePlural.slice(0, -1)
                                : basePlural.toLowerCase();
                            return singular.slice(0, 1).toUpperCase() + singular.slice(1);
                        })()}`}
                    </button>
                </div>
            </header>

            {leadsError && (
                <div className="dashboard-error-banner" role="alert">
                    <span>Não foi possível carregar os dados.</span>
                    <button type="button" className="btn-secondary" onClick={() => void fetchLeads()}>
                        Tentar novamente
                    </button>
                </div>
            )}

            <div className="agenda-kpi-grid mt-4 animate-in" style={{ animationDelay: '0.05s' }} aria-busy={loading}>
                {loading ? (
                    [1, 2, 3, 4].map((i) => <div key={i} className="agenda-kpi-card agenda-kpi-skeleton" style={{ minHeight: 148 }} />)
                ) : (
                    [
                        {
                            key: 'today',
                            title: 'Aulas experimentais hoje',
                            count: todayScheduled.length,
                            cta: 'Ver agenda',
                            Icon: Calendar,
                            variant: 'default',
                        },
                        {
                            key: 'week',
                            title: 'Aulas experimentais esta semana',
                            count: weekScheduled.length,
                            cta: 'Ver lista',
                            Icon: LayoutGrid,
                            variant: 'default',
                        },
                        {
                            key: 'followup',
                            title: 'Follow-ups pendentes',
                            count: followUps.length,
                            cta: 'Ver abaixo',
                            Icon: ChevronDown,
                            variant: 'followup',
                        },
                        {
                            key: 'tasks',
                            title: 'Próximas tarefas',
                            count: pendingTasks.length,
                            cta: 'Ver tarefas',
                            Icon: CheckSquare,
                            variant: 'default',
                        },
                    ].map((card) => (
                        <button
                            key={card.key}
                            type="button"
                            className={`agenda-kpi-card agenda-kpi-card--clickable${card.variant === 'followup' ? ' agenda-kpi-card--followup' : ''}`}
                            onClick={() => setListModalType(card.key)}
                        >
                            <div className="agenda-kpi-card-stack">
                                <div className="agenda-kpi-label">{card.title}</div>
                                <div className={`agenda-kpi-value${card.variant === 'followup' ? ' agenda-kpi-value--followup' : ''}`}>{card.count}</div>
                            </div>
                            <div
                                className={`agenda-kpi-trend agenda-kpi-cta${
                                    card.variant === 'followup' ? ' agenda-kpi-trend--followup' : ' agenda-kpi-trend--cta'
                                }`}
                            >
                                <card.Icon size={16} strokeWidth={2} />
                                <span>{card.cta}</span>
                            </div>
                        </button>
                    ))
                )}
            </div>

            <div className="agenda-page-stack">
            <section className="animate-in agenda-week-section reception-section reception-week-panel" style={{ animationDelay: '0.23s' }}>
                <div className="reception-week-panel__head flex flex-wrap justify-between items-center gap-3">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <h3 className="navi-section-heading reception-section-heading">
                            <Calendar size={18} color="var(--v500)" strokeWidth={2} /> Agenda da semana
                        </h3>
                        <span
                            className="badge badge-secondary reception-section-badge"
                            title="Aulas experimentais na semana exibida"
                        >
                            {scheduledInVisibleWeekCount}
                        </span>
                    </div>
                    <div className="reception-week-panel__nav flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            className="btn-secondary agenda-dash-week-nav"
                            onClick={() => setDashboardWeekOffset((o) => o - 1)}
                        >
                            &lt; Anterior
                        </button>
                        <span className="reception-week-range" aria-live="polite">
                            {formatWeekRangeLabel(dashboardWeekOffset)}
                        </span>
                        <button
                            type="button"
                            className="btn-secondary agenda-dash-week-nav"
                            onClick={() => setDashboardWeekOffset((o) => o + 1)}
                        >
                            Próxima &gt;
                        </button>
                        <button
                            type="button"
                            className="refresh-btn reception-week-refresh"
                            onClick={handleRefresh}
                            disabled={loading || isRefreshing}
                            aria-label="Atualizar agenda"
                        >
                            <RefreshCcw size={18} className={isRefreshing ? 'spin-refresh' : ''} strokeWidth={2} />
                        </button>
                    </div>
                </div>
                <div className="agenda-week-fullwidth reception-week-embed">
                    <AgendaCalendarWeek
                        leads={allScheduled}
                        onCompareceu={markLeadAttended}
                        onNaoCompareceu={markLeadMissed}
                        onOpenLead={(lead) => navigate(`/lead/${lead.id}`)}
                        savingPresence={savingPresence}
                        weekOffset={dashboardWeekOffset}
                        onWeekOffsetChange={setDashboardWeekOffset}
                        hideNav
                    />
                </div>
                <p className="reception-calendar-hint">Clique em um horário para abrir o lead.</p>
            </section>

            <section className="animate-in agenda-followups-section reception-section" style={{ animationDelay: '0.2s' }}>
                <div className="reception-section-head flex justify-between items-center">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <h3 className="navi-section-heading reception-section-heading">
                            <List size={18} color="var(--v500)" strokeWidth={2} /> Follow-ups pendentes
                        </h3>
                        <span className="badge badge-secondary reception-section-badge">{followUps.length}</span>
                    </div>
                </div>
                <p className="reception-hint">
                    Do mais recente para o mais antigo. Após {FOLLOWUP_AGENDA_MAX_DAYS} dias da data da aula, o follow-up sai desta lista e fica só no Kanban.
                </p>

                <div className="agenda-followups-grid">
                    {followUps.length > 0 ? followUps.map((lead, i) => {
                        const isPost = lead.status === LEAD_STATUS.COMPLETED;
                        const elapsedLabel = lead.daysAgo === 0 ? 'Hoje' : `há ${lead.daysAgo} ${lead.daysAgo === 1 ? 'dia' : 'dias'}`;
                        return (
                            <div
                                key={lead.id}
                                className={`follow-card follow-card--tile animate-in${isPost ? ' follow-card--tile-post' : ' follow-card--tile-recover'}`}
                                style={{ animationDelay: `${0.04 * i}s` }}
                            >
                                <button
                                    type="button"
                                    className="follow-card__main"
                                    onClick={() => navigate(`/lead/${lead.id}`)}
                                >
                                    <div className="follow-card__title-row">
                                        <strong className="follow-card__name">{lead.name}</strong>
                                        <span className={`follow-card__type-tag ${isPost ? 'follow-card__type-tag--post' : 'follow-card__type-tag--recover'}`}>
                                            {isPost ? 'Pós-aula' : 'Recuperar'}
                                        </span>
                                    </div>
                                    <span
                                        className="follow-card__elapsed"
                                        style={{ color: followupElapsedColor(lead.daysAgo) }}
                                        title={lead.daysAgo === 0 ? 'Dia da aula experimental' : `Há ${lead.daysAgo} dias desde a data da aula`}
                                    >
                                        {elapsedLabel}
                                    </span>
                                    <p className="follow-card__meta">
                                        {lead.phone || '—'}
                                        {lead.intention ? ` · ${lead.intention}` : ''}
                                        {lead.priority ? ` · ${lead.priority}` : ''}
                                    </p>
                                </button>
                                <button
                                    type="button"
                                    className="follow-card__wa"
                                    onClick={() => handleWhatsApp(lead)}
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
                                        <MessageCircle size={16} color="#fff" /> WhatsApp
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    className="follow-card__done"
                                    disabled={Boolean(savingFollowupDone[lead.id])}
                                    onClick={() => void markFollowupDone(lead)}
                                >
                                    {savingFollowupDone[lead.id] ? 'Salvando…' : 'Marcar feito'}
                                </button>
                            </div>
                        );
                    }) : (
                        <div className="empty-state agenda-followups-grid__empty">
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
            </section>
            </div>

            {listModalType ? (
                <div className="navi-modal-overlay" role="dialog" aria-modal="true" onClick={closeListModal}>
                    <div
                        className="card reception-list-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="reception-list-modal__head flex justify-between items-center gap-3">
                            <h3 className="navi-section-heading reception-list-modal__title" style={{ margin: 0 }}>{modalTitle}</h3>
                            <span className="badge badge-secondary flex-shrink-0">{modalListItems.length}</span>
                        </div>
                        <div className="reception-list-modal__scroll">
                        {modalListItems.length === 0 ? (
                            <div className="empty-state reception-list-modal__empty"><p>Nenhum item nessa lista.</p></div>
                        ) : (
                            <div className="flex-col agenda-followups-list">
                                {modalListItems.map((lead, i) => {
                                    const isFollowup = listModalType === 'followup';
                                    const isTasks = listModalType === 'tasks';
                                    const busy = Boolean(savingPresence[`${lead.id}:attended`] || savingPresence[`${lead.id}:missed`]);
                                    const followupBusy = Boolean(savingFollowupDone[lead.id]);
                                    const taskBusy = Boolean(savingTaskDone[String(lead?.id || '').trim()]);
                                    return (
                                        <div key={`${lead.id || lead.$id || i}-${i}`} className="card follow-card">
                                            <div
                                                className="flex justify-between items-center"
                                                onClick={() => {
                                                    if (isTasks) {
                                                        const leadId = String(lead?.lead_id || '').trim();
                                                        if (leadId) navigate(`/lead/${leadId}`);
                                                        return;
                                                    }
                                                    navigate(`/lead/${lead.id}`);
                                                }}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <strong className="agenda-followup-name">
                                                    {isTasks ? String(lead?.title || 'Tarefa') : lead.name}
                                                </strong>
                                                {isTasks ? (
                                                    <span className="status-pill">
                                                        {lead?.due_date ? new Date(`${lead.due_date}T00:00:00`).toLocaleDateString('pt-BR') : 'Sem prazo'}
                                                    </span>
                                                ) : isFollowup ? (
                                                    <span className={`status-pill ${lead.status === LEAD_STATUS.COMPLETED ? 'pill-success' : 'pill-danger'}`}>
                                                        {lead.status === LEAD_STATUS.COMPLETED ? 'Pós-Aula' : 'Recuperar'}
                                                    </span>
                                                ) : (
                                                    <span className="status-pill">{lead.scheduledDate || 'Sem data'}</span>
                                                )}
                                            </div>
                                            <div className="flex gap-2 agenda-followup-actions border-t">
                                                {isTasks ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="followup-action-btn flex-1"
                                                            disabled={taskBusy}
                                                            onClick={() => void markTaskAsDone(lead)}
                                                        >
                                                            {taskBusy ? 'Salvando…' : 'Marcar concluída'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="followup-action-btn flex-1"
                                                            onClick={() => navigate('/tasks')}
                                                        >
                                                            <ChevronRight size={14} /> Abrir tarefas
                                                        </button>
                                                    </>
                                                ) : !isFollowup ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="followup-action-btn flex-1"
                                                            disabled={busy}
                                                            onClick={() => void markLeadAttended(lead)}
                                                        >
                                                            {savingPresence[`${lead.id}:attended`] ? 'Salvando…' : 'Compareceu'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="followup-action-btn flex-1"
                                                            disabled={busy}
                                                            onClick={() => void markLeadMissed(lead)}
                                                        >
                                                            {savingPresence[`${lead.id}:missed`] ? 'Salvando…' : 'Não compareceu'}
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="followup-action-btn flex-1"
                                                            onClick={() => handleWhatsApp(lead)}
                                                        >
                                                            <MessageCircle size={14} color="#25D366" /> WhatsApp
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="followup-action-btn flex-1"
                                                            disabled={followupBusy}
                                                            onClick={() => void markFollowupDone(lead)}
                                                        >
                                                            {followupBusy ? 'Salvando…' : 'Marcar feito'}
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        </div>
                    </div>
                </div>
            ) : null}

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
        .reception-dashboard {
          --reception-section-pad: clamp(16px, 2.5vw, 22px);
          --border-radius-lg: 16px;
        }
        .reception-page-header {
          padding-bottom: 20px;
          margin-bottom: 8px;
          border-bottom: 1px solid var(--border);
        }
        .reception-page-header--split {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px 24px;
        }
        .reception-page-header__intro {
          flex: 1 1 220px;
          min-width: 0;
        }
        .reception-page-header__actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
          gap: 10px 12px;
          flex: 1 1 300px;
        }
        .reception-header-ai {
          flex: 1 1 200px;
          min-width: min(100%, 200px);
          max-width: 380px;
        }
        .reception-header-ai button { width: 100%; }
        .reception-header-new-lead {
          display: inline-flex !important;
          align-items: center;
          gap: 8px;
          font-weight: 700 !important;
          padding: 10px 18px !important;
          border-radius: var(--radius-sm) !important;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .reception-section {
          background: var(--surface);
          border: 1px solid var(--border-mid);
          border-radius: var(--radius);
          padding: var(--reception-section-pad);
          box-shadow: var(--shadow-sm);
        }
        .reception-section-head {
          gap: 10px;
          margin-bottom: 6px;
          align-items: flex-start;
        }
        @media (min-width: 520px) {
          .reception-section-head { align-items: center; }
        }
        .reception-section-heading {
          font-size: 1.02rem;
          font-weight: 700;
          letter-spacing: -0.02em;
        }
        .reception-section-badge {
          font-variant-numeric: tabular-nums;
        }
        .reception-section-lead {
          margin: 0 0 14px;
          font-size: 13px;
          line-height: 1.45;
          color: var(--text-secondary);
        }
        .reception-hint {
          margin: 0 0 14px;
          padding: 11px 14px;
          font-size: 12px;
          line-height: 1.45;
          color: var(--text-secondary);
          background: var(--v50);
          border: 1px solid var(--border-light);
          border-radius: var(--radius-sm);
          border-left: 3px solid var(--v200);
        }
        .reception-week-embed {
          margin-top: 2px;
        }
        .reception-week-panel__head {
          margin-bottom: 14px;
        }
        .reception-week-range {
          font-size: 13px;
          font-weight: 700;
          color: var(--ink);
          padding: 0 8px;
          white-space: nowrap;
        }
        .reception-week-refresh { margin-left: 2px; }
        .agenda-dash-week-nav {
          font-size: 12px;
          padding: 8px 14px;
          min-height: 38px;
        }
        .reception-calendar-hint {
          margin: 14px 0 0;
          font-size: 12px;
          color: var(--text-secondary);
          line-height: 1.45;
        }
        .agenda-followups-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        .agenda-followups-grid__empty {
          grid-column: 1 / -1;
        }
        @media (max-width: 1100px) {
          .agenda-followups-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 560px) {
          .agenda-followups-grid { grid-template-columns: 1fr; }
        }
        .reception-agenda-inner .follow-card--tile.card {
          border-left: none !important;
          border: 1px solid var(--border-mid);
          border-radius: var(--radius-sm);
          padding: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          align-items: stretch;
          box-shadow: var(--shadow-sm);
        }
        .follow-card--tile-recover {
          border-top: 2px solid #e24b4a !important;
        }
        .follow-card--tile-post {
          border-top: 2px solid #639922 !important;
        }
        .follow-card__main {
          display: block;
          width: 100%;
          padding: 12px 14px 10px;
          border: none;
          background: none;
          text-align: left;
          font: inherit;
          cursor: pointer;
          color: inherit;
          -webkit-tap-highlight-color: transparent;
        }
        .follow-card__title-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 6px;
        }
        .follow-card__name {
          font-size: 14px;
          font-weight: 600;
          line-height: 1.25;
          min-width: 0;
          text-align: left;
        }
        .follow-card__type-tag {
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          padding: 3px 8px;
          border-radius: 99px;
          flex-shrink: 0;
        }
        .follow-card__type-tag--recover {
          background: rgba(226, 75, 74, 0.14);
          color: #a32d2d;
        }
        .follow-card__type-tag--post {
          background: rgba(99, 153, 34, 0.18);
          color: #4a7519;
        }
        .follow-card__elapsed {
          display: block;
          font-size: 12px;
          font-weight: 700;
          margin-bottom: 6px;
        }
        .follow-card__meta {
          font-size: 11px;
          color: var(--text-secondary);
          line-height: 1.35;
          margin: 0;
          text-align: left;
        }
        .follow-card__wa {
          margin: 8px 12px 0;
          width: calc(100% - 24px);
          align-self: center;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 11px 12px;
          border: none;
          border-radius: var(--radius-sm);
          background: #25d366;
          color: #fff !important;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          box-sizing: border-box;
        }
        .follow-card__wa:hover { filter: brightness(0.97); }
        .follow-card__wa:disabled { opacity: 0.55; cursor: not-allowed; }
        .follow-card__done {
          margin: 8px 12px 12px;
          width: calc(100% - 24px);
          align-self: center;
          box-sizing: border-box;
          padding: 10px 12px;
          border: 1px solid var(--border-mid);
          border-radius: var(--radius-sm);
          background: var(--v50);
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
        }
        .follow-card__done:hover:not(:disabled) {
          border-color: var(--border-strong);
          color: var(--ink);
        }
        .follow-card__done:disabled { opacity: 0.5; cursor: not-allowed; }
        .reception-section-tools {
          padding: 4px 6px;
          background: var(--v50);
          border-radius: 10px;
          border: 1px solid var(--border-light);
        }
        .agenda-kpi-card--clickable:hover .agenda-kpi-trend--cta {
          color: var(--v700);
        }
        .agenda-kpi-card--clickable:hover .agenda-kpi-trend--cta svg {
          color: var(--v500);
        }
        .agenda-kpi-card--followup {
          border-left: 3px solid #e24b4a;
          border-radius: 0 var(--border-radius-lg) var(--border-radius-lg) 0;
        }
        .agenda-kpi-card--followup::before {
          border-radius: 0 var(--border-radius-lg) 0 0;
        }
        .agenda-kpi-value--followup {
          color: #a32d2d !important;
        }
        .agenda-kpi-trend--followup {
          color: #e24b4a !important;
        }
        .agenda-kpi-trend--followup svg {
          color: #e24b4a !important;
          opacity: 1 !important;
        }
        .agenda-kpi-card--clickable:hover .agenda-kpi-trend--followup {
          color: #8f2e2e !important;
        }
        .agenda-kpi-card--clickable:hover .agenda-kpi-trend--followup svg {
          color: #8f2e2e !important;
        }
        .reception-list-modal {
          width: min(760px, calc(100vw - 24px));
          max-height: min(85vh, 900px);
          display: flex;
          flex-direction: column;
          padding: 0;
          overflow: hidden;
          border-radius: var(--radius) !important;
          border: 1px solid var(--border-mid) !important;
          box-shadow: var(--shadow-lg) !important;
          background: var(--surface) !important;
        }
        .reception-list-modal__head {
          flex-shrink: 0;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border);
          background: linear-gradient(180deg, var(--v50) 0%, var(--surface) 100%);
        }
        .reception-list-modal__title {
          font-size: 1.05rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          min-width: 0;
        }
        .reception-list-modal__scroll {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 16px 20px 20px;
          -webkit-overflow-scrolling: touch;
        }
        .reception-list-modal__empty {
          padding: 28px 12px;
          text-align: center;
        }
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
          max-width: 1280px;
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
          gap: 22px;
          width: 100%;
          margin-top: 26px;
        }
        .agenda-top-row {
          display: grid;
          grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
          gap: 14px;
          align-items: start;
        }
        @media (max-width: 760px) {
          .agenda-top-row {
            grid-template-columns: minmax(0, 1fr);
            gap: 0;
          }
        }
        .agenda-kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          align-items: stretch;
        }
        @media (max-width: 1100px) {
          .agenda-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 700px) {
          .agenda-kpi-grid { grid-template-columns: 1fr; }
        }
        .agenda-kpi-card {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: stretch;
          justify-content: space-between;
          min-height: 152px;
          padding: 18px 16px 14px;
          border-radius: var(--radius-sm);
          background: var(--surface);
          border: 1px solid var(--border-mid);
          box-shadow: var(--shadow-sm);
          transition: transform 0.2s ease, box-shadow 0.22s ease, border-color 0.2s ease;
          overflow: hidden;
        }
        .agenda-kpi-card-stack {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 6px;
          width: 100%;
        }
        .agenda-kpi-card--clickable {
          text-align: left;
          width: 100%;
          cursor: pointer;
          appearance: none;
          font-family: inherit;
        }
        .agenda-kpi-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, var(--v500), var(--v400));
          border-radius: var(--radius-sm) var(--radius-sm) 0 0;
          opacity: 0.92;
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
          font-size: 0.62rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--text-secondary);
          margin-bottom: 0;
          line-height: 1.3;
          padding-right: 0;
          width: 100%;
        }
        .agenda-kpi-value {
          font-size: clamp(1.55rem, 2.6vw, 2.05rem);
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          line-height: 1.1;
          color: var(--v500);
          letter-spacing: -0.03em;
          width: 100%;
        }
        .agenda-kpi-trend.agenda-kpi-cta {
          margin-top: auto;
          padding-top: 12px;
        }
        .agenda-kpi-trend {
          display: flex;
          flex-wrap: nowrap;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
          font-size: 0.76rem;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
        .agenda-kpi-trend--cta {
          color: var(--v500);
        }
        .agenda-kpi-trend--cta svg {
          color: var(--v400);
          opacity: 0.95;
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
          border-radius: var(--radius-sm);
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
        .agenda-followups-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .agenda-time-group {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .agenda-time-group-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .agenda-time-sep {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 2px 2px;
        }
        .agenda-time-label {
          font-size: 13px;
          font-weight: 600;
          color: var(--v500);
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.01em;
          flex: 0 0 auto;
        }
        .agenda-time-line {
          height: 1px;
          background: rgba(91, 63, 191, 0.22);
          flex: 1 1 auto;
        }
        .reception-agenda-inner .agenda-experimental-cards .agenda-card.card {
          padding: 10px 12px;
        }
        .reception-agenda-inner .follow-card.card {
          background: var(--surface);
          border: 1px solid var(--border-mid);
          border-radius: var(--radius-sm);
          padding: 12px 14px;
          box-shadow: var(--shadow-sm);
        }
        .agenda-experimental-card {
          position: relative;
        }
        .agenda-card-more-btn {
          position: absolute;
          top: 8px;
          right: 10px;
          width: 32px;
          height: 32px;
          border-radius: 10px;
          border: 1px solid rgba(18, 16, 42, 0.12);
          background: var(--surface);
          color: var(--text-secondary);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
          padding: 0;
        }
        .agenda-card-more-btn:hover {
          border-color: rgba(91, 63, 191, 0.22);
          color: var(--v500);
        }
        .agenda-experimental-main {
          padding-right: 34px;
        }
        .agenda-experimental-name-row {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .agenda-experimental-name {
          font-size: 13px;
          font-weight: 500;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .agenda-followup-name {
          font-size: 13px;
          font-weight: 500;
        }
        .agenda-followup-sub {
          margin-top: 2px;
          font-size: 11px;
          color: var(--text-secondary);
        }
        .agenda-experimental-meta {
          margin-top: 2px;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--text-secondary);
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .agenda-experimental-primary-actions {
          display: flex;
          gap: 8px;
          margin-top: 10px;
        }
        .agenda-followup-actions {
          margin-top: 8px;
          padding-top: 8px;
        }
        .agenda-presence-btn {
          flex: 1;
          min-width: 0;
          height: 28px;
          min-height: 28px;
          border-radius: 12px;
          border: 1px solid #d1d5db;
          background: #fff;
          color: #374151;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          padding: 0 10px;
          transition: var(--transition);
          white-space: nowrap;
        }
        .agenda-presence-btn:hover {
          border-color: #9ca3af;
          color: #111827;
        }
        .agenda-presence-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .agenda-presence-btn.is-faded {
          opacity: 0.4;
        }
        .agenda-presence-btn--attended.is-active {
          background: #16a34a;
          color: #fff;
          border-color: transparent;
        }
        .agenda-presence-btn--missed.is-active {
          background: #dc2626;
          color: #fff;
          border-color: transparent;
        }
        .reception-agenda-inner .agenda-followups-section .status-pill {
          font-size: 10px;
          padding: 2px 8px;
          border-radius: 99px;
        }
        .reception-agenda-inner .agenda-followups-section .urgency-tag {
          font-size: 11px;
        }
        .reception-agenda-inner .agenda-followups-section .followup-action-btn {
          min-height: 28px;
          height: 28px;
          font-size: 12px;
          padding: 0 10px;
        }
        .agenda-experimental-more-actions {
          display: flex;
          gap: 8px;
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid rgba(91, 63, 191, 0.09);
        }
        .agenda-card--attended {
          opacity: 0.5;
          background: rgba(18, 16, 42, 0.02);
        }
        .agenda-card--attended .agenda-experimental-name {
          text-decoration: line-through;
          text-decoration-color: rgba(18, 16, 42, 0.22);
        }
        .reception-agenda-inner .agenda-card.card {
          position: relative;
          border-radius: var(--radius-sm);
          padding: 18px 18px 16px;
          background: var(--surface);
          border: 1px solid var(--border-mid);
          border-left: 3px solid var(--v500);
          box-shadow: var(--shadow-sm);
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
          .reception-agenda-inner .follow-card.card:not(.follow-card--tile) {
            padding: 14px 14px 12px;
            border-radius: 14px;
          }
          .reception-agenda-inner .follow-card--tile.card {
            padding: 0 !important;
          }
          .agenda-week-section > .reception-week-panel__head,
          .agenda-followups-section > .reception-section-head {
            flex-wrap: wrap;
            gap: 10px;
          }
        }
        @media (max-width: 760px) {
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
        </div>
    );
};

export default Dashboard;
