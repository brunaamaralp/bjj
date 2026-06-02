import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import { useTaskStore } from '../store/useTaskStore';
import { useStudentStore } from '../store/useStudentStore';
import { useUiStore } from '../store/useUiStore';
import { useNavigate } from 'react-router-dom';
import { Query } from 'appwrite';
import { databases, DB_ID, LEAD_EVENTS_COL } from '../lib/appwrite';
import { DEFAULT_WHATSAPP_TEMPLATES } from '../../lib/whatsappTemplateDefaults.js';
import { useWhatsappTemplates } from '../lib/useWhatsappTemplates.js';
import { sendWhatsappTemplateOutbound } from '../lib/outboundWhatsappTemplate.js';
import { Plus, Calendar, ChevronRight, ChevronDown, MessageCircle, RefreshCcw, List, LayoutGrid, CheckSquare, Check, CheckCircle2, DoorOpen, Loader2, Cake } from 'lucide-react';
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
import { useNlPageContext } from '../hooks/useNlPageContext.js';
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
import ReportKpiCard from '../components/reports/shared/ReportKpiCard.jsx';
import ReportSectionHeading from '../components/reports/shared/ReportSectionHeading.jsx';
import SkeletonCard from '../components/shared/SkeletonCard.jsx';
import StageBadge from '../components/shared/StageBadge.jsx';
import { getBirthMonthDay, getTodayMonthDay } from '../lib/birthDate.js';
import { normalizeLeadProfileType } from '../../lib/leadTypeNormalize.js';
import { STUDENT_STATUS } from '../lib/studentStatus.js';
import '../styles/dashboard.css';
import TaskCard from '../components/shared/TaskCard.jsx';
import { LEAD_PROFILE_FROM_DASHBOARD } from '../lib/pipelineSessionState.js';
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
    const modules = useLeadStore((s) => s.modules);
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
    const students = useStudentStore((s) => s.students);
    const fetchStudents = useStudentStore((s) => s.fetchStudents);
    const studentsLoading = useStudentStore((s) => s.loading);
    const studentsLastFetchedAt = useStudentStore((s) => s.lastFetchedAt);
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
    const [followUpsPanelOpen, setFollowUpsPanelOpen] = useState(true);
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

    const nlPageCtx = useMemo(() => ({ pipelineStages: pipelineStagesNl }), [pipelineStagesNl]);
    useNlPageContext(nlPageCtx);

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
        const STALE_MS = 5 * 60 * 1000;
        if (students.length > 0 && studentsLastFetchedAt && Date.now() - studentsLastFetchedAt < STALE_MS) {
            return;
        }
        void fetchStudents({ reset: true });
    }, [academyId, students.length, studentsLastFetchedAt, fetchStudents]);

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
                fetchStudents({ reset: true }),
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

    const todayBirthdays = useMemo(() => {
        const mesEDia = getTodayMonthDay();
        return (students || [])
            .filter((s) => {
                if (String(s?.studentStatus || '').trim() === STUDENT_STATUS.INACTIVE) return false;
                return getBirthMonthDay(s.birthDate) === mesEDia;
            })
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
    }, [students]);

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
        if (cardKey === 'tasks') {
            navigate('/tarefas?status=pendentes&period=today');
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
                        {controlIdCfg.enabled && (
                            <button
                                type="button"
                                className="btn-secondary reception-gate-release-btn"
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

            <div
                className="reports-kpi-grid reports-kpi-grid--overview reception-kpi-grid animate-in"
                style={{ animationDelay: '0.05s' }}
                aria-busy={loading}
            >
                {loading ? (
                    <SkeletonCard variant="kpi" count={4} className="reception-kpi-skeletons" />
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
                        },
                        {
                            key: 'tasks',
                            title: 'Próximas tarefas',
                            count: pendingTasks.length,
                            cta: 'Ver tarefas',
                            Icon: CheckSquare,
                            kind: 'attention',
                        },
                    ].map((card) => {
                        const isAttention = card.kind === 'attention';
                        const isOk = card.count === 0;
                        const highlight = isOk ? 'success' : isAttention ? 'attention' : 'default';
                        const trendLabel = !isOk && isAttention
                            ? card.count === 1
                                ? '1 pendente'
                                : `${card.count} pendentes`
                            : !isOk && !isAttention
                              ? card.key === 'today'
                                  ? 'agendadas para hoje'
                                  : 'seg–sáb desta semana'
                              : null;
                        return (
                            <ReportKpiCard
                                key={card.key}
                                label={
                                    card.key === 'today' ? (
                                        <span className="reception-kpi-label-wrap">
                                            {card.title}
                                            <Hint
                                                text={`${contactLabel}s com ${terms.trialShort.toLowerCase()} agendada para hoje`}
                                                position="top"
                                                className="reception-kpi-hint"
                                            />
                                        </span>
                                    ) : (
                                        card.title
                                    )
                                }
                                value={isOk ? 'Tudo em dia ✓' : card.count}
                                valueVariant={isOk ? 'message' : 'metric'}
                                highlight={highlight}
                                trendLabel={trendLabel}
                                icon={<card.Icon size={20} strokeWidth={2.25} />}
                                onClick={() => handleKpiClick(card.key)}
                                ctaLabel={isOk ? 'Ver detalhes' : card.cta}
                                ctaIcon={<card.Icon size={16} strokeWidth={2} />}
                            />
                        );
                    })
                )}
            </div>

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
                        <ReportSectionHeading
                            className="reception-report-heading reception-week-panel__title"
                            title={
                                <>
                                    <Calendar size={18} color="var(--petroleo)" strokeWidth={2} aria-hidden /> Agenda da semana
                                </>
                            }
                            action={
                                <span
                                    className="badge reception-week-count-badge"
                                    title={`${trialSeriesPlural} na semana exibida`}
                                >
                                    {scheduledInVisibleWeekCount}
                                </span>
                            }
                        />
                    </div>
                    <div className="week-nav-pill">
                        <button
                            type="button"
                            className="week-nav-pill__btn"
                            onClick={() => setDashboardWeekOffset((o) => o - 1)}
                            aria-label="Semana anterior"
                        >
                            ‹
                        </button>
                        <span className="week-nav-pill__range" aria-live="polite">
                            {formatWeekRangeLabel(dashboardWeekOffset, { endOnSaturday: true })}
                        </span>
                        <button
                            type="button"
                            className="week-nav-pill__btn"
                            onClick={() => setDashboardWeekOffset((o) => o + 1)}
                            aria-label="Próxima semana"
                        >
                            ›
                        </button>
                        <button
                            type="button"
                            className="week-nav-pill__refresh"
                            onClick={handleRefresh}
                            disabled={loading || isRefreshing}
                            aria-label="Atualizar agenda"
                        >
                            <RefreshCcw size={16} className={isRefreshing ? 'spin-refresh' : ''} strokeWidth={2} />
                        </button>
                    </div>
                </div>
                <div className="agenda-week-fullwidth reception-week-embed">
                    <AgendaCalendarWeek
                        leads={allScheduled}
                        onCompareceu={markLeadAttended}
                        onNaoCompareceu={markLeadMissed}
                        onOpenLead={(lead) =>
                            navigate(`/lead/${lead.id}`, { state: { from: LEAD_PROFILE_FROM_DASHBOARD } })
                        }
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

            <div className="agenda-bottom-row">
            <section
                id="follow-ups"
                ref={followUpsSectionRef}
                className={`animate-in agenda-followups-section reception-section${
                    isDashboardMobile && !followUpsPanelOpen ? ' agenda-followups-section--collapsed' : ''
                }`}
                style={{ animationDelay: '0.2s' }}
            >
                <div className="reception-section-head agenda-followups-section__head">
                    {isDashboardMobile ? (
                        <button
                            type="button"
                            className="agenda-followups-section__toggle"
                            onClick={() => setFollowUpsPanelOpen((open) => !open)}
                            aria-expanded={followUpsPanelOpen}
                            aria-controls="follow-ups-panel-body"
                        >
                            <span className="agenda-followups-section__toggle-label flex items-center gap-2 flex-wrap min-w-0">
                                <ReportSectionHeading
                                    className="reception-report-heading"
                                    title={
                                        <>
                                            <List size={18} color="var(--v500)" strokeWidth={2} aria-hidden /> Follow-ups pendentes
                                        </>
                                    }
                                />
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
                                <ReportSectionHeading
                                    className="reception-report-heading"
                                    title={
                                        <>
                                            <List size={18} color="var(--v500)" strokeWidth={2} aria-hidden /> Follow-ups pendentes
                                        </>
                                    }
                                />
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
                        const fuTimeClass =
                            lead.daysAgo <= 3
                                ? 'fu-time--recent'
                                : lead.daysAgo <= 5
                                  ? 'fu-time--warning'
                                  : 'fu-time--urgent';
                        const tagLabel = isPost
                            ? (vertical === 'physio' ? 'Pós-avaliação' : 'Pós-aula')
                            : 'Recuperar';
                        return (
                            <div
                                key={lead.id}
                                className={`fu-row animate-in${
                                    flashingFollowupIds[leadId] ? ' fu-row--flashing' : ''
                                }${leavingFollowupIds[leadId] ? ' fu-row--leaving' : ''}${
                                    removingFollowupIds[lead.id] ? ' fu-row--removing' : ''
                                }${i === followUps.length - 1 ? ' fu-row--last' : ''}`}
                                style={{ animationDelay: `${0.04 * i}s` }}
                            >
                                <div
                                    className={`fu-dot ${isPost ? 'fu-dot--post' : 'fu-dot--recover'}`}
                                    aria-hidden
                                />
                                <div className="fu-info">
                                    <button
                                        type="button"
                                        className="fu-name"
                                        onClick={() =>
                                            navigate(`/lead/${lead.id}`, { state: { from: LEAD_PROFILE_FROM_DASHBOARD } })
                                        }
                                    >
                                        {lead.name}
                                    </button>
                                    <div className="fu-sub">
                                        <span className="fu-phone">{lead.phone || '—'}</span>
                                        <span
                                            className={`fu-time ${fuTimeClass}`}
                                            title={
                                                lead.daysAgo === 0
                                                    ? (vertical === 'physio' ? 'Dia da avaliação' : 'Dia da aula experimental')
                                                    : `Há ${lead.daysAgo} dias desde a data da ${vertical === 'physio' ? 'avaliação' : 'aula'}`
                                            }
                                        >
                                            {elapsedLabel}
                                        </span>
                                        <span
                                            className={`fu-tag ${isPost ? 'fu-tag--post' : 'fu-tag--recover'}`}
                                        >
                                            {tagLabel}
                                        </span>
                                        {lead.pipelineStage ? (
                                            <StageBadge stage={String(lead.pipelineStage)} size="sm" />
                                        ) : null}
                                    </div>
                                </div>
                                <div className="fu-btns">
                                    <button
                                        type="button"
                                        className={`btn-wa wa-btn${waState === 'loading' ? ' wa-btn--loading' : ''}${
                                            waState === 'sent' ? ' wa-btn--sent' : ''
                                        }`}
                                        disabled={waState === 'sent'}
                                        aria-busy={waState === 'loading'}
                                        onClick={(e) => handleFollowUpWhatsApp(lead, e)}
                                    >
                                        {waState === 'loading' ? (
                                            <>
                                                <Loader2 className="wa-icon wa-icon--spin" size={14} color="#fff" aria-hidden />
                                                …
                                            </>
                                        ) : waState === 'sent' ? (
                                            <>
                                                <Check className="wa-icon" size={14} color="#fff" strokeWidth={2.5} aria-hidden />
                                                OK
                                            </>
                                        ) : (
                                            <>
                                                {academyWaLoadFailed && (
                                                    <span
                                                        className="dashboard-wa-warning-badge"
                                                        title={`Não foi possível carregar a configuração da ${terms.workspaceNoun}. O WhatsApp pode não funcionar.`}
                                                        aria-hidden
                                                    >
                                                        ⚠️
                                                    </span>
                                                )}
                                                <MessageCircle className="wa-icon" size={14} color="#fff" aria-hidden />
                                                WA
                                            </>
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        className="mk-btn"
                                        disabled={Boolean(
                                            savingFollowupDone[leadId] ||
                                            flashingFollowupIds[leadId] ||
                                            leavingFollowupIds[leadId]
                                        )}
                                        onClick={(e) => void markFollowupDone(lead, e)}
                                    >
                                        {savingFollowupDone[leadId] ? 'Salvando…' : '✓ Feito'}
                                    </button>
                                </div>
                            </div>
                        );
                    }) : (
                        <div className="fu-list-empty fu-list-empty--all-done" role="status">
                            <CheckCircle2 className="fu-list-empty__icon" size={24} strokeWidth={2} aria-hidden />
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

            <section
                id="birthdays"
                className="animate-in agenda-birthdays-section reception-section"
                style={{ animationDelay: '0.22s' }}
            >
                <div className="reception-section-head agenda-birthdays-section__head">
                    <div className="agenda-birthdays-section__title-row flex items-center gap-2 flex-wrap min-w-0">
                        <ReportSectionHeading
                            className="reception-report-heading"
                            title={
                                <>
                                    <Cake size={18} color="#C47A00" strokeWidth={2} aria-hidden /> Aniversariantes hoje
                                </>
                            }
                            action={<span className="badge agenda-birthdays-badge">{todayBirthdays.length}</span>}
                        />
                    </div>
                </div>
                <div className="agenda-birthdays-section__body">
                    <p className="reception-hint agenda-birthdays-hint">
                        {terms.students} com aniversário nesta data. Toque no nome para abrir o perfil.
                    </p>
                    <div className="bd-list-card">
                        {studentsLoading && students.length === 0 ? (
                            <div className="bd-list-loading" aria-busy="true">
                                <SkeletonCard variant="list-row" count={2} />
                            </div>
                        ) : todayBirthdays.length > 0 ? (
                            todayBirthdays.map((student, i) => (
                                <div
                                    key={student.id}
                                    className={`bd-row animate-in${i === todayBirthdays.length - 1 ? ' bd-row--last' : ''}`}
                                    style={{ animationDelay: `${0.04 * i}s` }}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => navigate(`/student/${student.id}`)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            navigate(`/student/${student.id}`);
                                        }
                                    }}
                                >
                                    <span className="bd-emoji" aria-hidden>
                                        <Cake size={14} />
                                    </span>
                                    <div className="bd-info">
                                        <div className="bd-name">{student.name}</div>
                                        <div className="bd-sub">
                                            {normalizeLeadProfileType(student.type) || student.type || '—'}
                                            {student.turma ? (
                                                <>
                                                    <span className="bd-sep">·</span>
                                                    <span className="bd-turma">{student.turma}</span>
                                                </>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="bd-list-empty" role="status">
                                <Cake className="bd-list-empty__icon" size={24} strokeWidth={2} aria-hidden />
                                <p className="bd-list-empty__title">Nenhum aniversariante hoje</p>
                                <p className="bd-list-empty__hint">
                                    Quando algum {terms.student.toLowerCase()} fizer aniversário, aparece aqui.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </section>
            </div>
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
                ) : listModalType === 'tasks' ? (
                    <div className="flex-col gap-2">
                        {modalListItems.map((task) => (
                            <TaskCard
                                key={task.id}
                                task={task}
                                variant="compact"
                                showLead={true}
                                showAssignee={false}
                                isUpdating={isUpdatingTask(String(task.id))}
                                onComplete={() => void markTaskAsDone(task)}
                                onEdit={null}
                                onDelete={null}
                                onOpen={(t) => {
                                    const leadId = String(t?.lead_id || '').trim();
                                    if (leadId) {
                                        navigate(`/lead/${leadId}`, { state: { from: LEAD_PROFILE_FROM_DASHBOARD } });
                                    }
                                }}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="flex-col agenda-followups-list">
                        {modalListItems.map((lead, i) => {
                            const busy = Boolean(savingPresence[`${lead.id}:attended`] || savingPresence[`${lead.id}:missed`]);
                            return (
                                <div key={`${lead.id || lead.$id || i}-${i}`} className="card follow-card">
                                    <div
                                        className="flex justify-between items-center"
                                        onClick={() => {
                                            navigate(`/lead/${lead.id}`, { state: { from: LEAD_PROFILE_FROM_DASHBOARD } });
                                        }}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <strong className="agenda-followup-name">{lead.name}</strong>
                                        <span className="status-pill">{lead.scheduledDate || 'Sem data'}</span>
                                    </div>
                                    <div className="flex gap-2 agenda-followup-actions border-t">
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
</div>
        </div>
    );
};

export default Dashboard;
