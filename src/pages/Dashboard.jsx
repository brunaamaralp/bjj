import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import { useTaskStore } from '../store/useTaskStore';
import { useStudentStore } from '../store/useStudentStore';
import { useUiStore } from '../store/useUiStore';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Query } from 'appwrite';
import { databases, DB_ID, LEAD_EVENTS_COL } from '../lib/appwrite';
import { DEFAULT_WHATSAPP_TEMPLATES } from '../../lib/whatsappTemplateDefaults.js';
import { useWhatsappTemplates } from '../lib/useWhatsappTemplates.js';
import { sendWhatsappTemplateOutbound } from '../lib/outboundWhatsappTemplate.js';
import { Plus, Calendar, ChevronDown, MessageCircle, RefreshCcw, List, Check, CheckCircle2, DoorOpen, Loader2, Cake } from 'lucide-react';
import { addRipple } from '../lib/addRipple.js';
import FollowUpMicroToast from '../components/dashboard/FollowUpMicroToast.jsx';
import DashboardBirthdayBanner from '../components/dashboard/DashboardBirthdayBanner.jsx';
import {
    buildHeroDateLine,
    buildHeroAcademyLine,
    buildDaySummaryLine,
    getDayPriority,
    getTimeOfDayPeriod,
    countWeeklyEnrollments,
} from '../lib/dashboardDayBriefing.js';
import {
    attendedButtonLabel,
    missedButtonLabel,
    attendedStatusLabel,
    missedStatusLabel,
    emptyTodayTitle,
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
import HubTabBar from '../components/shared/HubTabBar.jsx';
import ReportSectionHeading from '../components/reports/shared/ReportSectionHeading.jsx';
import SkeletonCard from '../components/shared/SkeletonCard.jsx';
import StageBadge from '../components/shared/StageBadge.jsx';
import { getBirthMonthDay, getTodayMonthDay } from '../lib/birthDate.js';
import { STUDENT_STATUS } from '../lib/studentStatus.js';
import '../styles/dashboard.css';
import TaskCard from '../components/shared/TaskCard.jsx';
import {
    patchFollowupContactCache,
    getFollowupEventsCache,
    setFollowupEventsCache,
} from '../lib/followupEventsCache.js';
import {
    FOLLOWUP_AGENDA_MAX_DAYS,
    enrichFollowUpLeads,
    sortFollowupsByTemperature,
    groupFollowUpsByTemperature,
    countFollowupsByTemperature,
} from '../lib/followupState.js';
import { readFollowupPlaybook } from '../lib/followupPlaybookDefaults.js';
import { computeFollowupHealthSummary } from '../lib/followupManagerHealth.js';
import FollowupTemperatureBadge from '../components/followup/FollowupTemperatureBadge.jsx';
import FollowupTemperatureLegend from '../components/followup/FollowupTemperatureLegend.jsx';
import FollowupOutcomeDialog from '../components/followup/FollowupOutcomeDialog.jsx';
import FollowupCopilotButtons from '../components/followup/FollowupCopilotButtons.jsx';
import FollowupHealthPanel from '../components/dashboard/FollowupHealthPanel.jsx';
import { useFollowupOutcome } from '../hooks/useFollowupOutcome.js';
const DEFAULT_STAGE_SLA_DAYS = 3;

function groupTodayByPeriod(leads) {
    const morning = [];
    const afternoon = [];
    const evening = [];
    const noTime = [];
    for (const lead of leads) {
        const raw = String(lead?.scheduledTime || '').trim();
        if (!raw || !/^\d{2}:\d{2}$/.test(raw)) {
            noTime.push(lead);
            continue;
        }
        const hour = Number(raw.split(':')[0]);
        if (!Number.isFinite(hour)) {
            noTime.push(lead);
            continue;
        }
        if (hour < 12) morning.push(lead);
        else if (hour < 18) afternoon.push(lead);
        else evening.push(lead);
    }
    const sortByTime = (a, b) =>
        String(a?.scheduledTime || '99:99').localeCompare(String(b?.scheduledTime || '99:99'));
    morning.sort(sortByTime);
    afternoon.sort(sortByTime);
    evening.sort(sortByTime);
    const groups = [];
    if (morning.length > 0) groups.push({ key: 'morning', label: 'Manhã', items: morning });
    if (afternoon.length > 0) groups.push({ key: 'afternoon', label: 'Tarde', items: afternoon });
    if (evening.length > 0) groups.push({ key: 'evening', label: 'Noite', items: evening });
    if (noTime.length > 0) groups.push({ key: 'notime', label: 'Sem horário', items: noTime });
    return groups;
}
const Dashboard = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
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
    const [followupDoneAtByLead, setFollowupDoneAtByLead] = useState({});
    const [followupContactAtByLead, setFollowupContactAtByLead] = useState({});
    const [followupSnoozeUntilByLead, setFollowupSnoozeUntilByLead] = useState({});
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
    const [mobileAgendaTab, setMobileAgendaTab] = useState('today');
    const hiddenAtRef = useRef(null);
    const followUpsSectionRef = useRef(null);
    const todaySectionRef = useRef(null);
    const weekSectionRef = useRef(null);
    const birthdaysSectionRef = useRef(null);
    const [followupStreak, setFollowupStreak] = useState(0);
    const [sendingBirthdayWa, setSendingBirthdayWa] = useState('');

    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        const mq = window.matchMedia('(max-width: 767px)');
        const onChange = () => setIsDashboardMobile(mq.matches);
        onChange();
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    useEffect(() => {
        if (isDashboardMobile && dashboardWeekOffset !== 0 && mobileAgendaTab === 'today') {
            setMobileAgendaTab('week');
        }
    }, [isDashboardMobile, dashboardWeekOffset, mobileAgendaTab]);

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
        const { leads, leadsLastFetchedAt } = useLeadStore.getState();
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
            setFollowupContactAtByLead({});
            setFollowupSnoozeUntilByLead({});
            return;
        }
        const cached = getFollowupEventsCache(academyId);
        if (cached) {
            setFollowupDoneAtByLead(cached.doneByLead || {});
            setFollowupContactAtByLead(cached.contactByLead || {});
            setFollowupSnoozeUntilByLead(cached.snoozeUntilByLead || {});
            return;
        }
        let cancelled = false;
        const loadFollowupEvents = async () => {
            try {
                let cursor = null;
                let pageCount = 0;
                const doneByLead = {};
                const contactByLead = {};
                const snoozeUntilByLead = {};
                const cutoff = new Date();
                cutoff.setDate(cutoff.getDate() - FOLLOWUP_AGENDA_MAX_DAYS);
                const cutoffIso = cutoff.toISOString();
                const parsePayload = (doc) => {
                    const raw = doc?.payload_json ?? doc?.payloadJson;
                    if (!raw) return {};
                    if (typeof raw === 'object') return raw;
                    try {
                        return JSON.parse(raw);
                    } catch {
                        return {};
                    }
                };
                do {
                    const queries = [
                        Query.equal('academy_id', [String(academyId || '').trim()]),
                        Query.equal('type', ['followup_done', 'followup_contact', 'followup_snooze']),
                        Query.greaterThan('at', cutoffIso),
                        Query.orderDesc('at'),
                        Query.limit(100),
                    ];
                    if (cursor) queries.push(Query.cursorAfter(cursor));
                    const res = await databases.listDocuments(DB_ID, LEAD_EVENTS_COL, queries);
                    const docs = Array.isArray(res?.documents) ? res.documents : [];
                    for (const d of docs) {
                        const leadId = String(d?.lead_id || '').trim();
                        const at = String(d?.at || '').trim();
                        const type = String(d?.type || '').trim();
                        if (!leadId || !at) continue;
                        const payload = parsePayload(d);
                        if (type === 'followup_done' && !doneByLead[leadId]) doneByLead[leadId] = at;
                        if (type === 'followup_contact' && !contactByLead[leadId]) contactByLead[leadId] = at;
                        if (type === 'followup_snooze' && !snoozeUntilByLead[leadId]) {
                            const until = String(payload.untilYmd || '').slice(0, 10);
                            if (until) snoozeUntilByLead[leadId] = until;
                        }
                    }
                    cursor = docs.length === 100 ? docs[docs.length - 1]?.$id : null;
                    pageCount += 1;
                } while (cursor && pageCount < 10);
                if (!cancelled) {
                    setFollowupDoneAtByLead(doneByLead);
                    setFollowupContactAtByLead(contactByLead);
                    setFollowupSnoozeUntilByLead(snoozeUntilByLead);
                    setFollowupEventsCache(academyId, { doneByLead, contactByLead, snoozeUntilByLead });
                }
            } catch {
                if (!cancelled) {
                    setFollowupDoneAtByLead({});
                    setFollowupContactAtByLead({});
                    setFollowupSnoozeUntilByLead({});
                }
            }
        };
        void loadFollowupEvents();
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

    const followupPlaybook = useMemo(() => {
        const acad = (academyList || []).find((a) => a.id === academyId) || {};
        return readFollowupPlaybook(acad.settings);
    }, [academyList, academyId]);

    const followupEventsCtx = useMemo(
        () => ({
            playbook: followupPlaybook,
            followupDoneByLead: followupDoneAtByLead,
            followupContactByLead: followupContactAtByLead,
            followupSnoozeUntilByLead: followupSnoozeUntilByLead,
        }),
        [followupPlaybook, followupDoneAtByLead, followupContactAtByLead, followupSnoozeUntilByLead]
    );

    const followUpsAll = useMemo(
        () =>
            enrichFollowUpLeads(
                leads.filter(
                    (l) =>
                        excludeImportedOrigin(l) &&
                        (l.status === LEAD_STATUS.COMPLETED || l.status === LEAD_STATUS.MISSED)
                ),
                followupEventsCtx
            ),
        [leads, followupEventsCtx]
    );

    const followUpsKanbanOnlyCount = followUpsAll.filter(
        (l) => !l.doneForCurrentClass && !l.isSnoozed && l.daysAgo >= FOLLOWUP_AGENDA_MAX_DAYS
    ).length;

    const followUps = useMemo(
        () =>
            followUpsAll
                .filter((l) => !l.doneForCurrentClass && !l.isSnoozed && l.daysAgo < FOLLOWUP_AGENDA_MAX_DAYS)
                .sort(sortFollowupsByTemperature),
        [followUpsAll]
    );

    const followupTemperatureCounts = useMemo(() => countFollowupsByTemperature(followUps), [followUps]);

    const followupHealthSummary = useMemo(
        () =>
            computeFollowupHealthSummary(followUpsAll, {
                followupDoneByLead: followupDoneAtByLead,
                followupContactByLead: followupContactAtByLead,
            }),
        [followUpsAll, followupDoneAtByLead, followupContactAtByLead]
    );

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
            const cached = getFollowupEventsCache(academyId);
            if (cached) {
                setFollowupDoneAtByLead(cached.doneByLead || {});
                setFollowupContactAtByLead(cached.contactByLead || {});
                setFollowupSnoozeUntilByLead(cached.snoozeUntilByLead || {});
            }
            setFollowUpMicroToastOpen(true);
        },
    });

    const scrollToTodaySection = () => {
        if (isDashboardMobile) setMobileAgendaTab('today');
        requestAnimationFrame(() => {
            todaySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    };

    const scrollToWeekSection = () => {
        if (isDashboardMobile) setMobileAgendaTab('week');
        requestAnimationFrame(() => {
            weekSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    };

    const scrollToBirthdaysSection = () => {
        requestAnimationFrame(() => {
            birthdaysSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    };

    const handleDayPriorityAction = () => {
        const target = dayPriority.scrollTarget;
        if (target === 'today') scrollToTodaySection();
        else if (target === 'follow-ups') scrollToFollowUps();
        else if (target === 'birthdays') scrollToBirthdaysSection();
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
        if (cardKey === 'today') {
            if (dashboardWeekOffset !== 0) {
                setDashboardWeekOffset(0);
            }
            scrollToTodaySection();
            return;
        }
        if (cardKey === 'week') {
            if (isDashboardMobile) {
                scrollToWeekSection();
                return;
            }
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

    const daySummaryLine = useMemo(
        () =>
            buildDaySummaryLine({
                todayScheduled,
                followUps,
                pendingTasks,
                trialShort: terms.trialShort,
                weeklyEnrollments: weeklyEnrollmentsCount,
            }),
        [todayScheduled, followUps, pendingTasks, terms.trialShort, weeklyEnrollmentsCount]
    );

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

    const heroDateLine = useMemo(() => buildHeroDateLine(new Date()), []);
    const heroAcademyLine = useMemo(
        () => buildHeroAcademyLine(academyDisplayName),
        [academyDisplayName]
    );

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

    const followUpGroups = useMemo(() => groupFollowUpsByTemperature(followUps), [followUps]);

    const todayPeriodGroups = useMemo(() => groupTodayByPeriod(todayScheduled), [todayScheduled]);

    const showTodayAgendaPanel =
        !isZeroState && dashboardWeekOffset === 0 && (!isDashboardMobile || mobileAgendaTab === 'today');
    const showWeekAgendaPanel = !isZeroState && (!isDashboardMobile || mobileAgendaTab === 'week');

    const mobileAgendaTabs = useMemo(
        () => [
            {
                id: 'today',
                label: `Hoje${todayScheduled.length > 0 ? ` (${todayScheduled.length})` : ''}`,
            },
            {
                id: 'week',
                label: `Semana${weekScheduled.length > 0 ? ` (${weekScheduled.length})` : ''}`,
            },
        ],
        [todayScheduled.length, weekScheduled.length]
    );

    const weekSectionTitle =
        isDashboardMobile || dashboardWeekOffset !== 0 ? 'Agenda da semana' : 'Resto da semana';

    const handleMobileAgendaTabChange = (tabId) => {
        setMobileAgendaTab(tabId);
        if (tabId === 'today' && dashboardWeekOffset !== 0) {
            setDashboardWeekOffset(0);
        }
    };

    const heroStats = useMemo(
        () => [
            {
                key: 'today',
                label: `${trialSeriesPlural} hoje`,
                count: todayScheduled.length,
                tone: todayScheduled.length > 0 ? 'primary' : 'muted',
            },
            {
                key: 'week',
                label: 'Esta semana',
                count: weekScheduled.length,
                tone: weekScheduled.length > 0 ? 'default' : 'muted',
            },
            {
                key: 'followup',
                label: followupKpiLabel(),
                count: followUps.length,
                sub:
                    followupTemperatureCounts.cooling + followupTemperatureCounts.critical > 0
                        ? `${followupTemperatureCounts.cooling + followupTemperatureCounts.critical} esfriando`
                        : '',
                tone:
                    followupTemperatureCounts.critical > 0
                        ? 'attention'
                        : followUps.length > 0
                          ? 'default'
                          : 'success',
            },
            {
                key: 'tasks',
                label: 'Tarefas',
                count: pendingTasks.length,
                tone: pendingTasks.length > 0 ? 'attention' : 'muted',
            },
        ],
        [
            trialSeriesPlural,
            todayScheduled.length,
            weekScheduled.length,
            followUps.length,
            pendingTasks.length,
            followupTemperatureCounts.cooling,
            followupTemperatureCounts.critical,
        ]
    );

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
                setFollowupContactAtByLead((prev) => ({ ...prev, [leadId]: nowIso }));
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

    const renderTodayCard = (lead) => {
        const busyAttended = Boolean(savingPresence[`${lead.id}:attended`]);
        const busyMissed = Boolean(savingPresence[`${lead.id}:missed`]);
        const attendedSelected = lead?.status === LEAD_STATUS.COMPLETED;
        const missedSelected = lead?.status === LEAD_STATUS.MISSED;
        const showPresence = !attendedSelected && !missedSelected;

        return (
            <article key={lead.id} className="dashboard-today-card">
                <button
                    type="button"
                    className="dashboard-today-card__main"
                    onClick={() =>
                        navigate(`/lead/${lead.id}`, { state: { from: LEAD_PROFILE_FROM_DASHBOARD } })
                    }
                >
                    <span className="dashboard-today-card__time">
                        {lead.scheduledTime && String(lead.scheduledTime).trim()
                            ? lead.scheduledTime
                            : 'Horário a definir'}
                    </span>
                    <span className="dashboard-today-card__name">{lead.name}</span>
                    {lead.type ? <span className="dashboard-today-card__meta">{lead.type}</span> : null}
                </button>
                {showPresence ? (
                    <div className="dashboard-today-card__actions">
                        <button
                            type="button"
                            className="dashboard-today-card__btn dashboard-today-card__btn--attended"
                            disabled={busyAttended || busyMissed}
                            onClick={() => void markLeadAttended(lead)}
                        >
                            {busyAttended ? 'Salvando…' : attendedButtonLabel(vertical)}
                        </button>
                        <button
                            type="button"
                            className="dashboard-today-card__btn dashboard-today-card__btn--missed"
                            disabled={busyAttended || busyMissed}
                            onClick={() => void markLeadMissed(lead)}
                        >
                            {busyMissed ? 'Salvando…' : missedButtonLabel()}
                        </button>
                    </div>
                ) : (
                    <div className="dashboard-today-card__status">
                        {attendedSelected
                            ? attendedStatusLabel(vertical)
                            : missedSelected
                              ? missedStatusLabel()
                              : null}
                    </div>
                )}
            </article>
        );
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
                        <p className="fu-next-action text-small">
                            Próxima ação: <span>{lead.nextActionLabel}</span>
                            {lead.phone ? (
                                <>
                                    {' '}
                                    ·{' '}
                                    <Link className="fu-inbox-link" to={`/inbox?phone=${encodeURIComponent(lead.phone)}`}>
                                        Abrir conversa
                                    </Link>
                                </>
                            ) : null}
                        </p>
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
                        showTemplateHint
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
                <div className="dashboard-day-hero__main">
                    <p className="dashboard-day-hero__date">{loading ? 'Carregando…' : heroDateLine}</p>
                    {!loading && heroAcademyLine ? (
                        <p className="dashboard-day-hero__academy">{heroAcademyLine}</p>
                    ) : null}
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
                        onScrollToSection={scrollToBirthdaysSection}
                    />
                ) : null}
                <div className="dashboard-day-hero__stats" role="list">
                    {loading ? (
                        <SkeletonCard variant="kpi" count={4} className="dashboard-day-hero__skeletons" />
                    ) : (
                        heroStats.map((stat) => (
                            <button
                                key={stat.key}
                                type="button"
                                role="listitem"
                                className={`dashboard-day-stat dashboard-day-stat--${stat.tone}${
                                    dayPriority.highlightKpi === stat.key
                                        ? ' dashboard-day-stat--highlight'
                                        : ''
                                }`}
                                onClick={() => handleKpiClick(stat.key)}
                            >
                                <span className="dashboard-day-stat__count">{stat.count}</span>
                                <span className="dashboard-day-stat__label">{stat.label}</span>
                                {stat.sub ? (
                                    <span className="dashboard-day-stat__sub">{stat.sub}</span>
                                ) : null}
                            </button>
                        ))
                    )}
                </div>
            </section>

            {!loading && !isZeroState ? (
                <FollowupHealthPanel summary={followupHealthSummary} />
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

            <div className={`agenda-page-stack${isDashboardMobile ? ' agenda-page-stack--mobile-tabs' : ''}`}>
            {!isZeroState && isDashboardMobile ? (
                <HubTabBar
                    tabs={mobileAgendaTabs}
                    activeId={mobileAgendaTab}
                    onChange={handleMobileAgendaTabChange}
                    ariaLabel="Agenda"
                    className="dashboard-mobile-agenda-tabs"
                    variant="secondary"
                    fullWidth
                />
            ) : null}

            {showTodayAgendaPanel ? (
                <section
                    ref={todaySectionRef}
                    className="animate-in dashboard-today-section reception-section"
                    style={{ animationDelay: '0.1s' }}
                >
                    <ReportSectionHeading
                        className="reception-report-heading dashboard-today-section__heading"
                        title={
                            <>
                                <Calendar size={18} color="var(--color-primary)" strokeWidth={2} aria-hidden />
                                {`${trialSeriesPlural} hoje`}
                            </>
                        }
                        action={
                            todayScheduled.length > 0 ? (
                                <span className="badge reception-week-count-badge">{todayScheduled.length}</span>
                            ) : null
                        }
                    />
                    {todayPeriodGroups.length > 0 ? (
                        <div className="dashboard-today-periods">
                            {todayPeriodGroups.map((group) => (
                                <div key={group.key} className="dashboard-today-period">
                                    <div className="dashboard-today-period__head">
                                        <span className="dashboard-today-period__label">{group.label}</span>
                                        <span className="dashboard-today-period__line" aria-hidden />
                                    </div>
                                    <div className="dashboard-today-cards">
                                        {group.items.map((lead) => renderTodayCard(lead))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <EmptyState
                            variant="compact"
                            tone="dashed"
                            icon={Calendar}
                            title={emptyTodayTitle(vertical, terms.trialShort)}
                            role="status"
                        />
                    )}
                </section>
            ) : null}

            {showWeekAgendaPanel ? (
            <section
                ref={weekSectionRef}
                className="animate-in agenda-week-section reception-section reception-week-panel reception-week-panel--secondary"
                style={{ animationDelay: '0.15s' }}
            >
                <div className="reception-week-panel__head">
                    <div className="reception-week-panel__title-row">
                        <ReportSectionHeading
                            className="reception-report-heading reception-week-panel__title"
                            title={
                                <>
                                    <Calendar size={18} color="var(--color-primary)" strokeWidth={2} aria-hidden />
                                    {weekSectionTitle}
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
            ) : null}

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
                {followUps.length > 0 ? <FollowupTemperatureLegend /> : null}
                <div className="fu-list-card">
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
                                <p className="fu-list-empty__streak">{followupStreakMessage(followupStreak)}</p>
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
                    <p className="fu-kanban-more mt-2">
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
                        <span className="fu-kanban-more-hint"> — há mais de {FOLLOWUP_AGENDA_MAX_DAYS} dias</span>
                    </p>
                )}
                </div>
            </section>

            <section
                id="birthdays"
                ref={birthdaysSectionRef}
                className="animate-in agenda-birthdays-section reception-section"
                style={{ animationDelay: '0.22s' }}
            >
                <div className="reception-section-head agenda-birthdays-section__head">
                    <div className="agenda-birthdays-section__title-row flex items-center gap-2 flex-wrap min-w-0">
                        <ReportSectionHeading
                            className="reception-report-heading"
                            title={
                                <>
                                    <Cake size={18} color="var(--color-warning)" strokeWidth={2} aria-hidden /> Aniversariantes hoje
                                </>
                            }
                        />
                        <span className="badge badge-secondary reception-section-badge">{todayBirthdays.length}</span>
                    </div>
                </div>
                <div className="agenda-birthdays-section__body">
                    <div
                        className={`bd-list-card${
                            todayBirthdays.length > 0 ? ' bd-list-card--celebrate' : ''
                        }`}
                    >
                        {studentsLoading && students.length === 0 ? (
                            <div className="bd-list-loading" aria-busy="true">
                                <SkeletonCard variant="list-row" count={2} />
                            </div>
                        ) : todayBirthdays.length > 0 ? (
                            todayBirthdays.map((student, i) => {
                                const turma =
                                    String(student.turma || student.className || '').trim() || '—';
                                const studentId = String(student.id || '').trim();
                                const hasPhone = Boolean(String(student.phone || '').trim());
                                const waBusy = sendingBirthdayWa === studentId;
                                const canBirthdayWa = Boolean(
                                    String(academyWa.zapster_instance_id || '').trim() && hasPhone
                                );
                                return (
                                    <div
                                        key={student.id}
                                        className={`bd-row animate-in${
                                            i === todayBirthdays.length - 1 ? ' bd-row--last' : ''
                                        }`}
                                        style={{ animationDelay: `${0.04 * i}s` }}
                                    >
                                        <button
                                            type="button"
                                            className="bd-info bd-info--btn"
                                            onClick={() => navigate(`/student/${student.id}`)}
                                        >
                                            <div className="bd-name">{student.name}</div>
                                            <div className="bd-sub">
                                                <span className="bd-meta-label">Turma</span>
                                                <span className="bd-meta-sep" aria-hidden>
                                                    ·
                                                </span>
                                                <span className="bd-meta-value">{turma}</span>
                                            </div>
                                        </button>
                                        <button
                                            type="button"
                                            className="bd-row__wa-btn"
                                            disabled={!canBirthdayWa || waBusy}
                                            title={
                                                !hasPhone
                                                    ? 'Sem telefone cadastrado'
                                                    : !String(academyWa.zapster_instance_id || '').trim()
                                                      ? 'WhatsApp não configurado'
                                                      : 'Mandar parabéns'
                                            }
                                            aria-label="Mandar parabéns por WhatsApp"
                                            onClick={(e) => void handleBirthdayWhatsApp(student, e)}
                                        >
                                            {waBusy ? (
                                                <Loader2 size={14} className="spin-refresh" aria-hidden />
                                            ) : (
                                                <MessageCircle size={14} aria-hidden />
                                            )}
                                            <span className="bd-row__wa-label">Parabéns</span>
                                        </button>
                                    </div>
                                );
                            })
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
</div>
        </div>
    );
};

export default Dashboard;
