import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import { useTaskStore } from '../store/useTaskStore';
import { useStudentStore } from '../store/useStudentStore';
import { useUiStore } from '../store/useUiStore';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DEFAULT_WHATSAPP_TEMPLATES } from '../../lib/whatsappTemplateDefaults.js';
import { useWhatsappTemplates } from '../lib/useWhatsappTemplates.js';
import { sendWhatsappTemplateOutbound } from '../lib/outboundWhatsappTemplate.js';
import {
    Plus,
    Calendar,
    ChevronDown,
    MessageCircle,
    RefreshCcw,
    List,
    Check,
    CheckCircle2,
    DoorOpen,
    Loader2,
    Users,
    CheckSquare,
} from 'lucide-react';
import { addRipple } from '../lib/addRipple.js';
import FollowUpMicroToast from '../components/dashboard/FollowUpMicroToast.jsx';
import DashboardBirthdayBanner from '../components/dashboard/DashboardBirthdayBanner.jsx';
import DashboardBirthdayModal from '../components/dashboard/DashboardBirthdayModal.jsx';
import {
    buildHeroDateLine,
    buildDaySummaryLine,
    getDayPriority,
    getTimeOfDayPeriod,
    countWeeklyEnrollments,
} from '../lib/dashboardDayBriefing.js';
import {
    attendedButtonLabel,
    missedButtonLabel,
    followupsAllDoneTitle,
    followupKpiLabel,
    toastAttendedSuccess,
    toastMissedSuccess,
    followupMicroToastMessage,
    followupStreakMessage,
} from '../lib/dashboardReceptionCopy.js';
import { touchFollowupStreak } from '../lib/dashboardFollowupStreak.js';
import { useAcademyControlId } from '../hooks/useAcademyControlId.js';
import { useControlIdMonitor } from '../hooks/useControlIdMonitor.js';
import { releaseControlIdGate } from '../lib/controlidApi.js';
import { friendlyError } from '../lib/errorMessages.js';
import { Link } from 'react-router-dom';
import NaviLogo from '../components/NaviLogo.jsx';
import { contactLabelSingular } from '../lib/terminology.js';
import { PIPELINE_WAITING_DECISION_STAGE, PIPELINE_STAGES } from '../constants/pipeline.js';
import { LEAD_PROFILE_FROM_DASHBOARD } from '../lib/pipelineSessionState.js';
import { addLeadEvent } from '../lib/leadEvents.js';
import { useNlPageContext } from '../hooks/useNlPageContext.js';
import { LEADS_REFRESH } from '../lib/leadTimelineEvents.js';
import { useTerms } from '../lib/terminology.js';
import EmptyState from '../components/shared/EmptyState.jsx';
import ErrorBanner from '../components/shared/ErrorBanner.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import ModalShell from '../components/shared/ModalShell.jsx';
import ConfirmDialog from '../components/shared/ConfirmDialog.jsx';
import ReportSectionHeading from '../components/reports/shared/ReportSectionHeading.jsx';
import SkeletonCard from '../components/shared/SkeletonCard.jsx';
import DashboardHeroKpi from '../components/dashboard/DashboardHeroKpi.jsx';
import StageBadge from '../components/shared/StageBadge.jsx';
import { getBirthMonthDay, getTodayMonthDay } from '../lib/birthDate.js';
import { STUDENT_STATUS } from '../lib/studentStatus.js';
import '../styles/dashboard.css';
import '../styles/followup-shared.css';
import TaskCard from '../components/shared/TaskCard.jsx';
import { patchFollowupContactCache } from '../lib/followupEventsCache.js';
import { FOLLOWUP_AGENDA_MAX_DAYS } from '../lib/followupState.js';
import { readFollowupPlaybook } from '../lib/followupPlaybookDefaults.js';
import FollowupTemperatureBadge from '../components/followup/FollowupTemperatureBadge.jsx';
import FollowupOutcomeDialog from '../components/followup/FollowupOutcomeDialog.jsx';
import FollowupCopilotButtons from '../components/followup/FollowupCopilotButtons.jsx';
import FollowupHealthPanel from '../components/dashboard/FollowupHealthPanel.jsx';
import DashboardAgendaWeekPanel from '../components/dashboard/DashboardAgendaWeekPanel.jsx';
import { useFollowupOutcome } from '../hooks/useFollowupOutcome.js';
import { useFollowupEventsByLead } from '../hooks/useFollowupEventsByLead.js';
import { useDashboardLeadAgenda } from '../hooks/useDashboardLeadAgenda.js';
import { useDashboardFollowupLeads } from '../hooks/useDashboardFollowupLeads.js';
import { useDashboardMonthEnrollmentMetrics } from '../hooks/useDashboardMonthEnrollmentMetrics.js';
const DEFAULT_STAGE_SLA_DAYS = 3;
const HERO_KPI_ICON_PROPS = { size: 18, strokeWidth: 2.25 };

function heroKpiTone(stat) {
    if (stat.tone === 'primary') return 'primary';
    if (stat.tone === 'success') return 'success';
    if (stat.tone === 'attention') return 'attention';
    if (stat.tone === 'muted') return 'muted';
    return 'default';
}

function buildTodayKpiFootnote(count) {
    return count > 0
        ? { footnote: 'Ver agenda da semana', footnoteTone: 'neutral' }
        : { footnote: 'Nenhuma agendada', footnoteTone: 'neutral' };
}

function buildEnrollmentKpiFootnote(metrics) {
    if (metrics.sub) {
        return {
            footnote: metrics.sub,
            footnoteTone: metrics.subTone === 'positive' ? 'positive' : 'neutral',
        };
    }
    return metrics.enrolledInMonth > 0
        ? { footnote: 'Neste mês civil', footnoteTone: 'neutral' }
        : { footnote: 'Nenhuma neste mês', footnoteTone: 'neutral' };
}

function buildFollowupKpiFootnote(count, urgentCount) {
    if (count === 0) return { footnote: 'Tudo em dia', footnoteTone: 'neutral' };
    if (urgentCount > 0) return { footnote: 'Prioridade na lista', footnoteTone: 'neutral' };
    return { footnote: 'Retornos na lista', footnoteTone: 'neutral' };
}

function buildTasksKpiFootnote(count) {
    return count > 0
        ? { footnote: 'Pendentes hoje', footnoteTone: 'neutral' }
        : { footnote: 'Nenhuma pendente', footnoteTone: 'neutral' };
}

const Dashboard = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const {
        loading,
        fetchLeads,
        academyId,
        academyList,
        leadsError,
        leadsLastFetchedAt,
        vertical,
        labels,
        leadsCount,
    } = useLeadStore(
        useShallow((s) => ({
            loading: s.loading,
            fetchLeads: s.fetchLeads,
            academyId: s.academyId,
            academyList: s.academyList,
            leadsError: s.leadsError,
            leadsLastFetchedAt: s.leadsLastFetchedAt,
            vertical: s.vertical,
            labels: s.labels,
            leadsCount: s.leads.length,
        }))
    );
    const terms = useTerms();
    const contactLabel = useMemo(() => contactLabelSingular(labels), [labels]);
    const trialSeriesPlural = vertical === 'physio' ? 'Avaliações' : 'Aulas experimentais';
    const receptionSubtitle = 'Recepção e retornos do dia';
    const tasks = useTaskStore((s) => s.tasks);
    const fetchTasks = useTaskStore((s) => s.fetchTasks);
    const updateTask = useTaskStore((s) => s.updateTask);
    const patchTaskLocal = useTaskStore((s) => s.patchTaskLocal);
    const isUpdatingTask = useTaskStore((s) => s.isUpdating);
    const students = useStudentStore((s) => s.students);
    const fetchStudents = useStudentStore((s) => s.fetchStudents);
    const studentsLastFetchedAt = useStudentStore((s) => s.lastFetchedAt);
    const addToast = useUiStore((s) => s.addToast);
    const [controlIdFetchEnabled, setControlIdFetchEnabled] = useState(false);
    const controlIdCfg = useAcademyControlId(academyId, { fetch: controlIdFetchEnabled });
    useControlIdMonitor(academyId, controlIdFetchEnabled && controlIdCfg.enabled);
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
    const {
        followupDoneByLead: followupDoneAtByLead,
        followupContactByLead: followupContactAtByLead,
        followupSnoozeUntilByLead,
        inboundAfterByLead,
        inboundAfterByPhone,
        refreshFromCache: refreshFollowupFromCache,
    } = useFollowupEventsByLead(academyId, { defer: true });
    const [savingFollowupDone, setSavingFollowupDone] = useState({});
    const [removingFollowupIds] = useState({});
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
    const retornosRowRef = useRef(null);
    const weekSectionRef = useRef(null);
    const [followupStreak, setFollowupStreak] = useState(0);
    const [sendingBirthdayWa, setSendingBirthdayWa] = useState('');
    const [birthdayModalOpen, setBirthdayModalOpen] = useState(false);
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
        const { leads, leadsLastFetchedAt, loading: leadsLoading } = useLeadStore.getState();
        if (leadsLoading) {
            return () => {
                const { loading } = useLeadStore.getState();
                if (loading) {
                    useLeadStore.setState({ loading: false });
                }
            };
        }
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
    }, [academyId, leadsLastFetchedAt, fetchLeads]);

    useEffect(() => {
        const schedule =
            typeof requestIdleCallback === 'function'
                ? (cb) => requestIdleCallback(cb, { timeout: 3000 })
                : (cb) => window.setTimeout(cb, 1500);
        const cancel =
            typeof cancelIdleCallback === 'function'
                ? cancelIdleCallback
                : (id) => window.clearTimeout(id);
        const id = schedule(() => setControlIdFetchEnabled(true));
        return () => cancel(id);
    }, [academyId]);

    useEffect(() => {
        if (!academyId) return;
        void fetchTasks(academyId, { silent: true, filters: { status: 'pending' } });
    }, [academyId, fetchTasks]);

    useEffect(() => {
        if (!academyId) return;
        const STALE_MS = 5 * 60 * 1000;
        const { loading: studentsLoading, lastFetchedAt } = useStudentStore.getState();
        if (studentsLoading) return;
        if (students.length > 0 && lastFetchedAt && Date.now() - lastFetchedAt < STALE_MS) {
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

    const followupPlaybook = useMemo(() => {
        const acad = (academyList || []).find((a) => a.id === academyId) || {};
        return readFollowupPlaybook(acad.settings);
    }, [academyList, academyId]);

    const followupEventsCtx = useMemo(
        () => ({
            playbook: followupPlaybook,
            followupDoneByLead: followupDoneAtByLead,
            followupContactByLead: followupContactAtByLead,
            followupSnoozeUntilByLead,
            inboundAfterByLead,
            inboundAfterByPhone,
        }),
        [
            followupPlaybook,
            followupDoneAtByLead,
            followupContactAtByLead,
            followupSnoozeUntilByLead,
            inboundAfterByLead,
            inboundAfterByPhone,
        ]
    );

    const { agendaWeekLeads, todayScheduled, scheduledInVisibleWeekCount } = useDashboardLeadAgenda();
    const {
        followUps,
        followUpsKanbanOnlyCount,
        followupTemperatureCounts,
        followUpGroups,
        followupHealthSummary,
        showFollowupHealthPanel,
    } = useDashboardFollowupLeads(followupEventsCtx);

    const todayBirthdays = useMemo(() => {
        const mesEDia = getTodayMonthDay();
        return (students || [])
            .filter((s) => {
                if (String(s?.studentStatus || '').trim() === STUDENT_STATUS.INACTIVE) return false;
                return getBirthMonthDay(s.birthDate) === mesEDia;
            })
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
    }, [students]);

    const isZeroState = !loading && leadsCount === 0 && (tasks || []).length === 0;

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

    const visibleWeekAgendaCount = scheduledInVisibleWeekCount(dashboardWeekOffset);

    const scrollToFollowUps = () => {
        setFollowUpsPanelOpen(true);
        requestAnimationFrame(() => {
            (retornosRowRef.current || followUpsSectionRef.current)?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        });
    };

    useEffect(() => {
        if (searchParams.get('retornos') !== '1') return;
        scrollToFollowUps();
        const next = new URLSearchParams(searchParams);
        next.delete('retornos');
        setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scroll once when ?retornos=1
    }, [searchParams]);

    const {
        outcomeLead: followupOutcomeLead,
        openOutcome: openFollowupOutcomeDialog,
        closeOutcome: closeFollowupOutcomeDialog,
        confirmOutcome: hookConfirmFollowupOutcome,
    } = useFollowupOutcome({
        source: 'dashboard',
        onSuccess: () => {
            refreshFollowupFromCache();
            setFollowUpMicroToastOpen(true);
        },
    });

    const scrollToWeekSection = (focusToday = false) => {
        requestAnimationFrame(() => {
            weekSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            if (focusToday && dashboardWeekOffset === 0) {
                requestAnimationFrame(() => {
                    const todayCol = weekSectionRef.current?.querySelector('.day-col.today');
                    todayCol?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                });
            }
        });
    };

    const scrollToBirthdayBanner = () => {
        requestAnimationFrame(() => {
            document
                .getElementById('dashboard-birthday-banner')
                ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    };

    const openBirthdayList = () => {
        if (todayBirthdays.length > 1) {
            setBirthdayModalOpen(true);
            return;
        }
        scrollToBirthdayBanner();
    };

    const handleDayPriorityAction = () => {
        const target = dayPriority.scrollTarget;
        if (target === 'today') {
            if (dashboardWeekOffset !== 0) setDashboardWeekOffset(0);
            scrollToWeekSection(true);
        } else if (target === 'follow-ups') scrollToFollowUps();
        else if (target === 'birthday-banner') {
            if (todayBirthdays.length > 1) setBirthdayModalOpen(true);
            else scrollToBirthdayBanner();
        }
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
        if (cardKey === 'enrollments') {
            navigate('/reports?tab=funil');
            return;
        }
        if (cardKey === 'today') {
            if (dashboardWeekOffset !== 0) {
                setDashboardWeekOffset(0);
            }
            scrollToWeekSection();
            return;
        }
        setListModalType(cardKey);
    };

    const academyDisplayName = useMemo(() => {
        const fromWa = String(dashWaName || academyWa.name || '').trim();
        if (fromWa) return fromWa;
        const acad = (academyList || []).find((a) => a.id === academyId) || {};
        return String(acad.name || acad.label || '').trim();
    }, [dashWaName, academyWa.name, academyList, academyId]);

    const weeklyEnrollmentsCount = useMemo(
        () => countWeeklyEnrollments(students, new Date()),
        [students]
    );

    const monthEnrollmentMetrics = useDashboardMonthEnrollmentMetrics(students);

    const dayPriority = useMemo(
        () =>
            getDayPriority({
                now: new Date(),
                todayScheduled,
                followUps,
                todayBirthdays,
                vertical,
            }),
        [todayScheduled, followUps, todayBirthdays, vertical]
    );

    const daySummaryLine = useMemo(
        () =>
            buildDaySummaryLine({
                todayScheduled,
                followUps,
                pendingTasks,
                trialShort: terms.trialShort,
                weeklyEnrollments: weeklyEnrollmentsCount,
                omitTodaySchedule: dayPriority.type === 'upcoming_class',
            }),
        [
            todayScheduled,
            followUps,
            pendingTasks,
            terms.trialShort,
            weeklyEnrollmentsCount,
            dayPriority.type,
        ]
    );

    const heroDateLine = useMemo(() => buildHeroDateLine(new Date()), []);

    const heroPeriod = useMemo(() => getTimeOfDayPeriod(new Date()), []);

    const showDayPriority =
        !loading &&
        dayPriority.type !== 'fallback' &&
        Boolean(dayPriority.message);

    useEffect(() => {
        if (!academyId || loading) return;
        const streak = touchFollowupStreak(academyId, followUps.length, new Date());
        setFollowupStreak(streak);
    }, [academyId, loading, followUps.length]);

    const showWeekAgendaPanel = !isZeroState;

    const heroStats = useMemo(() => {
        const followupUrgent =
            followupTemperatureCounts.cooling + followupTemperatureCounts.critical;
        const todayFootnote = buildTodayKpiFootnote(todayScheduled.length);
        const enrollmentFootnote = buildEnrollmentKpiFootnote(monthEnrollmentMetrics);
        const followupFootnote = buildFollowupKpiFootnote(followUps.length, followupUrgent);
        const tasksFootnote = buildTasksKpiFootnote(pendingTasks.length);

        return [
            {
                key: 'today',
                label: `${trialSeriesPlural} hoje`,
                count: todayScheduled.length,
                tone: todayScheduled.length > 0 ? 'primary' : 'muted',
                icon: <Calendar {...HERO_KPI_ICON_PROPS} aria-hidden />,
                ...todayFootnote,
            },
            {
                key: 'enrollments',
                label: 'Matrículas no mês',
                count: monthEnrollmentMetrics.enrolledInMonth,
                tone: monthEnrollmentMetrics.enrolledInMonth > 0 ? 'success' : 'muted',
                icon: <Users {...HERO_KPI_ICON_PROPS} aria-hidden />,
                ...enrollmentFootnote,
            },
            {
                key: 'followup',
                label: followupKpiLabel(),
                count: followUps.length,
                tone:
                    followupTemperatureCounts.critical > 0
                        ? 'attention'
                        : followUps.length > 0
                          ? 'default'
                          : 'success',
                icon: <MessageCircle {...HERO_KPI_ICON_PROPS} aria-hidden />,
                ...followupFootnote,
            },
            {
                key: 'tasks',
                label: 'Tarefas',
                count: pendingTasks.length,
                tone: pendingTasks.length > 0 ? 'attention' : 'muted',
                icon: <CheckSquare {...HERO_KPI_ICON_PROPS} aria-hidden />,
                ...tasksFootnote,
            },
        ];
    }, [
        trialSeriesPlural,
        todayScheduled.length,
        monthEnrollmentMetrics,
        followUps.length,
        pendingTasks.length,
        followupTemperatureCounts.cooling,
        followupTemperatureCounts.critical,
    ]);

    const modalListItems =
        listModalType === 'today'
            ? todayScheduled
            : listModalType === 'tasks'
              ? pendingTasks
              : [];

    const modalTitle =
        listModalType === 'today'
            ? `${trialSeriesPlural} hoje`
            : listModalType === 'tasks'
              ? 'Próximas tarefas'
              : '';

    const handleBirthdayWhatsApp = async (student, e) => {
        e?.stopPropagation?.();
        const studentId = String(student?.id || '').trim();
        if (!studentId || sendingBirthdayWa) return;
        setSendingBirthdayWa(studentId);
        try {
            await sendWhatsappTemplateOutbound({
                lead: student,
                academyId,
                academyName: academyDisplayName,
                templateKey: 'birthday',
                templatesMap: academyWa.templates,
                zapsterInstanceId: academyWa.zapster_instance_id,
                onToast: (t) => addToast(t),
            });
        } finally {
            setSendingBirthdayWa('');
        }
    };

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
        const templateKey =
            lead?.nextStep?.template_key ||
            (lead?.status === LEAD_STATUS.MISSED ? 'missed' : 'post_class');

        void (async () => {
            const result = await sendDashboardTemplate(lead, templateKey);
            if (!result?.ok) {
                setWaStateByLead((prev) => {
                    const next = { ...prev };
                    delete next[leadId];
                    return next;
                });
                return;
            }
            const nowIso = new Date().toISOString();
            try {
                const st = useLeadStore.getState();
                const acad = (st.academyList || []).find((a) => a.id === st.academyId) || {};
                const permCtx = { ownerId: acad.ownerId, teamId: acad.teamId, userId: st.userId || '' };
                await addLeadEvent({
                    academyId: st.academyId,
                    leadId: lead.id,
                    type: 'followup_contact',
                    text: 'Contato de retorno via WhatsApp',
                    createdBy: st.userId || 'user',
                    permissionContext: permCtx,
                    payloadJson: {
                        source: 'dashboard',
                        templateKey,
                        scheduledDate: lead.scheduledDate || '',
                    },
                });
                patchFollowupContactCache(st.academyId, leadId, nowIso);
                refreshFollowupFromCache();
            } catch {
                void 0;
            }
            const delay = Math.max(0, 1200 - (Date.now() - startedAt));
            window.setTimeout(() => {
                setWaStateByLead((prev) => ({ ...prev, [leadId]: 'sent' }));
            }, delay);
        })();
    };

    const markLeadAttended = async (lead) => {
        const k = `${lead.id}:attended`;
        const attendedTodayBefore = todayScheduled.filter(
            (l) => l.status === LEAD_STATUS.COMPLETED
        ).length;
        const isFirstOfDay = attendedTodayBefore === 0;
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
            addToast({ type: 'success', message: toastAttendedSuccess(isFirstOfDay) });
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
            addToast({ type: 'success', message: toastMissedSuccess() });
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

    const openFollowupOutcome = (lead, e) => {
        const leadId = String(lead?.id || '').trim();
        if (!leadId || savingFollowupDone[leadId]) return;
        if (e?.currentTarget) addRipple(e.currentTarget, e);
        openFollowupOutcomeDialog(lead);
    };

    const confirmFollowupOutcome = async (payload) => {
        const lead = followupOutcomeLead;
        const leadId = String(lead?.id || '').trim();
        if (!leadId) return;

        setSavingFollowupDone((prev) => ({ ...prev, [leadId]: true }));
        const startedAt = Date.now();
        setFlashingFollowupIds((prev) => ({ ...prev, [leadId]: true }));

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
        };

        try {
            await hookConfirmFollowupOutcome(payload);
            const elapsed = Date.now() - startedAt;
            window.setTimeout(clearFollowupVisuals, Math.max(0, 1050 - elapsed));
        } catch {
            clearFollowupVisuals();
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
            addToast({ type: 'error', message: friendlyError(e, 'action') });
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

    const renderFollowUpRow = (lead, rowIndex, isLastInGroup) => {
        const isPost = lead.status === LEAD_STATUS.COMPLETED;
        const leadId = String(lead.id || '').trim();
        const waState = waStateByLead[leadId] || 'idle';
        const elapsedLabel =
            lead.daysAgo === 0 ? 'hoje' : lead.daysAgo === 1 ? 'há 1 dia' : `há ${lead.daysAgo} dias`;
        const fuTimeClass =
            lead.temperature === 'critical' ? 'fu-time--urgent' : lead.temperature === 'cooling' ? 'fu-time--cooling' : '';
        const statusFallback = isPost
            ? (vertical === 'physio' ? 'Pós-avaliação' : 'Pós-aula')
            : 'Recuperar';
        const elapsedTitle =
            lead.daysAgo === 0
                ? (vertical === 'physio' ? 'Dia da avaliação' : 'Dia da aula experimental')
                : `Há ${lead.daysAgo} dias desde a data da ${vertical === 'physio' ? 'avaliação' : 'aula'}`;

        return (
            <div
                key={lead.id}
                className={`fu-row animate-in${
                    flashingFollowupIds[leadId] ? ' fu-row--flashing' : ''
                }${leavingFollowupIds[leadId] ? ' fu-row--leaving' : ''}${
                    removingFollowupIds[lead.id] ? ' fu-row--removing' : ''
                }${isLastInGroup ? ' fu-row--last' : ''}`}
                style={{ animationDelay: `${0.04 * rowIndex}s` }}
            >
                <div className="fu-info">
                    <button
                        type="button"
                        className="fu-name"
                        title={lead.name}
                        onClick={() =>
                            navigate(`/lead/${lead.id}`, { state: { from: LEAD_PROFILE_FROM_DASHBOARD } })
                        }
                    >
                        {lead.name}
                    </button>
                    <div className="fu-sub">
                        <FollowupTemperatureBadge temperature={lead.temperature} />
                        <span className="fu-meta-sep" aria-hidden>
                            ·
                        </span>
                        <span className="fu-phone">{lead.phone || '—'}</span>
                        <span className="fu-meta-sep" aria-hidden>
                            ·
                        </span>
                        <span className={`fu-time${fuTimeClass ? ` ${fuTimeClass}` : ''}`} title={elapsedTitle}>
                            {elapsedLabel}
                        </span>
                        <span className="fu-meta-sep" aria-hidden>
                            ·
                        </span>
                        {lead.pipelineStage ? (
                            <StageBadge stage={String(lead.pipelineStage)} size="sm" showDot={false} />
                        ) : (
                            <span className="fu-meta-status">{statusFallback}</span>
                        )}
                    </div>
                    {lead.nextActionLabel ? (
                        <div className="fu-next-action">
                            <span className="fu-next-action__label">Próxima ação</span>
                            <span className="fu-next-action__value">{lead.nextActionLabel}</span>
                            {lead.phone ? (
                                <Link className="fu-inbox-link" to={`/inbox?phone=${encodeURIComponent(lead.phone)}`}>
                                    Abrir conversa
                                </Link>
                            ) : null}
                        </div>
                    ) : null}
                </div>
                <div className="fu-row__actions-bar">
                    <FollowupCopilotButtons
                        academyId={academyId}
                        leadId={leadId}
                        leadPhone={lead.phone}
                        templateKey={lead?.nextStep?.template_key}
                        nextAction={lead.nextActionLabel}
                        compact
                        menuMode
                    />
                    <div className="fu-btns">
                    <button
                        type="button"
                        className={`btn-wa wa-btn wa-btn--icon-only${waState === 'loading' ? ' wa-btn--loading' : ''}${
                            waState === 'sent' ? ' wa-btn--sent' : ''
                        }`}
                        disabled={waState === 'sent'}
                        aria-busy={waState === 'loading'}
                        aria-label={
                            waState === 'loading'
                                ? 'Enviando WhatsApp'
                                : waState === 'sent'
                                  ? 'WhatsApp enviado'
                                  : 'Abrir WhatsApp'
                        }
                        title={
                            waState === 'loading'
                                ? 'Enviando…'
                                : waState === 'sent'
                                  ? 'Enviado'
                                  : 'Abrir WhatsApp'
                        }
                        onClick={(e) => handleFollowUpWhatsApp(lead, e)}
                    >
                        {waState === 'loading' ? (
                            <Loader2 className="wa-icon wa-icon--spin" size={14} color="#fff" aria-hidden />
                        ) : waState === 'sent' ? (
                            <Check className="wa-icon" size={14} color="#fff" strokeWidth={2.5} aria-hidden />
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
                            </>
                        )}
                    </button>
                    <button
                        type="button"
                        className="mk-btn mk-btn--icon"
                        disabled={Boolean(
                            savingFollowupDone[leadId] ||
                            flashingFollowupIds[leadId] ||
                            leavingFollowupIds[leadId]
                        )}
                        aria-label="Concluir retorno"
                        title={savingFollowupDone[leadId] ? 'Salvando…' : 'Concluir retorno'}
                        onClick={(e) => openFollowupOutcome(lead, e)}
                    >
                        {savingFollowupDone[leadId] ? (
                            <Loader2 className="mk-btn__icon mk-btn__icon--spin" size={14} aria-hidden />
                        ) : (
                            <Check className="mk-btn__icon" size={14} strokeWidth={2.5} aria-hidden />
                        )}
                    </button>
                    </div>
                </div>
            </div>
        );
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

            <section
                className={`dashboard-day-hero dashboard-day-hero--${heroPeriod} animate-in`}
                style={{ animationDelay: '0.04s' }}
                aria-busy={loading}
            >
                <div className="dashboard-day-hero__briefing">
                    <div className="dashboard-day-hero__main">
                        <div className="dashboard-day-hero__head">
                            <p className="dashboard-day-hero__date">{loading ? 'Carregando…' : heroDateLine}</p>
                            {!loading ? (
                                <button
                                    type="button"
                                    className="dashboard-day-hero__refresh"
                                    onClick={() => void handleRefresh()}
                                    disabled={loading || isRefreshing}
                                    aria-label="Atualizar dados do dia"
                                >
                                    <RefreshCcw
                                        size={16}
                                        className={isRefreshing ? 'spin-refresh' : ''}
                                        strokeWidth={2}
                                        aria-hidden
                                    />
                                </button>
                            ) : null}
                        </div>
                        {!loading ? (
                            <p className="dashboard-day-hero__summary">{daySummaryLine}</p>
                        ) : null}
                        {showDayPriority ? (
                            <div className="dashboard-day-hero__priority">
                                <p className="dashboard-day-hero__priority-text">{dayPriority.message}</p>
                                {dayPriority.scrollTarget ? (
                                    <button
                                        type="button"
                                        className="dashboard-day-hero__priority-btn"
                                        onClick={handleDayPriorityAction}
                                    >
                                        Ver agora
                                    </button>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                    {!loading && todayBirthdays.length > 0 ? (
                        <DashboardBirthdayBanner
                            students={todayBirthdays}
                            academyId={academyId}
                            academyName={academyDisplayName}
                            templatesMap={academyWa.templates}
                            zapsterInstanceId={academyWa.zapster_instance_id}
                            onToast={(t) => addToast(t)}
                            onOpenList={openBirthdayList}
                        />
                    ) : null}
                </div>
                <div className="dashboard-day-hero__metrics" aria-label="Indicadores do dia">
                    <div className="dashboard-day-hero__stats" role="list">
                        {loading ? (
                            <SkeletonCard variant="hero-kpi" count={4} className="dashboard-day-hero__skeletons" />
                        ) : (
                            heroStats.map((stat) => (
                                <div key={stat.key} role="listitem" className="dashboard-day-hero__stat-cell">
                                    <DashboardHeroKpi
                                        label={stat.label}
                                        value={stat.count}
                                        footnote={stat.footnote}
                                        footnoteTone={stat.footnoteTone}
                                        icon={stat.icon}
                                        tone={heroKpiTone(stat)}
                                        spotlight={dayPriority.highlightKpi === stat.key}
                                        onClick={() => handleKpiClick(stat.key)}
                                    />
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </section>

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
            {showWeekAgendaPanel ? (
                <DashboardAgendaWeekPanel
                    weekSectionRef={weekSectionRef}
                    weekOffset={dashboardWeekOffset}
                    onWeekOffsetChange={setDashboardWeekOffset}
                    onRefresh={handleRefresh}
                    loading={loading}
                    isRefreshing={isRefreshing}
                    onCompareceu={markLeadAttended}
                    onNaoCompareceu={markLeadMissed}
                    savingPresence={savingPresence}
                    isDashboardMobile={isDashboardMobile}
                    vertical={vertical}
                    trialSeriesPlural={trialSeriesPlural}
                    agendaWeekLeads={agendaWeekLeads}
                    visibleWeekCount={visibleWeekAgendaCount}
                />
            ) : null}

            {isDashboardMobile && !loading && followUps.length > 0 ? (
                <button
                    type="button"
                    className="dashboard-retornos-chip"
                    onClick={scrollToFollowUps}
                >
                    <List size={14} strokeWidth={2} aria-hidden />
                    {`${followUps.length} retorno${followUps.length === 1 ? '' : 's'} pendente${followUps.length === 1 ? '' : 's'}`}
                </button>
            ) : null}

            <div id="retornos-row" ref={retornosRowRef} className="agenda-bottom-row">
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
                                            <List size={18} color="var(--color-primary)" strokeWidth={2} aria-hidden /> Retornos pendentes
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
                                            <List size={18} color="var(--color-primary)" strokeWidth={2} aria-hidden /> Retornos pendentes
                                        </>
                                    }
                                />
                                <span className="badge badge-secondary reception-section-badge">{followUps.length}</span>
                            </span>
                        </div>
                    )}
                </div>
                <div id="follow-ups-panel-body" className="agenda-followups-section__body">
                <div
                    className={`fu-list-card${
                        followUps.length >= 6 ? ' fu-list-card--scrollable' : ''
                    }`}
                >
                    {followUps.length > 0 ? (
                        followUpGroups.map((group) => (
                            <div key={group.key} className={`fu-group ${group.className}`}>
                                <div className="fu-group__head">
                                    <h3 className="fu-group__title">
                                        {group.label}
                                        {followUpGroups.length > 1 ? ` (${group.items.length})` : ''}
                                    </h3>
                                    <span className="fu-group__hint">{group.hint}</span>
                                </div>
                                {group.items.map((lead, i) =>
                                    renderFollowUpRow(lead, i, i === group.items.length - 1)
                                )}
                            </div>
                        ))
                    ) : (
                        <div className="fu-list-empty fu-list-empty--all-done" role="status">
                            <CheckCircle2 className="fu-list-empty__icon" size={24} strokeWidth={2} aria-hidden />
                            <p className="fu-list-empty__title">{followupsAllDoneTitle()}</p>
                            {followupStreakMessage(followupStreak) ? (
                                <p className="fu-list-empty__streak" role="status">
                                    <span className="fu-list-empty__streak-badge">
                                        {followupStreakMessage(followupStreak)}
                                    </span>
                                </p>
                            ) : null}
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
                    <div className="fu-kanban-more" role="note">
                        <button
                            type="button"
                            className="fu-kanban-link"
                            title={`Retornos com ${FOLLOWUP_AGENDA_MAX_DAYS}+ dias desde a ${
                                vertical === 'physio' ? 'avaliação' : 'aula'
                            }`}
                            onClick={() => navigate('/pipeline?followup=kanban')}
                        >
                            + {followUpsKanbanOnlyCount} no Kanban
                        </button>
                        <span className="fu-kanban-more-hint">
                            há mais de {FOLLOWUP_AGENDA_MAX_DAYS} dias
                        </span>
                    </div>
                )}
                </div>
            </section>

            {!loading && !isZeroState && showFollowupHealthPanel ? (
                <FollowupHealthPanel
                    summary={followupHealthSummary}
                    showLeadList={followUps.length === 0}
                    className="agenda-bottom-row__health"
                />
            ) : null}
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
                                            {savingPresence[`${lead.id}:attended`] ? 'Salvando…' : attendedButtonLabel(vertical)}
                                        </button>
                                        <button
                                            type="button"
                                            className="followup-action-btn flex-1"
                                            disabled={busy}
                                            onClick={() => void markLeadMissed(lead)}
                                        >
                                            {savingPresence[`${lead.id}:missed`] ? 'Salvando…' : missedButtonLabel()}
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
                message={followupMicroToastMessage()}
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

            <FollowupOutcomeDialog
                open={Boolean(followupOutcomeLead)}
                leadName={followupOutcomeLead?.name || ''}
                saving={Boolean(followupOutcomeLead && savingFollowupDone[String(followupOutcomeLead.id || '').trim()])}
                onClose={closeFollowupOutcomeDialog}
                onConfirm={(payload) => void confirmFollowupOutcome(payload)}
            />

            <DashboardBirthdayModal
                open={birthdayModalOpen}
                onClose={() => setBirthdayModalOpen(false)}
                students={todayBirthdays}
                sendingStudentId={sendingBirthdayWa}
                canSendWa={Boolean(String(academyWa.zapster_instance_id || '').trim())}
                onSendWhatsApp={(student) => void handleBirthdayWhatsApp(student)}
            />
</div>
        </div>
    );
};

export default Dashboard;
