import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import { useTaskStore } from '../store/useTaskStore';
import { useUiStore } from '../store/useUiStore';
import { useNavigate } from 'react-router-dom';
import { Query } from 'appwrite';
import { databases, DB_ID, LEAD_EVENTS_COL } from '../lib/appwrite';
import { DEFAULT_WHATSAPP_TEMPLATES } from '../../lib/whatsappTemplateDefaults.js';
import { useWhatsappTemplates } from '../lib/useWhatsappTemplates.js';
import { sendWhatsappTemplateOutbound } from '../lib/outboundWhatsappTemplate.js';
import { Plus, Calendar, ChevronRight, ChevronDown, MessageCircle, RefreshCcw, List, LayoutGrid, CheckSquare, Check, CheckCircle2, DoorOpen, Loader2 } from 'lucide-react';
import { addRipple } from '../lib/addRipple.js';
import FollowUpMicroToast from '../components/dashboard/FollowUpMicroToast.jsx';
import { useAcademyControlId } from '../hooks/useAcademyControlId.js';
import { useControlIdMonitor } from '../hooks/useControlIdMonitor.js';
import { releaseControlIdGate } from '../lib/controlidApi.js';
import { Link } from 'react-router-dom';
import NaviLogo from '../components/NaviLogo.jsx';
import Hint from '../components/shared/Hint.jsx';
import { contactLabelSingular } from '../lib/terminology.js';
import { PIPELINE_WAITING_DECISION_STAGE, PIPELINE_STAGES } from '../constants/pipeline.js';
import { addLeadEvent } from '../lib/leadEvents.js';
import { isLeadScheduledForExperimental } from '../lib/leadStageRules.js';
import NlCommandBar, { NlCommandBarTrigger } from '../components/NlCommandBar';
import { LEADS_REFRESH } from '../lib/leadTimelineEvents.js';
import AgendaCalendarWeek, {
    formatWeekRangeLabel,
    filterLeadsInCivilWeek,
} from '../components/AgendaCalendarWeek.jsx';
import { useTerms } from '../lib/terminology.js';
import EmptyState from '../components/shared/EmptyState.jsx';
import ErrorBanner from '../components/shared/ErrorBanner.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import ModalShell from '../components/shared/ModalShell.jsx';
import ConfirmDialog from '../components/shared/ConfirmDialog.jsx';
const DEFAULT_STAGE_SLA_DAYS = 3;
/** Follow-ups com aula há >= N dias somem desta agenda e ficam só no Kanban */
const FOLLOWUP_AGENDA_MAX_DAYS = 7;
const Dashboard = () => {
    const navigate = useNavigate();
    const leads = useLeadStore((s) => s.leads);
    const loading = useLeadStore((s) => s.loading);
    const fetchLeads = useLeadStore((s) => s.fetchLeads);
    const academyId = useLeadStore((s) => s.academyId);
    const academyList = useLeadStore((s) => s.academyList);
    const leadsError = useLeadStore((s) => s.leadsError);
    const leadsLastFetchedAt = useLeadStore((s) => s.leadsLastFetchedAt);
    const vertical = useLeadStore((s) => s.vertical);
    const terms = useTerms();
    const labels = useLeadStore((s) => s.labels);
    const contactLabel = useMemo(() => contactLabelSingular(labels), [labels]);
    const trialSeriesPlural = vertical === 'physio' ? 'Avaliações' : 'Aulas experimentais';
    const receptionSubtitle =
        vertical === 'physio' ? 'Controle de avaliações e retornos' : 'Controle de aulas experimentais e retornos';
    const tasks = useTaskStore((s) => s.tasks);
    const fetchTasks = useTaskStore((s) => s.fetchTasks);
    const updateTask = useTaskStore((s) => s.updateTask);
    const patchTaskLocal = useTaskStore((s) => s.patchTaskLocal);
    const isUpdatingTask = useTaskStore((s) => s.isUpdating);
    const addToast = useUiStore((s) => s.addToast);
    const controlIdCfg = useAcademyControlId(academyId);
    useControlIdMonitor(academyId, controlIdCfg.enabled);
    const [gateReleaseOpen, setGateReleaseOpen] = useState(false);
    const [gateReleasing, setGateReleasing] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [academyWa, setAcademyWa] = useState({
        name: '',
        zapster_instance_id: '',
        templates: DEFAULT_WHATSAPP_TEMPLATES
    });
    const {
        templates: dashWaTemplates,
        academyName: dashWaName,
        zapsterInstanceId: dashWaZap,
        error: dashWaError,
    } = useWhatsappTemplates(academyId);
    const [academyWaLoadFailed, setAcademyWaLoadFailed] = useState(false);
    const [savingPresence, setSavingPresence] = useState({});
    const [nlOpen, setNlOpen] = useState(false);
    const [listModalType, setListModalType] = useState('');
    const [followupDoneAtByLead, setFollowupDoneAtByLead] = useState({});
    const [savingFollowupDone, setSavingFollowupDone] = useState({});
    const [removingFollowupIds, setRemovingFollowupIds] = useState({});
    const [flashingFollowupIds, setFlashingFollowupIds] = useState({});
    const [leavingFollowupIds, setLeavingFollowupIds] = useState({});
    const [waStateByLead, setWaStateByLead] = useState({});
    const [followUpMicroToastOpen, setFollowUpMicroToastOpen] = useState(false);
    const [dashboardWeekOffset, setDashboardWeekOffset] = useState(0);
    const [isDashboardMobile, setIsDashboardMobile] = useState(
        () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
    );
    const [isAgendaStacked, setIsAgendaStacked] = useState(
        () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1099px)').matches
    );
    const [followUpsPanelOpen, setFollowUpsPanelOpen] = useState(
        () => typeof window === 'undefined' || !window.matchMedia('(max-width: 1099px)').matches
    );
    const hiddenAtRef = useRef(null);
    const followUpsSectionRef = useRef(null);

    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        const mq = window.matchMedia('(max-width: 767px)');
        const onChange = () => setIsDashboardMobile(mq.matches);
        onChange();
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        const mq = window.matchMedia('(max-width: 1099px)');
        const onChange = () => {
            setIsAgendaStacked(mq.matches);
            if (!mq.matches) setFollowUpsPanelOpen(true);
        };
        onChange();
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);

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
        if (!academyId) return undefined;
        const STALE_MS = 5 * 60 * 1000;
        if (leads.length > 0 && leadsLastFetchedAt && Date.now() - leadsLastFetchedAt < STALE_MS) {
            return () => {
                const { loading } = useLeadStore.getState();
                if (loading) {
                    useLeadStore.setState({ loading: false });
                }
            };
        }
        console.debug('[Dashboard] fetchLeads iniciado', {
            loading: useLeadStore.getState().loading,
            leadsLength: leads.length,
            leadsLastFetchedAt,
        });
        void fetchLeads({ reset: true });
        return () => {
            const { loading } = useLeadStore.getState();
            if (loading) {
                useLeadStore.setState({ loading: false });
            }
        };
    }, [academyId, leads.length, leadsLastFetchedAt, fetchLeads]);

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
        if (!dashWaTemplates) return;
        setAcademyWaLoadFailed(Boolean(dashWaError));
        setAcademyWa({
            name: dashWaName || '',
            zapster_instance_id: dashWaZap || '',
            templates: dashWaTemplates,
        });
    }, [dashWaTemplates, dashWaName, dashWaZap, dashWaError]);

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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

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

    const weekScheduled = useMemo(
        () => filterLeadsInCivilWeek(allScheduled, 0),
        [allScheduled]
    );

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

    const isZeroState = !loading && leads.length === 0 && (tasks || []).length === 0;

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

    const scheduledInVisibleWeekCount = useMemo(
        () => filterLeadsInCivilWeek(allScheduled, dashboardWeekOffset).length,
        [allScheduled, dashboardWeekOffset]
    );

    const scrollToFollowUps = () => {
        setFollowUpsPanelOpen(true);
        requestAnimationFrame(() => {
            followUpsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    };

    const handleKpiClick = (cardKey) => {
        if (cardKey === 'followup') {
            scrollToFollowUps();
            return;
        }
        setListModalType(cardKey);
    };

    const modalListItems =
        listModalType === 'today'
            ? todayScheduled
            : listModalType === 'week'
              ? weekScheduled
              : listModalType === 'tasks'
                ? pendingTasks
                : [];

    const modalTitle =
        listModalType === 'today'
            ? `${trialSeriesPlural} hoje`
            : listModalType === 'week'
              ? `${trialSeriesPlural} esta semana`
              : listModalType === 'tasks'
                ? 'Próximas tarefas'
                : '';

    const sendDashboardTemplate = async (lead, templateKey) =>
        sendWhatsappTemplateOutbound({
            lead,
            academyId,
            academyName: academyWa.name,
            templateKey,
            templatesMap: academyWa.templates,
            zapsterInstanceId: academyWa.zapster_instance_id,
            onToast: (t) => addToast(t)
        });

    const handleFollowUpWhatsApp = (lead, e) => {
        const leadId = String(lead?.id || '').trim();
        if (!leadId) return;
        const waState = waStateByLead[leadId];
        if (waState === 'loading' || waState === 'sent') return;
        if (e?.currentTarget) addRipple(e.currentTarget, e);

        const startedAt = Date.now();
        setWaStateByLead((prev) => ({ ...prev, [leadId]: 'loading' }));
        const key = lead?.status === LEAD_STATUS.MISSED ? 'missed' : 'post_class';

        void (async () => {
            const result = await sendDashboardTemplate(lead, key);
            if (!result?.ok) {
                setWaStateByLead((prev) => {
                    const next = { ...prev };
                    delete next[leadId];
                    return next;
                });
                return;
            }
            const delay = Math.max(0, 1200 - (Date.now() - startedAt));
            window.setTimeout(() => {
                setWaStateByLead((prev) => ({ ...prev, [leadId]: 'sent' }));
            }, delay);
        })();
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

    const markFollowupDone = async (lead, e) => {
        const leadId = String(lead?.id || '').trim();
        if (
            !leadId ||
            savingFollowupDone[leadId] ||
            flashingFollowupIds[leadId] ||
            leavingFollowupIds[leadId]
        ) {
            return;
        }
        if (e?.currentTarget) addRipple(e.currentTarget, e);

        const startedAt = Date.now();
        setFlashingFollowupIds((prev) => ({ ...prev, [leadId]: true }));
        setSavingFollowupDone((prev) => ({ ...prev, [leadId]: true }));

        const flashTimer = window.setTimeout(() => {
            setFlashingFollowupIds((prev) => {
                const next = { ...prev };
                delete next[leadId];
                return next;
            });
            setLeavingFollowupIds((prev) => ({ ...prev, [leadId]: true }));
        }, 700);

        const clearFollowupVisuals = () => {
            window.clearTimeout(flashTimer);
            setFlashingFollowupIds((prev) => {
                const next = { ...prev };
                delete next[leadId];
                return next;
            });
            setLeavingFollowupIds((prev) => {
                const next = { ...prev };
                delete next[leadId];
                return next;
            });
            setRemovingFollowupIds((prev) => {
                const next = { ...prev };
                delete next[leadId];
                return next;
            });
        };

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

            const applySuccess = () => {
                setFollowupDoneAtByLead((prev) => ({ ...prev, [leadId]: nowIso }));
                setFollowUpMicroToastOpen(true);
                clearFollowupVisuals();
            };

            const elapsed = Date.now() - startedAt;
            window.setTimeout(applySuccess, Math.max(0, 1050 - elapsed));
        } catch {
            clearFollowupVisuals();
            addToast({ type: 'error', message: 'Erro ao marcar follow-up como feito.' });
        } finally {
            setSavingFollowupDone((prev) => {
                const next = { ...prev };
                delete next[leadId];
                return next;
            });
        }
    };

    const confirmGateRelease = async () => {
        if (!academyId || gateReleasing) return;
        setGateReleasing(true);
        try {
            const data = await releaseControlIdGate(academyId);
            if (!data.sucesso) throw new Error(data.erro || 'Falha ao liberar catraca');
            addToast({ type: 'success', message: 'Catraca liberada.' });
            setGateReleaseOpen(false);
        } catch (e) {
            addToast({ type: 'error', message: e?.message || 'Erro ao liberar catraca' });
        } finally {
            setGateReleasing(false);
        }
    };

    const markTaskAsDone = async (task) => {
        const taskId = String(task?.id || '').trim();
        if (!taskId || isUpdatingTask(taskId)) return;
        const previousStatus = task.status;
        patchTaskLocal(taskId, { status: 'done' });
        try {
            await updateTask(taskId, { status: 'done' });
            addToast({ type: 'success', message: 'Tarefa concluída.' });
        } catch {
            patchTaskLocal(taskId, { status: previousStatus });
            addToast({ type: 'error', message: 'Erro ao concluir tarefa.' });
        }
    };

    return (
        <div className="container reception-dashboard">
            <div className="reception-agenda-inner reception-agenda-inner--wide">
            <PageHeader
                className="reception-page-header reception-dashboard-page-header"
                title="Hoje"
                subtitle={receptionSubtitle}
                actions={
                    <>
                        {!isDashboardMobile ? (
                            <div className="reception-header-ai reception-command-bar">
                                <NlCommandBarTrigger onClick={() => setNlOpen(true)} />
                            </div>
                        ) : null}
                        {controlIdCfg.enabled && (
                            <button
                                type="button"
                                className="btn-secondary"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                onClick={() => setGateReleaseOpen(true)}
                            >
                                <DoorOpen size={18} aria-hidden />
                                Liberar catraca
                            </button>
                        )}
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
                    </>
                }
            />

            {leadsError && (
                <ErrorBanner
                    message="Não foi possível carregar os dados."
                    onRetry={() => void fetchLeads()}
                />
            )}

            <div className="agenda-kpi-grid reception-kpi-grid animate-in" style={{ animationDelay: '0.05s' }} aria-busy={loading}>
                {loading ? (
                    [1, 2, 3, 4].map((i) => <div key={i} className="agenda-kpi-card agenda-kpi-skeleton" style={{ minHeight: 120, flex: '1 1 140px' }} />)
                ) : (
                    [
                        {
                            key: 'today',
                            title: `${trialSeriesPlural} hoje`,
                            count: todayScheduled.length,
                            cta: 'Ver agenda',
                            Icon: Calendar,
                            kind: 'info',
                        },
                        {
                            key: 'week',
                            title: `${trialSeriesPlural} esta semana`,
                            count: weekScheduled.length,
                            cta: 'Ver lista',
                            Icon: LayoutGrid,
                            kind: 'info',
                        },
                        {
                            key: 'followup',
                            title: 'Follow-ups pendentes',
                            count: followUps.length,
                            cta: 'Ver abaixo',
                            Icon: ChevronDown,
                            kind: 'attention',
                            attentionTone: 'danger',
                        },
                        {
                            key: 'tasks',
                            title: 'Próximas tarefas',
                            count: pendingTasks.length,
                            cta: 'Ver tarefas',
                            Icon: CheckSquare,
                            kind: 'attention',
                            attentionTone: 'primary',
                        },
                    ].map((card) => {
                        const isAttention = card.kind === 'attention';
                        const isOk = card.count === 0;
                        const hasValue = card.count > 0;
                        const kpiClass = [
                            'agenda-kpi-card',
                            'agenda-kpi-card--clickable',
                            isAttention && hasValue ? `agenda-kpi-card--attention agenda-kpi-card--attention-${card.attentionTone}` : '',
                            isAttention && isOk ? 'agenda-kpi-card--ok' : '',
                            !isAttention && isOk ? 'agenda-kpi-card--muted' : '',
                            card.key === 'followup' && hasValue ? 'agenda-kpi-card--followup' : '',
                        ]
                            .filter(Boolean)
                            .join(' ');
                        return (
                        <button
                            key={card.key}
                            type="button"
                            className={kpiClass}
                            onClick={() => handleKpiClick(card.key)}
                        >
                            <div className="agenda-kpi-card-stack">
                                <div className="agenda-kpi-label">
                                    <span>{card.title}</span>
                                    {card.key === 'today' ? (
                                        <Hint
                                            text={`${contactLabel}s com ${terms.trialShort.toLowerCase()} agendada para hoje`}
                                            position="top"
                                            className="agenda-kpi-hint"
                                        />
                                    ) : null}
                                </div>
                                {isOk ? (
                                        <div className="agenda-kpi-ok" aria-label="Tudo em dia">
                                            <Check size={22} strokeWidth={2.5} aria-hidden />
                                            <span>Tudo em dia!</span>
                                        </div>
                                    ) : (
                                        <div
                                            className={`agenda-kpi-value${
                                                isAttention && hasValue ? ' agenda-kpi-value--attention' : ''
                                            }${card.key === 'followup' && hasValue ? ' agenda-kpi-value--followup' : ''}${
                                                card.key === 'tasks' && hasValue ? ' agenda-kpi-value--tasks' : ''
                                            }`}
                                        >
                                            {card.count}
                                        </div>
                                    )}
                                    {!isOk && isAttention ? (
                                        <p className="agenda-kpi-context">
                                            {card.count === 1 ? '1 pendente' : `${card.count} pendentes`}
                                        </p>
                                    ) : null}
                                    {!isOk && !isAttention ? (
                                        <p className="agenda-kpi-context agenda-kpi-context--info">
                                            {card.key === 'today'
                                                ? 'agendadas para hoje'
                                                : 'seg–sáb desta semana'}
                                        </p>
                                    ) : null}
                            </div>
                            <div
                                className={`agenda-kpi-trend agenda-kpi-cta${
                                    card.key === 'followup' && hasValue
                                            ? ' agenda-kpi-trend--followup'
                                            : ' agenda-kpi-trend--cta'
                                }`}
                            >
                                <card.Icon size={16} strokeWidth={2} />
                                <span>{isOk ? 'Ver detalhes' : card.cta}</span>
                            </div>
                        </button>
                        );
                    })
                )}
            </div>

            {isDashboardMobile ? (
                <div className="reception-header-ai-mobile reception-command-bar animate-in" style={{ animationDelay: '0.08s' }}>
                    <NlCommandBarTrigger onClick={() => setNlOpen(true)} />
                </div>
            ) : null}

            {isZeroState ? (
                <section className="dashboard-zero-welcome card animate-in" style={{ animationDelay: '0.1s', marginTop: 16 }}>
                    <div className="dashboard-zero-welcome__icon" aria-hidden>
                        <NaviLogo size={40} />
                    </div>
                    <h2 className="dashboard-zero-welcome__title">Bem-vindo à Nave!</h2>
                    <p className="dashboard-zero-welcome__text">
                        Comece adicionando o primeiro {contactLabel.toLowerCase()} para acompanhar a jornada até a matrícula.
                    </p>
                    <div className="dashboard-zero-welcome__actions">
                        <button type="button" className="btn-primary" onClick={() => navigate('/new-lead')}>
                            <Plus size={18} strokeWidth={2.25} aria-hidden />
                            Adicionar primeiro {contactLabel.toLowerCase()}
                        </button>
                        <Link to="/pipeline" className="dashboard-zero-welcome__link">
                            Ver como funciona o funil →
                        </Link>
                    </div>
                </section>
            ) : null}

            <div className="agenda-page-stack">
            <section className="animate-in agenda-week-section reception-section reception-week-panel" style={{ animationDelay: '0.15s' }}>
                <div className="reception-week-panel__head">
                    <div className="reception-week-panel__title-row">
                        <h3 className="navi-section-heading reception-section-heading reception-week-panel__title">
                            <Calendar size={18} color="var(--petroleo)" strokeWidth={2} /> Agenda da semana
                        </h3>
                        <span
                            className="badge reception-week-count-badge"
                            title={`${trialSeriesPlural} na semana exibida`}
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
                            {formatWeekRangeLabel(dashboardWeekOffset, { endOnSaturday: true })}
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
                        prioritizeTodayOnMobile={isDashboardMobile}
                    />
                </div>
                {scheduledInVisibleWeekCount > 0 ? (
                    <p className="reception-calendar-hint">Toque no nome para abrir o contato · use os botões para registrar presença</p>
                ) : null}
            </section>

            <div className="agenda-section-divider" aria-hidden />
            <section
                id="follow-ups"
                ref={followUpsSectionRef}
                className={`animate-in agenda-followups-section reception-section${
                    isAgendaStacked && !followUpsPanelOpen ? ' agenda-followups-section--collapsed' : ''
                }`}
                style={{ animationDelay: '0.2s' }}
            >
                <div className="reception-section-head agenda-followups-section__head">
                    {isAgendaStacked ? (
                        <button
                            type="button"
                            className="agenda-followups-section__toggle"
                            onClick={() => setFollowUpsPanelOpen((open) => !open)}
                            aria-expanded={followUpsPanelOpen}
                            aria-controls="follow-ups-panel-body"
                        >
                            <span className="agenda-followups-section__toggle-label flex items-center gap-2 flex-wrap min-w-0">
                                <span className="navi-section-heading reception-section-heading">
                                    <List size={18} color="var(--v500)" strokeWidth={2} /> Follow-ups pendentes
                                </span>
                                <span className="badge badge-secondary reception-section-badge">{followUps.length}</span>
                            </span>
                            <ChevronDown
                                size={18}
                                strokeWidth={2}
                                className={`agenda-followups-section__chevron${
                                    followUpsPanelOpen ? ' agenda-followups-section__chevron--open' : ''
                                }`}
                                aria-hidden
                            />
                        </button>
                    ) : (
                        <div className="agenda-followups-section__toggle agenda-followups-section__toggle--static">
                            <span className="agenda-followups-section__toggle-label flex items-center gap-2 flex-wrap min-w-0">
                                <h3 className="navi-section-heading reception-section-heading">
                                    <List size={18} color="var(--v500)" strokeWidth={2} /> Follow-ups pendentes
                                </h3>
                                <span className="badge badge-secondary reception-section-badge">{followUps.length}</span>
                            </span>
                        </div>
                    )}
                </div>
                <div id="follow-ups-panel-body" className="agenda-followups-section__body">
                <p className="reception-hint">
                    Do mais recente para o mais antigo. Após {FOLLOWUP_AGENDA_MAX_DAYS} dias da data da{' '}
                    {vertical === 'physio' ? 'avaliação' : 'aula'}, o follow-up sai desta lista e fica só no Kanban.
                </p>

                <div className="fu-list-card">
                    {followUps.length > 0 ? followUps.map((lead, i) => {
                        const isPost = lead.status === LEAD_STATUS.COMPLETED;
                        const leadId = String(lead.id || '').trim();
                        const waState = waStateByLead[leadId] || 'idle';
                        const elapsedLabel =
                            lead.daysAgo === 0 ? 'hoje' : lead.daysAgo === 1 ? 'há 1 dia' : `há ${lead.daysAgo} dias`;
                        const elapsedClass =
                            lead.daysAgo === 0 ? 'fu-elapsed fu-elapsed--today' : lead.daysAgo === 1 ? 'fu-elapsed fu-elapsed--1' : 'fu-elapsed fu-elapsed--2plus';
                        return (
                            <div
                                key={lead.id}
                                className={`fu-row animate-in${lead.daysAgo === 0 ? ' fu-row--today' : ''}${
                                    flashingFollowupIds[leadId] ? ' fu-row--flashing' : ''
                                }${leavingFollowupIds[leadId] ? ' fu-row--leaving' : ''}${
                                    removingFollowupIds[lead.id] ? ' fu-row--removing' : ''
                                }${i === followUps.length - 1 ? ' fu-row--last' : ''}`}
                                style={{ animationDelay: `${0.04 * i}s` }}
                            >
                                <span
                                    className={`fu-dot ${isPost ? 'fu-dot--post' : 'fu-dot--recover'}`}
                                    aria-hidden
                                />
                                <button
                                    type="button"
                                    className="fu-name"
                                    onClick={() => navigate(`/lead/${lead.id}`)}
                                >
                                    {lead.name}
                                </button>
                                <span className="fu-phone">
                                    {lead.phone || '—'}
                                </span>
                                <span
                                    className={elapsedClass}
                                    title={
                                        lead.daysAgo === 0
                                            ? (vertical === 'physio' ? 'Dia da avaliação' : 'Dia da aula experimental')
                                            : `Há ${lead.daysAgo} dias desde a data da ${vertical === 'physio' ? 'avaliação' : 'aula'}`
                                    }
                                >
                                    {elapsedLabel}
                                </span>
                                <span className={`fu-type-badge ${isPost ? 'fu-type-badge--post' : 'fu-type-badge--recover'}`}>
                                    {isPost ? (vertical === 'physio' ? 'Pós-avaliação' : 'Pós-aula') : 'Recuperar'}
                                </span>
                                <div className="fu-actions">
                                    <button
                                        type="button"
                                        className={`fu-btn-wa wa-btn${waState === 'loading' ? ' wa-btn--loading' : ''}${
                                            waState === 'sent' ? ' wa-btn--sent' : ''
                                        }`}
                                        disabled={waState === 'sent'}
                                        aria-busy={waState === 'loading'}
                                        onClick={(e) => handleFollowUpWhatsApp(lead, e)}
                                    >
                                        <span className="dashboard-wa-btn-inner">
                                            {academyWaLoadFailed && waState === 'idle' && (
                                                <span
                                                    className="dashboard-wa-warning-badge"
                                                    title={`Não foi possível carregar a configuração da ${terms.workspaceNoun}. O WhatsApp pode não funcionar.`}
                                                    aria-hidden
                                                >
                                                    ⚠️
                                                </span>
                                            )}
                                            {waState === 'loading' ? (
                                                <>
                                                    <Loader2 className="wa-icon wa-icon--spin" size={14} color="#fff" aria-hidden />
                                                    Abrindo…
                                                </>
                                            ) : waState === 'sent' ? (
                                                <>
                                                    <Check className="wa-icon" size={14} color="#fff" strokeWidth={2.5} aria-hidden />
                                                    Enviado
                                                </>
                                            ) : (
                                                <>
                                                    <MessageCircle className="wa-icon" size={14} color="#fff" aria-hidden />
                                                    WhatsApp
                                                </>
                                            )}
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        className="fu-btn-done mk-btn"
                                        disabled={Boolean(
                                            savingFollowupDone[leadId] ||
                                            flashingFollowupIds[leadId] ||
                                            leavingFollowupIds[leadId]
                                        )}
                                        onClick={(e) => void markFollowupDone(lead, e)}
                                    >
                                        {savingFollowupDone[leadId] ? 'Salvando…' : 'Marcar feito'}
                                    </button>
                                </div>
                            </div>
                        );
                    }) : (
                        <div className="fu-list-empty fu-list-empty--all-done" role="status">
                            <CheckCircle2 className="fu-list-empty__icon" size={28} strokeWidth={2} aria-hidden />
                            <p className="fu-list-empty__title">Todos os follow-ups concluídos!</p>
                            {followUpsKanbanOnlyCount > 0 ? (
                                <p className="fu-list-empty__hint">
                                    {followUpsKanbanOnlyCount}{' '}
                                    {followUpsKanbanOnlyCount === 1 ? 'interessado está' : 'interessados estão'} só no Kanban (
                                    {vertical === 'physio' ? 'avaliação há' : 'aula há'} {FOLLOWUP_AGENDA_MAX_DAYS}+ dias).
                                </p>
                            ) : (
                                <p className="fu-list-empty__hint">
                                    Quando alguém comparecer ou faltar, os retornos aparecem aqui.
                                </p>
                            )}
                        </div>
                    )}
                </div>
                {followUpsKanbanOnlyCount > 0 && (
                    <p className="fu-kanban-more mt-2">
                        <button
                            type="button"
                            className="fu-kanban-link"
                            onClick={() => navigate('/pipeline?followup=kanban')}
                        >
                            + {followUpsKanbanOnlyCount} no Kanban
                        </button>
                        <span className="fu-kanban-more-hint">
                            {' '}
                            (follow-up com {FOLLOWUP_AGENDA_MAX_DAYS}+ dias desde a{' '}
                            {vertical === 'physio' ? 'avaliação' : 'aula'})
                        </span>
                    </p>
                )}
                </div>
            </section>
            </div>

            <ModalShell
                open={Boolean(listModalType)}
                title={modalTitle ? `${modalTitle} (${modalListItems.length})` : ''}
                onClose={closeListModal}
                maxWidth={760}
                dialogClassName="reception-list-modal"
            >
                {modalListItems.length === 0 ? (
                    <div className="reception-list-modal__empty">
                        <EmptyState variant="compact" tone="dashed" title="Nenhum item nessa lista." role="status" />
                    </div>
                ) : (
                    <div className="flex-col agenda-followups-list">
                        {modalListItems.map((lead, i) => {
                            const isTasks = listModalType === 'tasks';
                            const busy = Boolean(savingPresence[`${lead.id}:attended`] || savingPresence[`${lead.id}:missed`]);
                            const taskBusy = isUpdatingTask(String(lead?.id || '').trim());
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
                                                    onClick={() => navigate('/tarefas')}
                                                >
                                                    <ChevronRight size={14} /> Abrir tarefas
                                                </button>
                                            </>
                                        ) : (
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
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </ModalShell>

            <FollowUpMicroToast
                open={followUpMicroToastOpen}
                onClose={() => setFollowUpMicroToastOpen(false)}
            />

            <ConfirmDialog
                open={gateReleaseOpen}
                title="Liberar passagem?"
                description="A catraca será liberada remotamente para entrada manual na recepção."
                confirmLabel="Liberar"
                confirmVariant="primary"
                loading={gateReleasing}
                onConfirm={() => void confirmGateRelease()}
                onClose={() => !gateReleasing && setGateReleaseOpen(false)}
            />

            <style dangerouslySetInnerHTML={{
                __html: `
        .reception-dashboard {
          --reception-section-pad: clamp(16px, 2.5vw, 22px);
          --border-radius-lg: 16px;
        }
        .reception-dashboard-page-header {
          padding-bottom: 20px;
          margin-bottom: 8px;
          border-bottom: 1px solid var(--border);
        }
        .reception-dashboard-page-header .navi-page-header__subtitle {
          font-family: var(--ff-body);
          font-size: 0.9375rem;
          font-weight: 400;
          color: #4A5568;
        }
        .reception-kpi-grid {
          margin-top: 14px !important;
        }
        .reception-command-bar .nl-command-bar-trigger {
          max-width: 380px;
        }
        .reception-dashboard-page-header .navi-page-header__intro {
          flex: 1 1 220px;
          min-width: 0;
        }
        .reception-dashboard-page-header .navi-page-header__actions {
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
        .reception-agenda-inner .agenda-week-section.reception-week-panel.reception-section {
          background: var(--azul-gelo);
          border: 0.5px solid var(--border-mid);
        }
        .reception-week-panel__title.navi-section-heading,
        .reception-week-panel__title {
          color: var(--cosmos);
        }
        .reception-week-panel__head {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }
        .reception-week-panel__title-row {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          min-width: 0;
        }
        .badge.reception-week-count-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 22px;
          height: 22px;
          padding: 0 6px;
          margin: 0;
          line-height: 1;
          font-size: 11px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          background: var(--petroleo);
          color: #fff;
          border: none;
          flex-shrink: 0;
        }
        .reception-agenda-inner .agenda-dash-week-nav {
          background: #fff;
          border: 0.5px solid var(--border-mid);
          color: var(--cosmos);
          font-weight: 600;
        }
        .reception-agenda-inner .agenda-dash-week-nav:hover {
          background: var(--azul-gelo);
          border-color: var(--petroleo);
          color: var(--petroleo);
        }
        .reception-week-embed {
          margin-top: 2px;
          min-width: 0;
          max-width: 100%;
          overflow-x: auto;
          overflow-y: visible;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior-x: contain;
        }
        .reception-week-embed .agenda-week-scroll {
          overflow-x: visible;
        }
        .reception-week-panel__nav {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
        }
        .reception-week-range {
          font-size: 13px;
          font-weight: 700;
          color: var(--cosmos);
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
          margin: 12px 0 0;
          font-family: var(--ff-mono);
          font-size: 0.625rem;
          font-weight: 400;
          color: var(--ameixa);
          opacity: 0.72;
          letter-spacing: 0.03em;
          line-height: 1.45;
          text-align: center;
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-col {
          border-radius: 10px;
          border: 0.5px solid var(--v200);
          background: #fff;
          box-shadow: none;
          min-width: 0;
          min-height: 140px;
          padding: 10px 8px;
          overflow: hidden;
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-col--today {
          border: 1.5px solid var(--petroleo);
          background: var(--accent-light) !important;
          box-shadow: 0 2px 10px rgba(0, 68, 102, 0.12);
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-col--empty {
          opacity: 0.72;
          background: rgba(255, 255, 255, 0.55);
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-col--empty .agenda-week-col-empty {
          font-size: 11px;
          opacity: 0.5;
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-col:hover {
          border-color: var(--petroleo);
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-col--today:hover {
          border-color: var(--petroleo);
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-col-head {
          padding: 0 0 8px;
          margin: 0 0 8px;
          border-bottom: none;
          gap: 6px;
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-col--today .agenda-week-col-head {
          background: transparent !important;
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-dow {
          font-size: 10px;
          font-weight: 500;
          color: var(--ameixa);
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-day-num {
          font-size: 15px;
          font-weight: 700;
          color: var(--cosmos);
          width: 30px;
          height: 30px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-day-num--today {
          font-size: 13px;
          font-weight: 600;
          background: var(--petroleo) !important;
          color: #fff !important;
          border-radius: 50%;
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-col-body {
          padding: 0;
          gap: 5px;
          min-height: 0;
          flex: 1;
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-col-empty {
          color: var(--ameixa);
          opacity: 1;
          font-weight: 500;
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0;
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-card.agenda-week-card--lead {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 104px;
          min-width: 0;
          width: 100%;
          box-sizing: border-box;
          overflow: hidden;
          padding: 8px 10px 8px 8px !important;
          border-radius: 0 6px 6px 0 !important;
          border: none !important;
          border-left: 2px solid var(--petroleo) !important;
          background: var(--accent-light) !important;
          box-shadow: none !important;
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-card:hover {
          transform: none;
          filter: none;
          box-shadow: 0 1px 4px rgba(0, 68, 102, 0.15) !important;
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-time {
          font-size: 11px;
          font-weight: 500;
          color: var(--petroleo);
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          margin-bottom: 4px;
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-status-dot--confirmed { background: var(--lima); }
        .reception-agenda-inner .reception-week-embed .agenda-week-status-dot--pending { background: #d97706; }
        .reception-agenda-inner .reception-week-embed .agenda-week-status-dot--attended { background: #16a34a; }
        .reception-agenda-inner .reception-week-embed .agenda-week-status-dot--missed { background: #e24b4a; }
        .reception-agenda-inner .reception-week-embed .agenda-week-name {
          font-size: 12px;
          font-weight: 500;
          color: var(--cosmos);
          max-width: 100%;
          min-width: 0;
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-mod {
          font-size: 10px;
          font-weight: 500;
          color: var(--ameixa);
          margin-top: 2px;
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-presence {
          margin-top: auto;
          padding-top: 4px;
          flex-shrink: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 3px;
          align-items: center;
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-presence-btn {
          flex: 0 1 calc(50% - 2px);
          min-width: 0;
          background: #fff;
          border-color: var(--v200);
          color: var(--cosmos);
          min-height: 18px !important;
          height: 18px;
          padding: 0 5px !important;
          border-radius: 999px;
          font-size: 0.5625rem !important;
          font-weight: 600;
          line-height: 1;
          letter-spacing: -0.02em;
          gap: 0;
          transform: none;
          box-shadow: none;
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-presence-btn--yes:hover:not(:disabled) {
          border-color: rgba(22, 163, 74, 0.45);
          color: #15803d;
          background: rgba(16, 185, 129, 0.1);
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-presence-btn--no:hover:not(:disabled) {
          border-color: rgba(226, 75, 74, 0.45);
          color: #b91c1c;
          background: rgba(239, 68, 68, 0.08);
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-card--attended {
          border-left-color: #16a34a !important;
          background: rgba(16, 185, 129, 0.14) !important;
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-card--missed {
          border-left-color: #e24b4a !important;
          background: rgba(239, 68, 68, 0.12) !important;
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-col--dense .agenda-week-col-body {
          gap: 5px;
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-col--dense .agenda-week-card {
          min-height: 104px;
          padding: 8px 10px 8px 8px !important;
          border-radius: 0 6px 6px 0 !important;
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-col--dense .agenda-week-name {
          font-size: 12px;
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-col--dense .agenda-week-mod {
          font-size: 10px;
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-week-empty.navi-empty {
          background: rgba(255, 255, 255, 0.65);
          border-color: var(--v200);
        }
        .reception-agenda-inner .reception-week-embed .agenda-week-week-empty.navi-empty .navi-empty__title {
          color: var(--ameixa);
        }
        #follow-ups .reception-section-head,
        #follow-ups .reception-hint {
          flex-shrink: 0;
        }
        #follow-ups .reception-hint {
          margin-bottom: 0.75rem;
        }
        .fu-list-card {
          background: var(--surface);
          border: 1px solid var(--border-mid);
          border-radius: var(--radius);
          padding: 0 16px;
          box-shadow: var(--shadow-sm);
          max-height: min(70vh, 640px);
          overflow-y: auto;
        }
        .fu-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 9px 0;
          border: 1px solid transparent;
          border-bottom: 1px solid #D4DCE8;
          flex-wrap: wrap;
          transition: all 0.25s ease;
        }
        .fu-row:hover {
          border-color: #AFA9EC;
          background: #FAFAFE;
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(108, 71, 216, 0.08);
        }
        .fu-row--flashing {
          background: #E1F5EE !important;
          border-color: #9FE1CB !important;
        }
        .fu-row--leaving {
          opacity: 0;
          transform: translateX(40px) scale(0.97);
          transition: opacity 0.35s ease, transform 0.35s ease;
          pointer-events: none;
        }
        .fu-row--last {
          border-bottom: none;
        }
        .fu-row--today {
          margin: 0 -12px;
          padding: 9px 12px;
          background: rgba(133, 79, 11, 0.06);
          border-radius: var(--radius-sm);
          border-bottom-color: transparent;
        }
        .fu-row--removing {
          animation: fu-row-out 0.32s ease forwards;
          pointer-events: none;
          overflow: hidden;
        }
        @keyframes fu-row-out {
          to {
            opacity: 0;
            transform: translateY(-6px);
            max-height: 0;
            padding-top: 0;
            padding-bottom: 0;
            margin-top: 0;
            margin-bottom: 0;
          }
        }
        .fu-kanban-more {
          font-size: 12px;
          line-height: 1.45;
          color: var(--text-secondary);
        }
        .fu-kanban-link {
          background: none;
          border: none;
          padding: 0;
          font: inherit;
          font-weight: 600;
          color: #000435;
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .fu-kanban-link:hover {
          color: #000435;
          opacity: 0.82;
        }
        .fu-kanban-more-hint {
          font-weight: 400;
        }
        .fu-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .fu-dot--recover { background: #E24B4A; }
        .fu-dot--post { background: #639922; }
        .fu-name {
          flex: 1;
          min-width: 120px;
          font-size: 13px;
          font-weight: 500;
          text-align: left;
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          color: inherit;
          font-family: inherit;
        }
        .fu-name:hover {
          color: var(--v500);
          text-decoration: underline;
        }
        .fu-phone {
          flex: 1;
          min-width: 100px;
          font-size: 12px;
          color: var(--text-secondary);
        }
        .fu-elapsed {
          font-size: 12px;
          min-width: 60px;
          flex-shrink: 0;
        }
        .fu-elapsed--today { color: #854F0B; }
        .fu-elapsed--1 { color: var(--text-secondary); }
        .fu-elapsed--2plus { color: #A32D2D; }
        .fu-type-badge {
          font-size: 10px;
          border-radius: 20px;
          padding: 2px 8px;
          font-weight: 600;
          flex-shrink: 0;
          white-space: nowrap;
        }
        .fu-type-badge--recover {
          background: rgba(226, 75, 74, 0.15);
          color: #A32D2D;
          border: 1px solid rgba(226, 75, 74, 0.28);
        }
        .fu-type-badge--post {
          background: rgba(22, 163, 74, 0.15);
          color: #15803d;
          border: 1px solid rgba(22, 163, 74, 0.28);
        }
        .fu-actions {
          display: flex;
          gap: 6px;
          align-items: center;
          flex-shrink: 0;
        }
        .fu-btn-wa,
        .wa-btn {
          background: #1FAA5E;
          color: #fff;
          border: none;
          padding: 5px 10px;
          font-size: 11px;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.18s ease;
        }
        .wa-btn:hover:not(:disabled) {
          background: #178A4C;
          transform: scale(1.04);
        }
        .wa-btn:active:not(:disabled) {
          transform: scale(0.97);
        }
        .wa-btn--loading,
        .wa-btn--sent {
          background: #0F6E40;
        }
        .wa-btn--sent {
          cursor: default;
          opacity: 1;
        }
        .wa-btn .wa-icon {
          display: inline-block;
          vertical-align: middle;
          margin-right: 4px;
          transition: transform 0.2s ease;
        }
        .wa-btn:hover:not(:disabled) .wa-icon {
          transform: rotate(-8deg) scale(1.15);
        }
        .wa-btn--loading:hover:not(:disabled),
        .wa-btn--sent:hover {
          transform: none;
        }
        .wa-btn--loading:hover:not(:disabled) .wa-icon,
        .wa-btn--sent .wa-icon {
          transform: none;
        }
        .wa-icon--spin {
          animation: fu-wa-spin 0.8s linear infinite;
        }
        @keyframes fu-wa-spin {
          to { transform: rotate(360deg); }
        }
        .fu-btn-done,
        .mk-btn {
          background: transparent;
          color: var(--text-secondary);
          border: 1px solid var(--border-mid);
          padding: 5px 10px;
          font-size: 11px;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.18s ease;
        }
        .mk-btn:hover:not(:disabled) {
          border-color: #AFA9EC;
          color: #4A2FA3;
          background: #EDE9FB;
        }
        .mk-btn:active:not(:disabled) {
          transform: scale(0.97);
        }
        .fu-btn-done:disabled,
        .mk-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .fu-list-empty {
          padding: 16px 0;
          text-align: center;
          color: var(--text-secondary);
        }
        .fu-list-empty--all-done {
          padding: 24px 0;
          color: #9896A8;
        }
        .fu-list-empty__icon {
          color: #9FE1CB;
          margin: 0 auto 8px;
          display: block;
        }
        .fu-list-empty__title {
          margin: 0 0 6px;
          font-size: 13px;
          font-weight: 600;
          color: #9896A8;
        }
        .fu-list-empty__hint {
          margin: 0;
          font-size: 12px;
          line-height: 1.45;
          color: var(--text-secondary);
        }
        .fu-micro-toast {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%) translateY(60px);
          background: #1A1530;
          color: #fff;
          font-size: 12px;
          padding: 8px 16px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          gap: 7px;
          z-index: 999;
          transition: transform 0.3s ease;
          pointer-events: none;
          box-shadow: 0 4px 20px rgba(26, 21, 48, 0.35);
        }
        .fu-micro-toast--visible {
          transform: translateX(-50%) translateY(0);
        }
        @media (max-width: 720px) {
          .fu-row .fu-actions {
            width: 100%;
            justify-content: flex-end;
          }
        }
        .reception-section-tools {
          padding: 4px 6px;
          background: var(--v50);
          border-radius: 10px;
          border: 1px solid var(--border-light);
        }
        .agenda-kpi-card--clickable:hover .agenda-kpi-trend--cta {
          border-color: #000435;
          color: #000435;
        }
        .agenda-kpi-card--clickable:hover .agenda-kpi-trend--cta svg {
          color: #000435;
        }
        .agenda-kpi-card--attention-danger,
        .agenda-kpi-card--followup {
          background: rgba(228, 181, 93, 0.08);
          border: 1px solid rgba(228, 181, 93, 0.25);
          border-left: 3px solid #E4B55D;
          border-radius: 12px;
        }
        .agenda-kpi-card--attention-primary.agenda-kpi-card--attention {
          background: rgba(228, 181, 93, 0.08);
          border: 1px solid rgba(228, 181, 93, 0.25);
          border-left: 3px solid #E4B55D;
          border-radius: 12px;
        }
        .agenda-kpi-card--ok,
        .agenda-kpi-card--muted {
          background: #FFFFFF;
          border: 1px solid #D4DCE8;
          border-radius: 12px;
        }
        .agenda-kpi-card--ok .agenda-kpi-label,
        .agenda-kpi-card--muted .agenda-kpi-label {
          color: #755468;
        }
        .agenda-kpi-ok {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--faint);
          font-size: 15px;
          font-weight: 600;
          margin-top: 2px;
        }
        .agenda-kpi-ok svg {
          color: var(--faint);
          flex-shrink: 0;
        }
        .agenda-kpi-value--tasks {
          color: #E4B55D !important;
          font-family: var(--ff-serif) !important;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.03em;
        }
        @media (max-width: 767px) {
          .reception-header-ai-mobile {
            margin-top: 12px;
            width: 100%;
            max-width: 100%;
          }
          .reception-header-ai-mobile button {
            width: 100%;
          }
        }
        .agenda-kpi-value--attention {
          font-size: 1.55rem !important;
          line-height: 1.1;
        }
        .agenda-kpi-context {
          margin: 0;
          font-size: 0.65rem;
          font-weight: 600;
          line-height: 1.25;
          color: var(--text-secondary);
          opacity: 0.85;
        }
        .agenda-kpi-context--info {
          color: var(--v400);
        }
        .agenda-kpi-card--followup::before,
        .agenda-kpi-card--attention-danger::before,
        .agenda-kpi-card--attention-primary::before {
          display: none;
        }
        .agenda-kpi-value--followup,
        .agenda-kpi-value--attention {
          color: #E4B55D !important;
        }
        .agenda-kpi-trend--followup {
          color: #000435 !important;
        }
        .agenda-kpi-trend--followup svg {
          color: #000435 !important;
          opacity: 1 !important;
        }
        .agenda-kpi-card--clickable:hover .agenda-kpi-trend--followup {
          border-color: #000435;
          color: #000435 !important;
        }
        .agenda-kpi-card--clickable:hover .agenda-kpi-trend--followup svg {
          color: #000435 !important;
        }
        .reception-list-modal.navi-modal-shell {
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
        .reception-list-modal .navi-modal-shell__header {
          flex-shrink: 0;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border);
          background: linear-gradient(180deg, var(--v50) 0%, var(--surface) 100%);
        }
        .reception-list-modal .navi-modal-shell__title {
          font-size: 1.05rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          min-width: 0;
        }
        .reception-list-modal .navi-modal-shell__body {
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
          max-width: 100%;
          flex: 0 0 auto;
          min-width: 0;
        }
        .agenda-week-section {
          min-width: 0;
          overflow: visible;
        }
        .agenda-page-stack {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 22px;
          align-items: start;
          width: 100%;
          margin-top: 18px;
        }
        @media (min-width: 1100px) {
          .agenda-page-stack {
            grid-template-columns: 1fr 340px;
            gap: 2rem;
          }
          .agenda-page-stack > .agenda-week-section {
            grid-column: 1;
            grid-row: 1;
            min-width: 0;
          }
          .agenda-page-stack > .agenda-followups-section {
            grid-column: 2;
            grid-row: 1;
            width: 340px;
            max-width: 340px;
            position: sticky;
            top: 1rem;
            align-self: start;
            max-height: calc(100vh - 2rem);
            display: flex;
            flex-direction: column;
            min-height: 0;
            box-sizing: border-box;
          }
          .agenda-page-stack > .agenda-followups-section .fu-list-card {
            flex: 1 1 auto;
            min-height: 0;
            max-height: min(52vh, 480px);
          }
        }
        .agenda-followups-section__head {
          margin-bottom: 0;
        }
        .agenda-followups-section__toggle {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          width: 100%;
          padding: 0;
          margin: 0;
          border: none;
          background: none;
          cursor: default;
          font: inherit;
          text-align: left;
          color: inherit;
        }
        .agenda-followups-section__toggle--static {
          cursor: default;
        }
        .agenda-followups-section__toggle:not(.agenda-followups-section__toggle--static) {
          cursor: pointer;
        }
        .agenda-followups-section__toggle:not(.agenda-followups-section__toggle--static):hover .reception-section-heading {
          color: var(--petroleo);
        }
        .agenda-followups-section__toggle-label {
          flex: 1;
          min-width: 0;
        }
        .agenda-followups-section__chevron {
          flex-shrink: 0;
          color: var(--ameixa);
          transition: transform 0.2s ease;
        }
        .agenda-followups-section__chevron--open {
          transform: rotate(180deg);
        }
        .agenda-followups-section__body {
          display: flex;
          flex-direction: column;
          min-height: 0;
          flex: 1 1 auto;
        }
        @media (max-width: 1099px) {
          .agenda-page-stack > .agenda-week-section,
          .agenda-page-stack > .agenda-followups-section {
            grid-column: 1;
            grid-row: auto;
            position: static;
            max-height: none;
            width: 100%;
            max-width: 100%;
          }
          .agenda-page-stack > .agenda-week-section {
            order: 0;
          }
          .agenda-page-stack > .agenda-followups-section {
            order: 1;
          }
          .agenda-page-stack > .agenda-followups-section .fu-list-card {
            max-height: min(60vh, 520px);
          }
          .agenda-followups-section--collapsed .agenda-followups-section__body {
            display: none;
          }
          .agenda-followups-section--collapsed .agenda-followups-section__head {
            margin-bottom: 0;
          }
          .agenda-followups-section:not(.agenda-followups-section--collapsed) .agenda-followups-section__head {
            margin-bottom: 0.5rem;
          }
        }
        .agenda-section-divider {
          display: none;
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
          display: flex;
          flex-direction: row;
          gap: 8px;
          align-items: stretch;
          flex-wrap: wrap;
        }
        .agenda-kpi-card {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 0.75rem;
          flex: 1 1 140px;
          min-height: 56px;
          padding: 1.5rem;
          border-radius: 12px;
          background: #FFFFFF;
          border: 1px solid #D4DCE8;
          box-shadow: var(--shadow-sm);
          transition: transform 0.2s ease, box-shadow 0.22s ease, border-color 0.2s ease;
          overflow: hidden;
          text-align: left;
        }
        .agenda-kpi-card-stack {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.75rem;
          min-width: 0;
          flex: 0 0 auto;
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
          display: none;
        }
        .agenda-kpi-card:hover {
          border-color: rgba(0, 68, 102, 0.22);
          box-shadow: 0 4px 12px rgba(0, 4, 53, 0.06), 0 8px 24px rgba(0, 68, 102, 0.10);
        }
        @media (prefers-reduced-motion: reduce) {
          .agenda-kpi-card { transition: none; }
        }
        .agenda-kpi-label {
          font-family: var(--ff-mono);
          font-size: 0.6875rem;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #755468;
          margin-bottom: 0;
          line-height: 1.3;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          width: 100%;
        }
        .agenda-kpi-value {
          font-family: var(--ff-serif);
          font-size: 1.55rem;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          line-height: 1.1;
          color: #000435;
          letter-spacing: -0.03em;
        }
        .agenda-kpi-trend.agenda-kpi-cta {
          margin-top: 0;
          margin-left: 0;
          padding: 8px 12px;
          flex-shrink: 0;
          align-self: stretch;
          justify-content: center;
          width: 100%;
          box-sizing: border-box;
          background: transparent;
          border: 1.5px solid #D4DCE8;
          color: #000435;
          border-radius: 10px;
          font-size: 0.8125rem;
        }
        .agenda-kpi-trend {
          display: flex;
          flex-wrap: nowrap;
          align-items: center;
          justify-content: center;
          gap: 4px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }
        .agenda-kpi-trend--cta {
          color: #000435;
          opacity: 1;
        }
        .agenda-kpi-trend--cta svg {
          color: #000435;
          opacity: 1;
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
          background: rgba(0, 4, 53, 0.5);
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
          min-width: 0;
          max-width: 100%;
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
          background: rgba(0, 68, 102, 0.22);
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
          border: 1px solid rgba(0, 4, 53, 0.12);
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
          border-color: rgba(0, 68, 102, 0.22);
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
          border-top: 1px solid rgba(0, 68, 102, 0.09);
        }
        .agenda-card--attended {
          opacity: 0.5;
          background: rgba(0, 4, 53, 0.02);
        }
        .agenda-card--attended .agenda-experimental-name {
          text-decoration: line-through;
          text-decoration-color: rgba(0, 4, 53, 0.22);
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
          background: linear-gradient(90deg, var(--petroleo), rgba(0, 68, 102, 0.75));
          opacity: 0.7;
          pointer-events: none;
          border-radius: 16px 16px 0 0;
        }
        .reception-agenda-inner .agenda-card.card:hover {
          transform: translateY(-2px);
          border-color: rgba(0, 68, 102, 0.22);
          box-shadow:
            0 4px 14px rgba(0, 4, 53, 0.07),
            0 16px 40px rgba(0, 68, 102, 0.12);
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
          border-top: 1px solid rgba(0, 68, 102, 0.09);
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
          box-shadow: 0 4px 14px rgba(0, 68, 102, 0.28);
          transition: transform .12s ease, filter .12s ease, box-shadow .2s ease;
        }
        .edit-time-btn svg { display: block; color: #fff; stroke: currentColor; fill: none; }
        .edit-time-btn:hover { filter: brightness(0.96); }
        .edit-time-btn:active { transform: translateY(1px); }
        .edit-time-btn:focus-visible { outline: 2px solid var(--focus-ring-color); box-shadow: 0 0 0 3px var(--focus-ring); outline-offset: 2px; box-shadow: 0 0 0 4px rgba(0, 68, 102, 0.2); }
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
