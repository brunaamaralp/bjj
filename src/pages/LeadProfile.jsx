import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { addLeadEvent, getLeadEvents, updateLeadEvent } from '../lib/leadEvents.js';
import { useParams, useNavigate, useLocation, Link, useSearchParams } from 'react-router-dom';
import { useLeadStore, LEAD_STATUS, LEAD_ORIGIN, selectLeadById } from '../store/useLeadStore';
import { useStudentStore } from '../store/useStudentStore';
import { useTaskStore, filterTasksForLead, leadProfileTaskFilters } from '../store/useTaskStore';
import { progressLabelForLead } from '../lib/taskTemplates.js';
import { useToast } from '../hooks/useToast';
import { ArrowLeft, ChevronDown, Calendar, UserCheck, Phone, Send, Clock, Copy, Check, Pencil, X, Save, AlertTriangle, Trash2, StickyNote, Pin, Baby, Users, Dumbbell, CheckSquare, BadgeCheck } from 'lucide-react';
import { canShowLeadCloseSale } from '../lib/leadCloseSale.js';
import { databases, DB_ID, ACADEMIES_COL } from '../lib/appwrite';
import { DEFAULT_WHATSAPP_TEMPLATES, WHATSAPP_TEMPLATE_LABELS } from '../../lib/whatsappTemplateDefaults.js';
import { useWhatsappTemplates } from '../lib/useWhatsappTemplates.js';
import { sendWhatsappTemplateOutbound } from '../lib/outboundWhatsappTemplate.js';
import { LostReasonModal } from '../components/LostReasonModal';
import ConfirmDialog from '../components/shared/ConfirmDialog.jsx';
const MatriculaModal = lazy(() => import('../components/MatriculaModal'));
const CreateContractModal = lazy(() => import('../components/contracts/CreateContractModal.jsx'));
import { performEnrollment } from '../lib/performEnrollment.js';
import { useNlPageContext } from '../hooks/useNlPageContext.js';
import { getStudentPayments } from '../lib/studentPayments';
import { LEAD_TIMELINE_CHANGED, emitLeadTimelineChanged } from '../lib/leadTimelineEvents.js';
import { PIPELINE_WAITING_DECISION_STAGE, PIPELINE_STAGES } from '../constants/pipeline.js';
import { LEAD_PROFILE_QUICK_NOTE_CHIPS } from '../lib/leadProfileQuickNotes.js';
import { maskPhone } from '../lib/masks.js';
import SexoSelect from '../components/shared/SexoSelect.jsx';
import TurmaSelect from '../components/shared/TurmaSelect.jsx';
import { useAcademyTurmas } from '../hooks/useAcademyTurmas.js';
import { resolveTurmaFormState, turmaValueFromForm } from '../lib/academyTurmas.js';
import { sexoDisplayLabel } from '../lib/leadSexo.js';
const ScheduleModal = lazy(() => import('../components/ScheduleModal.jsx'));
import { DateInputField } from '../components/DateInput';
import { getAcademyQuickTimeChipValues } from '../lib/academyQuickTimes.js';
import { buildSchedulePatch } from '../lib/scheduleHelpers.js';
import { parseAutomationsConfig } from '../lib/useAutomations.js';
import {
    afterExperimentalScheduled,
    afterPresenceConfirmed,
    afterMissed,
} from '../lib/automationDispatch.js';
import {
    notifyAutomationFeedback,
    safeAutomationDispatch,
    formatWhatsappTemplateSentTimeline,
    getLeadAutomationBadges,
} from '../lib/automationUx.js';
import { normalizeLeadProfileType } from '../../lib/leadTypeNormalize.js';
import LeadProfileTimelineEventsList from '../components/leadProfile/LeadProfileTimelineEventsList.jsx';
import { getPipelineStageColor } from '../lib/pipelineStageColors.js';
import {
    LEAD_PROFILE_FROM_DASHBOARD,
    LEAD_PROFILE_FROM_PIPELINE,
} from '../lib/pipelineSessionState.js';
import NaviChatWidgetPanel from '../components/chat-widget/NaviChatWidgetPanel.jsx';
import {
  useTerms,
  contactLabelSingular,
  operationalStatusDisplayLabel,
  pipelineStageDisplayLabel,
} from '../lib/terminology.js';
import EmptyState from '../components/shared/EmptyState.jsx';
import StageBadge from '../components/shared/StageBadge.jsx';
import ReportSectionHeading from '../components/reports/shared/ReportSectionHeading.jsx';
import SkeletonCard from '../components/shared/SkeletonCard.jsx';
import TaskCard from '../components/shared/TaskCard.jsx';
import FieldError from '../components/shared/FieldError.jsx';
import StatusBanner from '../components/shared/StatusBanner.jsx';
import {
    leadCardGuardianSubtitle,
    leadProfileNameFieldLabel,
    leadProfileNeedsGuardianHint,
} from '../lib/leadDisplayName.js';
import ErrorBanner from '../components/shared/ErrorBanner.jsx';
import ProfileWhatsAppOfflineBanner from '../components/profile/ProfileWhatsAppOfflineBanner.jsx';
import ProfileMobileQuickActions from '../components/profile/ProfileMobileQuickActions.jsx';
import ProfileInlineField from '../components/profile/ProfileInlineField.jsx';
import { useZapsterWhatsAppConnection } from '../hooks/useZapsterWhatsAppConnection.js';
import { isWhatsAppIntegrationDisconnected } from '../lib/whatsappIntegrationState.js';
import {
    leadHistoryFilterFromUrlParam,
    leadHistoryFilterToUrlParam,
} from '../lib/leadProfileUrlState.js';
import { buildCustomAnswersPatch } from '../lib/customLeadQuestions.js';
import CustomLeadQuestionFields from '../components/CustomLeadQuestionFields.jsx';
import '../styles/lead-profile.css';
import '../styles/profile-shared.css';
import '../styles/followup-shared.css';
import { useFollowupEventsByLead } from '../hooks/useFollowupEventsByLead.js';
import { computeFollowupState, describePlaybookStep, isFollowUpLead } from '../lib/followupState.js';
import { useFollowupOutcome } from '../hooks/useFollowupOutcome.js';
import { useCanEditProfile } from '../lib/profilePermissions.js';
import { friendlyError } from '../lib/errorMessages.js';
import { saveLeadProfileField } from '../lib/profileLeadFieldSave.js';
import { readFollowupPlaybook } from '../lib/followupPlaybookDefaults.js';
import { FOLLOWUP_OUTCOMES } from '../lib/followupOutcomes.js';
import { patchFollowupContactCache } from '../lib/followupEventsCache.js';
import LeadFollowupBand from '../components/followup/LeadFollowupBand.jsx';
import FollowupOutcomeDialog from '../components/followup/FollowupOutcomeDialog.jsx';

function hasLeadDisplayValue(val) {
    const s = String(val ?? '').trim();
    return Boolean(s) && s !== '-';
}

/** Texto do empty state da timeline conforme filtro ativo. */
function getTimelineEmptyState(filter, hasAnyEvents) {
    const filteredOnly = hasAnyEvents;
    switch (filter) {
        case 'conversation':
            return {
                title: filteredOnly
                    ? 'Nenhum momento da conversa neste filtro'
                    : 'A IA ainda não registrou momentos desta conversa',
                description:
                    'Dados compartilhados, interesse e atualizações de cadastro detectados no WhatsApp aparecem aqui.',
            };
        case 'message':
            return {
                title: filteredOnly ? 'Nenhuma mensagem neste filtro' : 'Nenhuma mensagem registrada',
                description: null,
            };
        case 'note':
            return {
                title: filteredOnly ? 'Nenhuma nota neste filtro' : 'Nenhuma nota registrada',
                description: null,
            };
        case 'schedule':
            return {
                title: filteredOnly ? 'Nenhum agendamento neste filtro' : 'Nenhum agendamento registrado',
                description: null,
            };
        case 'stage_change':
            return {
                title: filteredOnly ? 'Nenhuma mudança neste filtro' : 'Nenhuma mudança de etapa registrada',
                description: null,
            };
        default:
            return {
                title: 'Nenhum evento registrado',
                description: null,
            };
    }
}

function expectedPipelineStageForStatus(status) {
    switch (status) {
        case LEAD_STATUS.SCHEDULED:
            return 'Aula experimental';
        case LEAD_STATUS.COMPLETED:
            return PIPELINE_WAITING_DECISION_STAGE;
        case LEAD_STATUS.CONVERTED:
            return 'Matriculado';
        case LEAD_STATUS.MISSED:
            return LEAD_STATUS.MISSED;
        case LEAD_STATUS.LOST:
            return LEAD_STATUS.LOST;
        default:
            return null;
    }
}

const STATUS_CONFIG = {
    [LEAD_STATUS.NEW]: { bg: 'var(--color-accent-surface)', color: 'var(--color-accent)' },
    [LEAD_STATUS.SCHEDULED]: { bg: 'var(--color-warning-surface)', color: 'var(--color-warning)' },
    [LEAD_STATUS.COMPLETED]: { bg: 'var(--color-success-surface)', color: 'var(--color-success)' },
    [LEAD_STATUS.MISSED]: { bg: 'var(--color-danger-surface)', color: 'var(--color-danger)' },
    [LEAD_STATUS.CONVERTED]: { bg: 'rgba(228, 181, 93, 0.12)', color: 'var(--dourado)' },
    [LEAD_STATUS.LOST]: { bg: 'var(--color-background-secondary, var(--surface-hover))', color: 'var(--color-text-secondary)' },
};

/** Rótulo curto na faixa da timeline (tipo do evento na UI). */
const TIMELINE_EVENT_LABELS = {
    message: 'Mensagem enviada',
    call: 'Ligação',
    schedule: 'Agendamento',
    stage_change: 'Mudança de etapa',
    pipeline_change: 'Movido no funil',
    note: 'Nota',
    lead_created: 'Cadastro',
    task_created: 'Tarefa criada',
    task_done: 'Tarefa concluída',
    import: 'Importação',
    attended: 'Compareceu à aula',
    missed: 'Não compareceu',
    converted: 'Matriculado',
    lost: 'Perda',
    venda: 'Venda registrada',
    followup_done: 'Retorno concluído',
    followup_contact: 'Contato de retorno',
    followup_snooze: 'Retorno adiado',
    inbox_note: 'Nota Inbox',
    whatsapp: 'WhatsApp',
    whatsapp_template_sent: 'WhatsApp automático',
    conversation_highlight: 'Conversa WhatsApp',
    lead_updated: 'Cadastro atualizado',
    student_updated: 'Cadastro atualizado',
    profile_field_updated: 'Cadastro atualizado',
    attendance: 'Presença na catraca',
    attendance_denied: 'Entrada bloqueada',
    manual_release: 'Liberação manual',
};

const ENGLISH_STATUS_TOKEN_LABELS = {
    NEW: 'Novo',
    SCHEDULED: 'Agendado',
    COMPLETED: 'Compareceu',
    MISSED: 'Não compareceu',
    CONVERTED: 'Matriculado',
    LOST: 'Não fechou',
    STAGE_CHANGE: 'Mudança de etapa',
    PIPELINE_CHANGE: 'Movido no funil',
};

function humanizeTimelineStage(value, stages = [], terms) {
    const t = String(value || '').trim();
    if (!t) return '—';

    const dynamic = (stages || []).find((s) => String(s?.id || '') === t || String(s?.label || '') === t);
    if (dynamic?.label) return String(dynamic.label);

    if (STATUS_CONFIG[t]) return operationalStatusDisplayLabel(terms, t);

    const fixedPipeline = PIPELINE_STAGES.find((s) => s === t);
    if (fixedPipeline) return pipelineStageDisplayLabel(terms, t);

    const upper = t.toUpperCase().replace(/\s+/g, '_');
    if (ENGLISH_STATUS_TOKEN_LABELS[upper]) {
        if (upper === 'CONVERTED' && terms) return terms.convertedStatusUi;
        return ENGLISH_STATUS_TOKEN_LABELS[upper];
    }

    return t.replace(/_/g, ' ');
}

const TYPE_ICONS = {
    'Criança': <Baby size={18} />,
    'Juniores': <Users size={18} />,
    'Adulto': <Dumbbell size={18} />,
};

function showLeadProfileScheduleEditSection(status) {
    return status !== LEAD_STATUS.CONVERTED && status !== LEAD_STATUS.LOST;
}

function readInitialPanelOpen() {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(min-width: 1024px)').matches;
}

const LeadProfile = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const profileFrom = location.state?.from;
    const lead = useLeadStore((s) => selectLeadById(s, id));
    const loading = useLeadStore((s) => s.loading);
    const fetchLeadById = useLeadStore((s) => s.fetchLeadById);
    const studentsLoading = useStudentStore((s) => s.loading);
    const [profileResolving, setProfileResolving] = useState(false);

    useEffect(() => {
        if (!id) return undefined;
        if (selectLeadById(useLeadStore.getState(), id)) {
            setProfileResolving(false);
            return undefined;
        }
        let cancelled = false;
        setProfileResolving(true);
        void fetchLeadById(id).finally(() => {
            if (!cancelled) setProfileResolving(false);
        });
        return () => {
            cancelled = true;
        };
    }, [id, fetchLeadById]);

    useEffect(() => {
        if (profileResolving || loading || studentsLoading || lead) return;
        const student = useStudentStore.getState().getStudentById(id);
        if (student) {
            navigate(`/student/${id}`, { replace: true });
            return;
        }
        let cancelled = false;
        void useStudentStore.getState().fetchStudentById(id).then((s) => {
            if (!cancelled && s) navigate(`/student/${id}`, { replace: true });
        });
        return () => {
            cancelled = true;
        };
    }, [profileResolving, loading, studentsLoading, lead, id, navigate]);
    const updateLead = useLeadStore((s) => s.updateLead);
    const deleteLead = useLeadStore((s) => s.deleteLead);
    const toast = useToast();
    const academyId = useLeadStore((s) => s.academyId);
    const financeConfig = useLeadStore((s) => s.financeConfig);
    const modules = useLeadStore((s) => s.modules);

    const { waStatus, waStatusChecked } = useZapsterWhatsAppConnection(academyId, {
        statusPollWhileMounted: true,
        watchAcademyStatus: true,
    });
    const waOfflineUi = isWhatsAppIntegrationDisconnected(waStatus, waStatusChecked);

    const { turmas: academyTurmas } = useAcademyTurmas(academyId);
    const userId = useLeadStore((s) => s.userId);
    const academyList = useLeadStore((s) => s.academyList);
    const terms = useTerms();
    const labels = useLeadStore((s) => s.labels);
    const contactLabel = useMemo(() => contactLabelSingular(labels), [labels]);
    const pipelineLabel = labels?.pipeline || 'Funil';

    const profileBreadcrumb = useMemo(() => {
        if (profileFrom === LEAD_PROFILE_FROM_DASHBOARD) {
            return { parentLabel: 'Recepção', parentTo: '/', restorePipeline: false };
        }
        if (profileFrom === LEAD_PROFILE_FROM_PIPELINE) {
            return { parentLabel: pipelineLabel, parentTo: '/pipeline', restorePipeline: true };
        }
        return null;
    }, [profileFrom, pipelineLabel]);

    const handleProfileBack = useCallback(() => {
        if (profileFrom === LEAD_PROFILE_FROM_DASHBOARD) {
            navigate('/');
            return;
        }
        if (profileFrom === LEAD_PROFILE_FROM_PIPELINE) {
            navigate('/pipeline', { state: { fresh: false } });
            return;
        }
        navigate(-1);
    }, [navigate, profileFrom]);

    const permCtx = useMemo(() => {
        const acad = (academyList || []).find((a) => a.id === academyId) || {};
        return { ownerId: acad.ownerId, teamId: acad.teamId, userId: userId || '' };
    }, [academyList, academyId, userId]);

    const academyDocForRole = useMemo(
        () => (academyList || []).find((a) => a.id === academyId) || null,
        [academyList, academyId]
    );
    const canEditProfile = useCanEditProfile(academyDocForRole);
    const stages = useMemo(() => {
        const patchTrial = (rows) =>
            (rows || []).map((s) =>
                String(s?.id || '').trim() === 'Aula experimental' ? { ...s, label: terms.trial } : s
            );
        const fixed = patchTrial(PIPELINE_STAGES.map((stage) => ({ id: stage, label: stage })));
        const acad = (academyList || []).find((a) => a.id === academyId) || {};
        let conf = acad?.stagesConfig;
        if (!conf) return fixed;
        try {
            if (typeof conf === 'string') conf = JSON.parse(conf);
            if (!Array.isArray(conf)) return fixed;
            const normalized = conf
                .filter(Boolean)
                .map((s) => {
                    if (typeof s === 'string') return { id: String(s).trim(), label: String(s).trim() };
                    const id = String(s?.id || '').trim();
                    const label = String(s?.label || s?.id || '').trim();
                    return id ? { id, label: label || id } : null;
                })
                .filter(Boolean);
            return normalized.length > 0 ? patchTrial(normalized) : fixed;
        } catch {
            return fixed;
        }
    }, [academyList, academyId, terms.trial]);

    const pipelineStageBadge = useMemo(() => {
        if (!lead) return null;
        const stageId = String(lead.pipelineStage || lead.stage || '').trim();
        if (!stageId) return null;
        const stageIdx = stages.findIndex((s) => String(s?.id || '').trim() === stageId);
        const color = getPipelineStageColor(stageId, stageIdx >= 0 ? stageIdx : 0);
        const dynamic = stages.find((s) => String(s?.id || '').trim() === stageId);
        const label = dynamic?.label || pipelineStageDisplayLabel(terms, stageId);
        return { stageId, label, color };
    }, [lead, stages, terms]);

    const followupPlaybook = useMemo(() => {
        const acad = (academyList || []).find((a) => a.id === academyId) || {};
        return readFollowupPlaybook(acad.settings);
    }, [academyList, academyId]);
    const {
        followupDoneByLead,
        followupContactByLead,
        followupSnoozeUntilByLead,
        inboundAfterByLead,
        inboundAfterByPhone,
    } = useFollowupEventsByLead(academyId);
    const followupState = useMemo(() => {
        if (!lead || !isFollowUpLead(lead)) return null;
        const state = computeFollowupState(lead, {
            playbook: followupPlaybook,
            followupDoneByLead,
            followupContactByLead,
            followupSnoozeUntilByLead,
            inboundAfterByLead,
            inboundAfterByPhone,
        });
        if (!state) return null;
        return {
            ...state,
            nextActionLabel: describePlaybookStep(state.nextStep),
        };
    }, [
        lead,
        followupPlaybook,
        followupDoneByLead,
        followupContactByLead,
        followupSnoozeUntilByLead,
        inboundAfterByLead,
        inboundAfterByPhone,
    ]);
    const showFollowupBand =
        followupState &&
        !followupState.doneForCurrentClass &&
        !followupState.isSnoozed &&
        followupState.temperature !== 'on_track';
    const {
        outcomeLead: followupOutcomeLead,
        saving: savingFollowupOutcome,
        openOutcome: openFollowupOutcome,
        closeOutcome: closeFollowupOutcome,
        confirmOutcome: confirmFollowupOutcome,
    } = useFollowupOutcome({
        source: 'lead_profile',
        navigateOnOutcome: false,
        onSuccess: (_lead, outcome) => {
            if (outcome === FOLLOWUP_OUTCOMES.ENROLLED) setMatriculaModalOpen(true);
            else if (outcome === FOLLOWUP_OUTCOMES.RESCHEDULE) setScheduleModalOpen(true);
        },
    });

    const [studentPayments, setStudentPayments] = useState([]);
    const storeTasks = useTaskStore((s) => s.tasks);
    const fetchTasks = useTaskStore((s) => s.fetchTasks);
    const patchTaskLocal = useTaskStore((s) => s.patchTaskLocal);
    const updateTask = useTaskStore((s) => s.updateTask);
    const isUpdatingLeadTask = useTaskStore((s) => s.isUpdating);
    const leadTasks = useMemo(
        () => filterTasksForLead(storeTasks, id),
        [storeTasks, id]
    );
    const leadTaskProgress = useMemo(() => progressLabelForLead(id, leadTasks), [id, leadTasks]);

    useEffect(() => {
        if (!id || !academyId) return undefined;
        void fetchTasks(academyId, {
            reset: true,
            filters: leadProfileTaskFilters(id),
        });
    }, [id, academyId, fetchTasks]);

    useEffect(() => {
        if (!id || !academyId) return undefined;
        const onVis = () => {
            if (document.visibilityState !== 'visible') return;
            void fetchTasks(academyId, {
                silent: true,
                filters: leadProfileTaskFilters(id),
            });
        };
        document.addEventListener('visibilitychange', onVis);
        return () => document.removeEventListener('visibilitychange', onVis);
    }, [id, academyId, fetchTasks]);

    const toggleLeadTask = async (t) => {
        const newStatus = t.status === 'done' ? 'pending' : 'done';
        const previousStatus = t.status;
        patchTaskLocal(t.id, { status: newStatus });
        try {
            await updateTask(t.id, { status: newStatus });
        } catch {
            patchTaskLocal(t.id, { status: previousStatus });
            toast.show({ type: 'error', message: 'Erro ao atualizar tarefa' });
        }
    };

    useEffect(() => {
        if (!id || !academyId || !lead) {
            setStudentPayments([]);
            return;
        }
        const isStudent =
            lead.status === LEAD_STATUS.CONVERTED || String(lead.contact_type || '').trim() === 'student';
        if (!isStudent) {
            setStudentPayments([]);
            return;
        }
        let cancelled = false;
        getStudentPayments(id, academyId)
            .then((docs) => {
                if (!cancelled) setStudentPayments(Array.isArray(docs) ? docs : []);
            })
            .catch(() => {
                if (!cancelled) setStudentPayments([]);
            });
        return () => {
            cancelled = true;
        };
    }, [id, academyId, lead]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        function onPaymentUpdated() {
            if (!id || !academyId || !lead) return;
            const isStudent =
                lead.status === LEAD_STATUS.CONVERTED || String(lead.contact_type || '').trim() === 'student';
            if (!isStudent) return;
            getStudentPayments(id, academyId).then(setStudentPayments).catch(() => {});
        }
        window.addEventListener('navi-student-payment-updated', onPaymentUpdated);
        return () => window.removeEventListener('navi-student-payment-updated', onPaymentUpdated);
    }, [id, academyId, lead]);

    const recentPaymentsForNl = useMemo(() => {
        if (!lead) return [];
        const nm = String(lead.name || '').trim();
        return (studentPayments || [])
            .filter((p) => String(p.status || '').toLowerCase() !== 'cancelled')
            .map((p) => {
                const lid = String(p.lead_id || '').trim();
                return {
                    id: p.$id,
                    lead_id: lid,
                    student_id: lid,
                    student_name: nm,
                    reference_month: String(p.reference_month || '').trim(),
                    amount: Number(p.amount),
                    status: String(p.status || ''),
                    method: String(p.method || ''),
                    note: String(p.note || ''),
                    plan_name: String(p.plan_name || ''),
                    account: String(p.account || '')
                };
            });
    }, [studentPayments, lead]);

    const nlPageCtx = useMemo(
        () => ({
            context: 'perfil',
            pipelineStages: stages,
            recentPayments: recentPaymentsForNl,
        }),
        [stages, recentPaymentsForNl]
    );
    useNlPageContext(nlPageCtx);

    const [timelineEvents, setTimelineEvents] = useState([]);
    const [timelineError, setTimelineError] = useState(false);
    const [confirmModal, setConfirmModal] = useState(null);
    const [confirmBusy, setConfirmBusy] = useState(false);
    const [updatingStatus, setUpdatingStatus] = useState(false);
    const [saving, setSaving] = useState(false);
    const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
    const [addingNote, setAddingNote] = useState(false);
    const [activeProfileTab, setActiveProfileTab] = useState('conversation');
    const [panelOpen, setPanelOpen] = useState(readInitialPanelOpen);
    const [viewportStacked, setViewportStacked] = useState(
        () => typeof window !== 'undefined' && window.innerWidth < 1024
    );
    const stackedLayout = viewportStacked;
    const [conversationUnreadCount, setConversationUnreadCount] = useState(0);
    const [phoneCopied, setPhoneCopied] = useState(false);
    const [formErrors, setFormErrors] = useState({});
    const [editBaseline, setEditBaseline] = useState(null);
    const phoneEditInputRef = useRef(null);
    const startEditRef = useRef(null);

    const mapLeadEventDocToUi = useCallback((d) => {
        const at = d.at;
        const base = { at, from: d.from, to: d.to, text: d.text || '' };
        let payload = {};
        try {
            if (d.payload_json) payload = JSON.parse(d.payload_json);
        } catch {
            payload = {};
        }
        const t = d.type;
        if (t === 'schedule') {
            return {
                type: 'schedule',
                date: payload.date || d.to || '',
                time: payload.time || '',
                at,
                text: d.text || ''
            };
        }
        if (t === 'whatsapp') {
            return {
                type: 'message',
                channel: 'whatsapp',
                text: d.text || 'WhatsApp',
                at,
                meta: payload
            };
        }
        if (t === 'attended') return { type: 'stage_change', from: d.from, to: LEAD_STATUS.COMPLETED, at, text: d.text };
        if (t === 'missed') return { type: 'stage_change', from: d.from, to: LEAD_STATUS.MISSED, at, text: d.text };
        if (t === 'converted') return { type: 'stage_change', from: d.from, to: LEAD_STATUS.CONVERTED, at, text: d.text };
        if (t === 'lost') return { type: 'stage_change', from: d.from, to: LEAD_STATUS.LOST, at, text: d.text };
        if (t === 'lead_criado') return { type: 'lead_created', at, text: d.text || `${contactLabel} cadastrado no CRM` };
        if (t === 'whatsapp_template_sent') {
            return {
                type: 'whatsapp_template_sent',
                at,
                text: formatWhatsappTemplateSentTimeline(d, payload),
                meta: payload,
            };
        }
        return {
            type: t,
            ...base,
            $id: d.$id,
            is_pinned: Boolean(d.is_pinned),
            payload,
        };
    }, [contactLabel]);

    const refreshTimeline = useCallback(async () => {
        if (!id || !academyId) return;
        setTimelineError(false);
        try {
            const res = await getLeadEvents(id, academyId);
            const docs = res.documents || [];
            setTimelineEvents(docs.map(mapLeadEventDocToUi));
        } catch {
            setTimelineError(true);
            setTimelineEvents([]);
        }
    }, [id, academyId, mapLeadEventDocToUi]);

    const [eventTypeFilter, setEventTypeFilter] = useState('all');

    const filteredTimelineEvents = useMemo(
        () =>
            [...(timelineEvents || [])]
                .filter((ev) => {
                    const hiddenTypes = new Set(['ai_history_summary', 'ai_followup_draft']);
                    if (hiddenTypes.has(String(ev?.type || ''))) return false;
                    if (ev?.type === 'pipeline_change' && String(ev?.from || '') === String(ev?.to || '')) {
                        return false;
                    }
                    if (eventTypeFilter === 'all') return true;
                    const t = ev.type || 'note';
                    if (eventTypeFilter === 'note') return t === 'note' || t === 'inbox_note';
                    if (eventTypeFilter === 'conversation') {
                        if (t === 'conversation_highlight') return true;
                        if (t === 'lead_updated' || t === 'student_updated') {
                            return ev.payload?.source === 'whatsapp_ai';
                        }
                        return false;
                    }
                    return t === eventTypeFilter;
                })
                .sort((a, b) => {
                    if (a.is_pinned && !b.is_pinned) return -1;
                    if (!a.is_pinned && b.is_pinned) return 1;
                    const ta = new Date(a.at || a.date || 0).getTime();
                    const tb = new Date(b.at || b.date || 0).getTime();
                    return tb - ta;
                }),
        [timelineEvents, eventTypeFilter]
    );

    const pinnedNotesCount = useMemo(
        () => (timelineEvents || []).filter((e) => e.is_pinned).length,
        [timelineEvents]
    );

    const timelineEmptyState = useMemo(
        () => getTimelineEmptyState(eventTypeFilter, (timelineEvents || []).length > 0),
        [eventTypeFilter, timelineEvents]
    );

    useEffect(() => {
        void refreshTimeline();
    }, [refreshTimeline]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        function onTimelineChanged(e) {
            const evId = String(e?.detail?.leadId || '').trim();
            if (evId && evId === String(id || '').trim()) void refreshTimeline();
        }
        window.addEventListener(LEAD_TIMELINE_CHANGED, onTimelineChanged);
        return () => window.removeEventListener(LEAD_TIMELINE_CHANGED, onTimelineChanged);
    }, [id, refreshTimeline]);

    const [note, setNote] = useState('');
    const [dadosQuickNoteOpen, setDadosQuickNoteOpen] = useState(false);
    const noteTextareaRef = useRef(null);
    const dadosNoteTextareaRef = useRef(null);
    const createTask = useTaskStore((s) => s.createTask);
    const [inlineTaskOpen, setInlineTaskOpen] = useState(false);
    const [inlineTaskTitle, setInlineTaskTitle] = useState('');
    const [inlineTaskDue, setInlineTaskDue] = useState('');
    const [inlineTaskSaving, setInlineTaskSaving] = useState(false);
    const [inlineTaskDiscardOpen, setInlineTaskDiscardOpen] = useState(false);
    const [editing, setEditing] = useState(false);
    const [customQuestions, setCustomQuestions] = useState([]);
    const [deletingLead, setDeletingLead] = useState(false);
    const [lostModalOpen, setLostModalOpen] = useState(false);
    const [matriculaModalOpen, setMatriculaModalOpen] = useState(false);
    const [matriculaInitialStep, setMatriculaInitialStep] = useState('choose');
    const [postMatriculaContractOpen, setPostMatriculaContractOpen] = useState(false);
    const [postMatriculaContractLeadId, setPostMatriculaContractLeadId] = useState(null);
    const [matriculaSubmitting, setMatriculaSubmitting] = useState(false);
    const [academySettingsRaw, setAcademySettingsRaw] = useState(null);
    const [academyAutomationsRaw, setAcademyAutomationsRaw] = useState('');
    const automationConfig = useMemo(
        () => parseAutomationsConfig(academyAutomationsRaw),
        [academyAutomationsRaw]
    );
    const leadAutomationBadges = useMemo(
        () => getLeadAutomationBadges(lead, automationConfig),
        [lead, automationConfig]
    );
    const [waCtx, setWaCtx] = useState({
        name: '',
        zapster: '',
        templates: DEFAULT_WHATSAPP_TEMPLATES
    });
    const {
        templates: waTemplatesHook,
        academyName: waNameHook,
        zapsterInstanceId: waZapHook,
        automationsRaw: waAutoHook,
    } = useWhatsappTemplates(academyId);
    // Alinhado ao menu /inbox: aba sempre visível; estados vazios ficam no painel de chat.
    const showConversationTab = true;

    const profileTabIds = useMemo(() => {
        const ids = [];
        if (showConversationTab) ids.push('conversation');
        ids.push('timeline');
        return ids;
    }, [showConversationTab]);

    useEffect(() => {
        const onResize = () => setViewportStacked(window.innerWidth < 1024);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        const rawTab = String(searchParams.get('tab') || '').trim().toLowerCase();
        const normalizedTab = rawTab === 'dados' ? 'timeline' : rawTab;
        if (normalizedTab) {
            if (!profileTabIds.includes(normalizedTab)) return;
            if (normalizedTab === 'conversation' && !showConversationTab) return;
            setActiveProfileTab(normalizedTab);
        } else if (showConversationTab) {
            setActiveProfileTab('conversation');
        } else {
            setActiveProfileTab('timeline');
        }
        setPanelOpen(true);
        if (rawTab || searchParams.get('history')) {
            setEventTypeFilter(leadHistoryFilterFromUrlParam(searchParams.get('history')));
        }
    }, [searchParams, profileTabIds, showConversationTab]);

    useEffect(() => {
        if (activeProfileTab === 'timeline' || activeProfileTab === 'conversation') {
            setPanelOpen(true);
        }
    }, [activeProfileTab]);

    const setProfileTab = useCallback(
        (tabId) => {
            setActiveProfileTab(tabId);
            setPanelOpen(true);
            setSearchParams(
                (prev) => {
                    const next = new URLSearchParams(prev);
                    if (tabId === 'conversation' || (!showConversationTab && tabId === 'timeline')) {
                        next.delete('tab');
                    } else {
                        next.set('tab', tabId);
                    }
                    return next;
                },
                { replace: true }
            );
        },
        [setSearchParams, showConversationTab]
    );

    const setHistoryFilterWithUrl = useCallback(
        (filterId) => {
            setEventTypeFilter(filterId);
            setSearchParams(
                (prev) => {
                    const next = new URLSearchParams(prev);
                    const urlVal = leadHistoryFilterToUrlParam(filterId);
                    if (urlVal) next.set('history', urlVal);
                    else next.delete('history');
                    return next;
                },
                { replace: true }
            );
        },
        [setSearchParams]
    );

    const handleConversationSummaryChange = useCallback((summary) => {
        const count = Number(summary?.unread_count ?? 0);
        setConversationUnreadCount(Number.isFinite(count) && count > 0 ? count : 0);
    }, []);

    const handleRequestEditPhone = useCallback(() => {
        setPanelOpen(false);
        startEditRef.current?.();
        requestAnimationFrame(() => {
            const el = phoneEditInputRef.current || document.getElementById('lead-profile-edit-phone');
            el?.focus?.();
        });
    }, []);

    const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
    const [profileQuickTimes, setProfileQuickTimes] = useState([]);

    useEffect(() => {
        if (!waTemplatesHook) return;
        setWaCtx({
            name: waNameHook || '',
            zapster: waZapHook || '',
            templates: waTemplatesHook,
        });
        setAcademyAutomationsRaw(String(waAutoHook || ''));
    }, [waTemplatesHook, waNameHook, waZapHook, waAutoHook]);

    useEffect(() => {
        if (!academyId) return undefined;
        let cancelled = false;
        databases
            .getDocument(DB_ID, ACADEMIES_COL, academyId)
            .then((doc) => {
                if (!cancelled) setProfileQuickTimes(getAcademyQuickTimeChipValues(doc));
            })
            .catch(() => {
                if (!cancelled) setProfileQuickTimes(getAcademyQuickTimeChipValues(null));
            });
        return () => {
            cancelled = true;
        };
    }, [academyId]);

    const [form, setForm] = useState({
        name: '',
        phone: '',
        type: 'Adulto',
        origin: '',
        parentName: '',
        age: '',
        birthDate: '',
        isFirstExperience: 'Sim',
        customAnswers: {},
        scheduledDate: '',
        scheduledTime: '',
        plan: '',
        enrollmentDate: '',
        emergencyContact: '',
        emergencyPhone: '',
        sexo: '',
        turmaSelect: '',
        turmaOther: '',
    });

    const createId = () => {
        try {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        } catch { void 0; }
        const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
        return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
    };

    const isUuidLike = (val) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val || '').trim());

    const normalizeQuestions = (input) => {
        let raw = input;
        if (typeof raw === 'string') {
            try { raw = JSON.parse(raw); } catch { raw = []; }
        }
        if (!Array.isArray(raw)) return { questions: [], migrated: false };
        const cleaned = raw.filter(Boolean);
        if (cleaned.length === 0) return { questions: [], migrated: false };

        let migrated = false;
        if (typeof cleaned[0] === 'string') {
            migrated = true;
            const questions = cleaned
                .map((label) => String(label || '').trim())
                .filter(Boolean)
                .map((label) => ({ id: createId(), label, type: 'text' }));
            return { questions, migrated };
        }

        const questions = cleaned.map((q) => {
            const label = String(q?.label || q?.name || '').trim();
            let id = String(q?.id || '').trim();
            const type = String(q?.type || 'text').trim() || 'text';
            const options = Array.isArray(q?.options)
                ? q.options.filter(Boolean).map((s) => String(s).trim()).filter(Boolean)
                : (typeof q?.options === 'string'
                    ? q.options.split(',').map((s) => s.trim()).filter(Boolean)
                    : undefined);
            if (!label) {
                migrated = true;
                return null;
            }
            if (!id) {
                migrated = true;
                id = createId();
            }
            if (q?.label !== label || q?.id !== id || q?.type !== type) migrated = true;
            const base = { id, label, type };
            if (type === 'select') return { ...base, options: options || [] };
            return base;
        }).filter(Boolean);

        return { questions, migrated };
    };

    useEffect(() => {
        if (!academyId) return;
        databases.getDocument(DB_ID, ACADEMIES_COL, academyId)
            .then((doc) => {
                setAcademySettingsRaw(doc.settings ?? null);
                try {
                    const normalized = normalizeQuestions(doc.customLeadQuestions);
                    setCustomQuestions(normalized.questions);
                    if (normalized.migrated) {
                        databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
                            customLeadQuestions: JSON.stringify(normalized.questions)
                        }).catch(() => void 0);
                    }
                } catch {
                    setCustomQuestions([]);
                }
            })
            .catch(() => {
                setCustomQuestions([]);
                setWaCtx({ name: '', zapster: '', templates: DEFAULT_WHATSAPP_TEMPLATES });
            });
    // normalizeQuestions é helper puro; recarrega só quando a academia muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- academy-scoped question load
    }, [academyId]);

    function normalizeDateToISO(dateStr) {
        if (!dateStr) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
            const [day, month, year] = dateStr.split('/');
            return `${year}-${month}-${day}`;
        }
        return '';
    }

    const buildFormStateFromLead = useCallback(
        (src) => {
            const existing = (src.customAnswers && typeof src.customAnswers === 'object') ? src.customAnswers : {};
            const preserved = Object.fromEntries(Object.entries(existing).filter(([k]) => isUuidLike(k)));
            const migratedAnswers = { ...preserved };
            for (const q of (customQuestions || [])) {
                const qid = String(q?.id || '').trim();
                const label = String(q?.label || '').trim();
                if (!qid || !label) continue;
                const value = (existing[qid] ?? existing[label] ?? migratedAnswers[qid] ?? '');
                migratedAnswers[qid] = value;
            }
            const turma = resolveTurmaFormState(src.turma || src.className, academyTurmas);
            return {
                name: src.name || '',
                phone: maskPhone(src.phone || ''),
                type: normalizeLeadProfileType(src.type || 'Adulto') || 'Adulto',
                origin: src.origin || '',
                parentName: src.parentName || '',
                age: src.age || '',
                birthDate: normalizeDateToISO(src.birthDate),
                isFirstExperience: src.isFirstExperience || 'Sim',
                customAnswers: migratedAnswers,
                scheduledDate: src.scheduledDate || '',
                scheduledTime: src.scheduledTime || '',
                plan: src.plan || '',
                enrollmentDate: normalizeDateToISO(src.enrollmentDate),
                emergencyContact: src.emergencyContact || '',
                emergencyPhone: src.emergencyPhone || '',
                sexo: src.sexo || '',
                turmaSelect: turma.selectValue,
                turmaOther: turma.otherText,
            };
        },
        [customQuestions, academyTurmas]
    );

    const validateEditForm = (payload) => {
        const errors = {};
        if (!String(payload.name || '').trim()) errors.name = 'Informe o nome.';
        if (!String(payload.phone || '').trim()) {
            errors.phone = 'Informe o telefone.';
        } else if (String(payload.phone).replace(/\D/g, '').length < 10) {
            errors.phone = 'Telefone inválido — mínimo 10 dígitos.';
        }
        return errors;
    };

    const openMatriculaModal = useCallback(({ paymentShortcut = false } = {}) => {
        setMatriculaInitialStep(paymentShortcut ? 'payment' : 'choose');
        setMatriculaModalOpen(true);
    }, []);

    const handleMatricularClick = useCallback(() => {
        openMatriculaModal();
    }, [openMatriculaModal]);

    const focusNoteField = useCallback((textareaRef = noteTextareaRef) => {
        requestAnimationFrame(() => {
            const el = textareaRef?.current;
            if (!el) return;
            el.focus();
            const len = el.value?.length ?? 0;
            try {
                el.setSelectionRange(len, len);
            } catch {
                /* ignore */
            }
        });
    }, []);

    const applyQuickNoteChip = useCallback(
        (chipText, textareaRef = noteTextareaRef) => {
            setNote((prev) => {
                const trimmed = String(prev || '').trim();
                return trimmed ? `${trimmed} ${chipText}` : chipText;
            });
            focusNoteField(textareaRef);
        },
        [focusNoteField]
    );

    const resetInlineTaskForm = useCallback(() => {
        setInlineTaskTitle('');
        setInlineTaskDue('');
        setInlineTaskOpen(false);
    }, []);

    const inlineTaskHasContent = Boolean(
        String(inlineTaskTitle || '').trim() || String(inlineTaskDue || '').trim()
    );

    const requestCloseInlineTask = useCallback(() => {
        if (inlineTaskHasContent) {
            setInlineTaskDiscardOpen(true);
            return;
        }
        resetInlineTaskForm();
    }, [inlineTaskHasContent, resetInlineTaskForm]);

    const nextActionCtas = useMemo(() => {
        if (!lead) return { primary: null, secondary: [] };

        const showCloseSaleCta = canShowLeadCloseSale(lead);
        const secondary = [];
        let primary = null;

        if (showCloseSaleCta && lead.status === LEAD_STATUS.COMPLETED) {
            primary = {
                key: 'closeSale',
                label: 'Fechar venda',
                icon: BadgeCheck,
                onClick: () => openMatriculaModal({ paymentShortcut: true }),
            };
            if (lead.status !== LEAD_STATUS.CONVERTED) {
                secondary.push({
                    key: 'enroll',
                    label: terms.enrollment,
                    icon: UserCheck,
                    onClick: handleMatricularClick,
                });
            }
        } else if (lead.status !== LEAD_STATUS.CONVERTED) {
            primary = {
                key: 'enroll',
                label: terms.enrollment,
                icon: UserCheck,
                onClick: handleMatricularClick,
            };
            if (showCloseSaleCta) {
                secondary.push({
                    key: 'closeSale',
                    label: 'Fechar venda',
                    icon: BadgeCheck,
                    onClick: () => openMatriculaModal({ paymentShortcut: true }),
                });
            }
        }

        return { primary, secondary };
    }, [lead, terms.enrollment, openMatriculaModal, handleMatricularClick]);

    const saveLeadFieldInline = useCallback(
        async (fieldKey, draftValue) => {
            try {
                await saveLeadProfileField({
                    fieldKey,
                    draftValue,
                    lead,
                    leadId: id,
                    updateLead,
                    academyId,
                    actorUserId: userId || 'user',
                    permissionContext: permCtx,
                });
                await refreshTimeline();
            } catch (e) {
                throw new Error(friendlyError(e, 'save'));
            }
        },
        [lead, id, updateLead, academyId, userId, permCtx, refreshTimeline]
    );

    const conversationTabLabel = useMemo(() => {
        if (waOfflineUi) return 'Conversa (offline)';
        if (conversationUnreadCount > 0) return `Conversa (${conversationUnreadCount})`;
        return 'Conversa';
    }, [waOfflineUi, conversationUnreadCount]);

    const mobilePanelQuickActions = useMemo(() => {
        if (!lead) return [];
        const actions = [];
        if (!lead.scheduledDate && lead.status !== LEAD_STATUS.LOST) {
            actions.push({
                key: 'schedule',
                label: `Agendar ${terms.trialShort}`,
                icon: Calendar,
                onClick: () => setScheduleModalOpen(true),
                disabled: updatingStatus,
            });
        }
        if (nextActionCtas.primary) {
            actions.push({
                key: nextActionCtas.primary.key,
                label: nextActionCtas.primary.label,
                icon: nextActionCtas.primary.icon,
                onClick: nextActionCtas.primary.onClick,
                disabled: updatingStatus,
            });
        }
        for (const cta of nextActionCtas.secondary.slice(0, 2)) {
            actions.push({
                key: cta.key,
                label: cta.label,
                icon: cta.icon,
                onClick: cta.onClick,
                disabled: updatingStatus,
            });
        }
        return actions;
    }, [lead, terms.trialShort, nextActionCtas, updatingStatus]);

    if ((loading || profileResolving) && !lead) {
        return (
            <div className="container lead-profile-loading">
                <div className="lead-profile-inner">
                    <SkeletonCard variant="card" count={1} />
                    <p className="text-small text-light mt-4 lead-profile-loading-text">Carregando perfil…</p>
                </div>
            </div>
        );
    }

    if (!lead) {
        return (
            <div className="container lead-profile-not-found">
                <p className="text-light">{contactLabel} não encontrado.</p>
                <button type="button" className="btn-primary mt-4" onClick={() => navigate('/')}>Voltar</button>
            </div>
        );
    }

    const runConfirmModalAction = async () => {
        if (!confirmModal?.onConfirm || confirmBusy) return;
        setConfirmBusy(true);
        try {
            await confirmModal.onConfirm();
        } finally {
            setConfirmBusy(false);
            setConfirmModal(null);
        }
    };

    const startEdit = () => {
        const next = buildFormStateFromLead(lead);
        setForm(next);
        setEditBaseline(JSON.stringify(next));
        setFormErrors({});
        setEditing(true);
    };
    startEditRef.current = startEdit;

    const cancelEdit = () => {
        if (editBaseline && JSON.stringify(form) !== editBaseline) {
            setConfirmModal({
                title: 'Descartar alterações?',
                description: 'As alterações não salvas serão perdidas.',
                confirmLabel: 'Descartar',
                danger: true,
                onConfirm: async () => {
                    setEditing(false);
                    setEditBaseline(null);
                    setFormErrors({});
                },
            });
            return;
        }
        setEditing(false);
        setEditBaseline(null);
        setFormErrors({});
    };

    const onChange = (e) => {
        const { name, value } = e.target;
        setForm((f) => ({ ...f, [name]: value }));
        if (formErrors[name]) {
            setFormErrors((prev) => {
                const next = { ...prev };
                delete next[name];
                return next;
            });
        }
    };

    const executeSaveLead = async (payload) => {
        const errors = validateEditForm(payload);
        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }
        setSaving(true);
        try {
            const digitsPhone = String(payload.phone || '').replace(/\D/g, '');
            const {
                turmaSelect,
                turmaOther,
                customAnswers: rawCustomAnswers,
                plan: _plan,
                enrollmentDate: _enrollmentDate,
                emergencyContact: _emergencyContact,
                emergencyPhone: _emergencyPhone,
                contact_type: _contactType,
                ...rest
            } = payload;
            const existingCustom =
                lead.customAnswers && typeof lead.customAnswers === 'object' ? lead.customAnswers : {};
            const customAnswers = {
                ...existingCustom,
                ...buildCustomAnswersPatch(customQuestions, rawCustomAnswers),
            };
            await updateLead(
                id,
                {
                    ...rest,
                    phone: digitsPhone,
                    turma: turmaValueFromForm(turmaSelect, turmaOther),
                    sexo: payload.sexo || '',
                    customAnswers,
                },
                { fallbackLead: lead }
            );
            setEditing(false);
            setEditBaseline(null);
            setFormErrors({});
            toast.success('Dados salvos com sucesso.');
            await refreshTimeline();
        } catch (e) {
            toast.error(e, 'save');
        } finally {
            setSaving(false);
        }
    };

    const handleSave = async () => {
        if (saving) return;
        const digits = String(form.phone).replace(/\D/g, '');
        const payload = { ...form, phone: digits };
        const errors = validateEditForm(payload);
        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }
        const hasDate = String(payload.scheduledDate || '').trim().length > 0;
        if (hasDate && lead.status !== LEAD_STATUS.CONVERTED) {
            Object.assign(
                payload,
                buildSchedulePatch(lead, {
                    date: payload.scheduledDate,
                    time: payload.scheduledTime || '',
                })
            );
        }
        if (payload.status === LEAD_STATUS.CONVERTED) {
            payload.contact_type = 'student';
        }
        const afterExp = expectedPipelineStageForStatus(payload.status ?? lead.status);
        const stageAfter = String(payload.pipelineStage ?? lead.pipelineStage ?? '').trim();
        if (afterExp && stageAfter && stageAfter !== afterExp) {
            setConfirmModal({
                title: 'Status e etapa divergem',
                description: `O status (${operationalStatusDisplayLabel(terms, payload.status ?? lead.status)}) costuma ir com a etapa “${pipelineStageDisplayLabel(terms, afterExp)}”, mas a etapa atual é “${pipelineStageDisplayLabel(terms, stageAfter)}”. Isso pode deixar o card na coluna errada no funil. Deseja salvar mesmo assim?`,
                confirmLabel: 'Salvar mesmo assim',
                danger: false,
                onConfirm: async () => {
                    await executeSaveLead(payload);
                },
            });
            return;
        }
        await executeSaveLead(payload);
    };

    const handleUpdateStatus = async (newStatus) => {
        if (updatingStatus) return;
        setUpdatingStatus(true);
        const nowIso = new Date().toISOString();
        const pipelineStage =
            newStatus === LEAD_STATUS.SCHEDULED ? 'Aula experimental'
                : newStatus === LEAD_STATUS.COMPLETED ? PIPELINE_WAITING_DECISION_STAGE
                    : newStatus === LEAD_STATUS.CONVERTED ? 'Matriculado'
                        : newStatus === LEAD_STATUS.MISSED ? LEAD_STATUS.MISSED
                            : newStatus === LEAD_STATUS.LOST ? LEAD_STATUS.LOST
                                : undefined;

        const eventType =
            newStatus === LEAD_STATUS.COMPLETED
                ? 'attended'
                : newStatus === LEAD_STATUS.MISSED
                  ? 'missed'
                  : newStatus === LEAD_STATUS.CONVERTED
                    ? 'converted'
                    : 'stage_change';

        try {
            await addLeadEvent({
                academyId,
                leadId: id,
                type: eventType,
                from: lead.pipelineStage || lead.status || '',
                to: newStatus,
                createdBy: userId || 'user',
                permissionContext: permCtx
            });
            const patch = {
                status: newStatus,
                // Mantém alinhamento com o fluxo de matrícula do Pipeline.
                ...(newStatus === LEAD_STATUS.CONVERTED ? { contact_type: 'student' } : {}),
                ...(pipelineStage ? { pipelineStage } : {})
            };
            if (newStatus === LEAD_STATUS.COMPLETED) patch.attendedAt = nowIso;
            if (newStatus === LEAD_STATUS.MISSED) patch.missedAt = nowIso;
            if (newStatus === LEAD_STATUS.CONVERTED) patch.convertedAt = nowIso;
            await updateLead(id, patch);
            const waOutbound = {
                name: waCtx.name,
                zapster_instance_id: waCtx.zapster,
                templates: waCtx.templates,
            };
            const autoCtx = {
                academyId,
                waOutbound,
                academyRaw: academyAutomationsRaw,
                automationConfig,
                permissionContext: permCtx,
                updateLead,
                getLead: () => useLeadStore.getState().leads.find((l) => l.id === id) || { ...lead, ...patch },
            };
            if (newStatus === LEAD_STATUS.COMPLETED) {
                const autoResult = await safeAutomationDispatch(
                    afterPresenceConfirmed({
                        lead: { ...lead, ...patch },
                        ...autoCtx,
                    }),
                    'presence_confirmed'
                );
                notifyAutomationFeedback(toast.addToast, autoResult);
                toast.success('Comparecimento registrado.');
            } else if (newStatus === LEAD_STATUS.MISSED) {
                const autoResult = await safeAutomationDispatch(
                    afterMissed({
                        lead: { ...lead, ...patch },
                        ...autoCtx,
                    }),
                    'missed'
                );
                notifyAutomationFeedback(toast.addToast, autoResult);
            } else if (newStatus === LEAD_STATUS.CONVERTED) {
                toast.show({ type: 'success', message: terms.leadMarkedConvertedToast });
            }
            return true;
        } catch (e) {
            toast.error(e, 'save');
            throw e;
        } finally {
            setUpdatingStatus(false);
        }
    };

    const onConfirmScheduleFromModal = async ({ date, time, note }) => {
        const wasReschedule = Boolean(String(lead?.scheduledDate || '').trim());
        const patch = buildSchedulePatch(lead, { date, time });
        const textBody = String(note || '').trim() || `${terms.trial} agendada`;
        try {
            try {
                await addLeadEvent({
                    academyId,
                    leadId: id,
                    type: 'schedule',
                    to: date,
                    text: textBody,
                    createdBy: userId || 'user',
                    permissionContext: permCtx,
                    payloadJson: { date, time },
                });
                await updateLead(id, patch, { fallbackLead: lead });
            } catch {
                await updateLead(id, patch, { fallbackLead: lead });
            }
            const autoResult = await safeAutomationDispatch(
                afterExperimentalScheduled({
                    lead: { ...lead, ...patch },
                    ymd: date,
                    time,
                    academyId,
                    waOutbound: {
                        name: waCtx.name,
                        zapster_instance_id: waCtx.zapster,
                        templates: waCtx.templates,
                    },
                    academyRaw: academyAutomationsRaw,
                    automationConfig,
                    permissionContext: permCtx,
                    updateLead,
                    getLead: () => useLeadStore.getState().leads.find((l) => l.id === id) || { ...lead, ...patch },
                }),
                'schedule_confirm'
            );
            notifyAutomationFeedback(toast.addToast, autoResult);
            await refreshTimeline();
            toast.success(wasReschedule ? 'Aula reagendada com sucesso.' : 'Aula agendada com sucesso.');
        } catch (e) {
            toast.error(e, 'save');
            throw e;
        }
    };

    const handleMarkLost = () => {
        setLostModalOpen(true);
    };

    const runEnrollment = async (
        customAnswers = {},
        plan = '',
        enrollmentDate = '',
        discountAmount = 0,
        discountType = 'none',
        enrollFinanceConfig = null
    ) => {
        let extraToast = '';
        try {
        await performEnrollment({
            lead,
            academyId,
            userId,
            permissionContext: permCtx,
            updateLead,
            customQuestions,
            customAnswers,
            plan,
            discountAmount,
            discountType,
            enrollmentDate,
            financeConfig: enrollFinanceConfig ?? financeConfig,
            academySettingsRaw,
            waAutomation: {
                waOutbound: {
                    name: waCtx.name,
                    zapster_instance_id: waCtx.zapster,
                    templates: waCtx.templates,
                },
                academyRaw: academyAutomationsRaw,
            },
            onToast: (msg) => {
                extraToast = msg;
            },
            addToast: toast.addToast,
        });
        void useStudentStore.getState().fetchStudents({ reset: true });
        toast.show({
            type: 'success',
            message: terms.leadMarkedConvertedToast + (extraToast ? ` ${extraToast}` : ''),
        });
        navigate(`/student/${id}`, { replace: true });
        } catch (err) {
            toast.error(err, 'action');
            throw err;
        }
    };

    const confirmMarkLost = async (lostReason) => {
        let eventLogged = false;
        try {
            await addLeadEvent({
                academyId,
                leadId: id,
                type: 'lost',
                from: lead.status || '',
                to: LEAD_STATUS.LOST,
                text: String(lostReason || '').slice(0, 1000),
                createdBy: userId || 'user',
                permissionContext: permCtx
            });
            eventLogged = true;
        } catch (eventErr) {
            // O update de status não deve depender do log da timeline.
            console.warn('Falha ao registrar evento de perda no timeline:', eventErr);
        }
        await updateLead(id, {
            status: LEAD_STATUS.LOST,
            scheduledDate: '',
            scheduledTime: '',
            pipelineStage: LEAD_STATUS.LOST,
            lostReason,
            lostAt: new Date().toISOString()
        });
        if (!eventLogged) await refreshTimeline();
    };
    const deleteLeadExecute = async () => {
        if (deletingLead) return;
        setDeletingLead(true);
        try {
            await deleteLead(id);
            toast.success(`${contactLabel} excluído com sucesso.`);
            navigate(-1);
        } catch (e) {
            toast.error(e, 'delete');
        } finally {
            setDeletingLead(false);
        }
    };

    const openDeleteLeadConfirm = () => {
        setConfirmModal({
            title: `Excluir ${contactLabel.toLowerCase()}?`,
            description: `Esta ação não pode ser desfeita. Todos os dados do ${contactLabel.toLowerCase()} serão removidos.`,
            confirmLabel: 'Excluir',
            danger: true,
            onConfirm: deleteLeadExecute,
        });
    };

    const sendTemplateKey = async (key, { recordFollowupContact = false } = {}) => {
        if (sendingWhatsapp) return;
        setSendingWhatsapp(true);
        try {
            const r = await sendWhatsappTemplateOutbound({
                lead,
                academyId,
                academyName: waCtx.name,
                templateKey: key,
                templatesMap: waCtx.templates,
                zapsterInstanceId: waCtx.zapster,
                onToast: (t) => toast.show(t)
            });
            if (!r?.ok) return;
            try {
                const label = WHATSAPP_TEMPLATE_LABELS[key] || key;
                await addLeadEvent({
                    academyId,
                    leadId: id,
                    type: 'message',
                    text: `WhatsApp: template “${label}”`,
                    createdBy: userId || 'user',
                    permissionContext: permCtx
                });
                if (recordFollowupContact || (isFollowUpLead(lead) && followupState && !followupState.doneForCurrentClass)) {
                    const nowIso = new Date().toISOString();
                    await addLeadEvent({
                        academyId,
                        leadId: id,
                        type: 'followup_contact',
                        text: 'Contato de retorno via WhatsApp',
                        createdBy: userId || 'user',
                        permissionContext: permCtx,
                        payloadJson: {
                            source: 'lead_profile',
                            templateKey: key,
                            scheduledDate: lead.scheduledDate || '',
                        },
                    });
                    patchFollowupContactCache(academyId, id, nowIso);
                }
                await updateLead(id, { lastWhatsappActivityAt: new Date().toISOString() });
            } catch (err) {
                console.error('Erro ao registrar evento WhatsApp', err);
            }
        } finally {
            setSendingWhatsapp(false);
        }
    };

    const handleFollowupWhatsApp = () => {
        const key =
            followupState?.nextStep?.template_key ||
            (lead?.status === LEAD_STATUS.MISSED ? 'missed' : 'dashboard_contact');
        void sendTemplateKey(key, { recordFollowupContact: true });
    };

    const addNote = async () => {
        if (!note.trim() || addingNote) return;
        setAddingNote(true);
        try {
            await addLeadEvent({
                academyId,
                leadId: id,
                type: 'note',
                text: note.trim().slice(0, 1000),
                createdBy: userId || 'user',
                permissionContext: permCtx
            });
            await updateLead(id, { lastNoteAt: new Date().toISOString() });
            setNote('');
            toast.success('Nota adicionada.');
            focusNoteField();
        } catch (e) {
            toast.error(e, 'save');
        } finally {
            setAddingNote(false);
        }
    };

    const saveInlineTask = async () => {
        const title = String(inlineTaskTitle || '').trim();
        if (!title || inlineTaskSaving) return;
        setInlineTaskSaving(true);
        try {
            const created = await createTask({
                title,
                description: '',
                due_date: String(inlineTaskDue || '').trim(),
                assigned_to: '',
                lead_id: id,
                lead_name: String(lead?.name || '').trim(),
            });
            if (!created) return;
            toast.success('Tarefa criada.');
            resetInlineTaskForm();
        } catch (e) {
            toast.error(e, 'save');
        } finally {
            setInlineTaskSaving(false);
        }
    };

    const handleTogglePin = async (ev) => {
        const isCurrentlyPinned = Boolean(ev.is_pinned);
        // Se for fixar, validar limite de 3
        if (!isCurrentlyPinned) {
            const pinnedCount = timelineEvents.filter(e => e.is_pinned).length;
            if (pinnedCount >= 3) {
                toast.warning('Limite de 3 notas fixadas atingido.');
                return;
            }
        }

        // Atualização otimista
        const oldEvents = [...timelineEvents];
        setTimelineEvents(prev => prev.map(e => 
            e.$id === ev.$id ? { ...e, is_pinned: !isCurrentlyPinned } : e
        ));

        try {
            await updateLeadEvent(ev.$id, { is_pinned: !isCurrentlyPinned });
            emitLeadTimelineChanged(id, { eventType: 'event_updated' });
        } catch {
            setTimelineEvents(oldEvents); // Rollback
            toast.show({ type: 'error', message: 'Erro ao pinar nota.' });
        }
    };

    const statusStyle = STATUS_CONFIG[lead.status] || STATUS_CONFIG[LEAD_STATUS.NEW];
    const statusBadgeStyle =
        lead.status === LEAD_STATUS.SCHEDULED
            ? {
                  background: 'var(--color-warning-surface)',
                  color: 'var(--color-warning)',
                  border: '1px solid color-mix(in srgb, var(--color-warning) 25%, transparent)',
              }
            : {
                  background: statusStyle.bg,
                  color: statusStyle.color,
                  border: '1px solid transparent',
              };
    const contactType = String(lead.contact_type || '').trim() || (lead.status === LEAD_STATUS.CONVERTED ? 'student' : 'lead');
    const hasOtherDetails = Boolean(
        lead.parentName ||
        lead.age ||
        (customQuestions || []).some((q) => {
            const ans = (lead.customAnswers || {})[q?.id] ?? (lead.customAnswers || {})[q?.label];
            return hasLeadDisplayValue(ans);
        })
    );

    const leadTypeDisplay = normalizeLeadProfileType(lead.type || '');

    const handleCopyPhone = async () => {
        const display = String(lead.phone || '').trim();
        const digits = display.replace(/\D/g, '');
        if (!digits) return;
        try {
            await navigator.clipboard.writeText(display || digits);
            setPhoneCopied(true);
            toast.success('Telefone copiado.');
            window.setTimeout(() => setPhoneCopied(false), 2000);
        } catch {
            toast.show({ type: 'error', message: 'Não foi possível copiar o telefone.' });
        }
    };

    const renderQuickNoteComposer = ({ idPrefix = 'timeline', textareaRef = noteTextareaRef, className = '' } = {}) => (
        <div className={`note-container ${className}`.trim()}>
            <textarea
                ref={textareaRef}
                id={`${idPrefix}-note`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={`Adicione uma observação sobre este ${contactLabel.toLowerCase()}…`}
                className="timeline-textarea"
                rows={3}
                aria-label="Nova observação"
            />
            <div className="lead-profile-quick-note-chips">
                {LEAD_PROFILE_QUICK_NOTE_CHIPS.map((chip) => (
                    <button
                        key={chip}
                        type="button"
                        className="lead-profile-quick-note-chip"
                        onClick={() => applyQuickNoteChip(chip, textareaRef)}
                    >
                        {chip}
                    </button>
                ))}
            </div>
            <button
                type="button"
                id={`${idPrefix}-send-note`}
                className="btn-send-note"
                onClick={() => void addNote()}
                disabled={!note.trim() || addingNote}
                aria-label={addingNote ? 'Enviando nota…' : 'Enviar nota'}
            >
                <Send size={16} aria-hidden className="send-note-icon" />
            </button>
        </div>
    );

    const showSchedulePresence =
        lead?.status === LEAD_STATUS.SCHEDULED && Boolean(String(lead?.scheduledDate || '').trim());

    const hasPersonalDetails = Boolean(
        lead.sexo ||
            lead.turma ||
            lead.className ||
            lead.birthDate ||
            lead.isFirstExperience ||
            lead.plan ||
            lead.enrollmentDate
    );

    function formatLeadBirthDateDisplay(dateStr) {
        const iso = normalizeDateToISO(dateStr);
        if (!iso) return '';
        try {
            return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR');
        } catch {
            return String(dateStr || '');
        }
    }

    const leadInitials =
        String(lead?.name || '')
            .trim()
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map((w) => w[0].toUpperCase())
            .join('') || '?';

    const PrimaryCtaIcon = nextActionCtas.primary?.icon;

    const handleConversationPanelClose = () => {
        setProfileTab('timeline');
    };

    const panelTabBtn = (tabId, label) => {
        const isOfflineConversation =
            tabId === 'conversation' && waOfflineUi;
        return (
        <button
            key={tabId}
            type="button"
            role="tab"
            id={`lead-profile-panel-tab-${tabId}`}
            aria-selected={activeProfileTab === tabId}
            aria-controls={`lead-profile-panel-${tabId}`}
            className={`lead-profile-panel-tab${activeProfileTab === tabId ? ' lead-profile-panel-tab--active' : ''}${isOfflineConversation ? ' lead-profile-panel-tab--offline' : ''}`}
            onClick={() => setProfileTab(tabId)}
        >
            {label}
        </button>
        );
    };

    const heroOperationalStatusLabel = operationalStatusDisplayLabel(terms, lead.status);
    const heroShowOperationalStatusTag =
        !pipelineStageBadge ||
        String(pipelineStageBadge.label || '').trim().toLowerCase() !==
            String(heroOperationalStatusLabel || '').trim().toLowerCase();

    const renderLeadInlineField = ({
        fieldKey,
        label,
        displayValue,
        editValue,
        empty = false,
        inputType = 'text',
        inputMode,
        renderEditor,
    }) => (
        <ProfileInlineField
            key={fieldKey}
            label={label}
            displayValue={displayValue}
            empty={empty}
            canEdit={canEditProfile}
            editable={!editing && canEditProfile}
            fieldId={`lead-inline-${fieldKey}`}
            editValue={editValue}
            inputType={inputType}
            inputMode={inputMode}
            onSave={(draft) => saveLeadFieldInline(fieldKey, draft)}
            renderEditor={renderEditor}
        />
    );

    const leftColumn = (
        <div
            className="lead-panel-left-col"
            style={{
                display: stackedLayout && panelOpen ? 'none' : 'flex',
                width:
                    stackedLayout && panelOpen
                        ? 0
                        : stackedLayout
                          ? '100%'
                          : panelOpen
                            ? '360px'
                            : 'auto',
                flex:
                    stackedLayout && panelOpen
                        ? '0 0 0'
                        : stackedLayout && !panelOpen
                          ? '1 1 0%'
                          : !stackedLayout && !panelOpen
                            ? '1 1 0%'
                            : '0 0 auto',
                maxWidth: !stackedLayout && !panelOpen ? 560 : undefined,
                flexShrink: 0,
                overflow: 'hidden',
                flexDirection: 'column',
                borderRight: stackedLayout ? 'none' : '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                minHeight: 0,
                minWidth: 0,
            }}
        >
            <div className="left-col-header lead-profile-left-col-header">
                <button type="button" className="icon-btn" onClick={handleProfileBack} aria-label="Voltar">
                    <ArrowLeft size={20} />
                </button>
                {profileBreadcrumb ? (
                    <nav className="lead-profile-breadcrumb" aria-label="Navegação">
                        <Link
                            to={profileBreadcrumb.parentTo}
                            state={profileBreadcrumb.restorePipeline ? { fresh: false } : undefined}
                            className="lead-profile-breadcrumb__parent"
                        >
                            {profileBreadcrumb.parentLabel}
                        </Link>
                    </nav>
                ) : (
                    <span className="lead-profile-breadcrumb__fallback">{contactLabel}</span>
                )}
                <div className="flex gap-2 lead-profile-header-actions">
                    {!editing && canEditProfile ? (
                        <button type="button" className="btn-edit-header" onClick={startEdit}>
                            <Pencil size={14} /> Editar tudo
                        </button>
                    ) : null}
                    {editing ? (
                        <>
                            <button
                                type="button"
                                className="btn-edit-header cancel"
                                onClick={cancelEdit}
                                aria-label="Cancelar edição"
                            >
                                <X size={14} aria-hidden />
                            </button>
                            <button
                                type="button"
                                className="btn-edit-header save"
                                onClick={() => void handleSave()}
                                disabled={saving}
                                aria-label={saving ? 'Salvando…' : 'Salvar alterações'}
                            >
                                {saving ? 'Salvando…' : <Save size={14} aria-hidden />}
                            </button>
                        </>
                    ) : null}
                </div>
            </div>

            {showFollowupBand ? (
                <LeadFollowupBand
                    followupState={followupState}
                    lead={lead}
                    leadId={id}
                    academyId={academyId}
                    onWhatsApp={handleFollowupWhatsApp}
                    onComplete={() => openFollowupOutcome(lead)}
                    completing={savingFollowupOutcome}
                    sendingWhatsapp={sendingWhatsapp}
                />
            ) : null}

            {waOfflineUi ? (
                <ProfileWhatsAppOfflineBanner className="lead-profile-wa-offline-banner" />
            ) : null}

            <div className="lead-profile-left__scroll">
                <div className="lead-profile-dados left-col-content">
                    <div className="lead-profile-hero profile-main-header">
                            <div className="profile-avatar lead-profile-hero__avatar" aria-hidden>
                                {leadInitials}
                            </div>
                            <div className="profile-id-info lead-profile-hero__info">
                                {leadProfileNeedsGuardianHint(lead) ? (
                                    <StatusBanner variant="info" className="lead-profile-guardian-hint">
                                        Informe o responsável em <strong>Outros detalhes</strong> (quem fala no
                                        WhatsApp). O nome acima é do aluno que vai à aula.
                                    </StatusBanner>
                                ) : null}
                                {!editing && canEditProfile ? (
                                    <ProfileInlineField
                                        layout="hero-name"
                                        label={leadProfileNameFieldLabel(lead)}
                                        displayValue={lead.name || 'Sem nome'}
                                        empty={!String(lead.name || '').trim()}
                                        canEdit={canEditProfile}
                                        editValue={lead.name || ''}
                                        fieldId="lead-inline-hero-name"
                                        onSave={(draft) => saveLeadFieldInline('name', draft)}
                                    />
                                ) : (
                                    <h1 className="profile-name lead-profile-hero__name">{lead.name}</h1>
                                )}
                                {!editing && leadCardGuardianSubtitle(lead) ? (
                                    <p className="lead-profile-hero__guardian">{leadCardGuardianSubtitle(lead)}</p>
                                ) : null}
                                {!editing && canEditProfile ? (
                                    <ProfileInlineField
                                        layout="hero-phone"
                                        label="Telefone"
                                        displayValue={lead.phone || '—'}
                                        empty={!String(lead.phone || '').trim()}
                                        canEdit={canEditProfile}
                                        editValue={maskPhone(String(lead.phone || ''))}
                                        fieldId="lead-inline-hero-phone"
                                        onSave={(draft) => saveLeadFieldInline('phone', draft)}
                                        renderEditor={({ draft, setDraft, inputRef, onKeyDown, onBlur, disabled: saving, fieldId: fid }) => (
                                            <input
                                                ref={inputRef}
                                                id={fid}
                                                type="tel"
                                                inputMode="tel"
                                                className="profile-inline-field__input"
                                                value={draft ?? ''}
                                                disabled={saving}
                                                onChange={(e) => setDraft(maskPhone(e.target.value))}
                                                onKeyDown={onKeyDown}
                                                onBlur={onBlur}
                                            />
                                        )}
                                    />
                                ) : lead.phone ? (
                                    <div className="profile-phone lead-profile-hero__phone">
                                        <Phone size={14} aria-hidden />
                                        <span>{lead.phone}</span>
                                        <button
                                            type="button"
                                            className="lead-profile-phone-copy"
                                            onClick={() => void handleCopyPhone()}
                                            aria-label="Copiar telefone"
                                        >
                                            {phoneCopied ? 'Copiado' : 'Copiar'}
                                        </button>
                                    </div>
                                ) : null}
                                <div className="lead-profile-hero__badges lead-status-row flex items-center gap-2 flex-wrap">
                                    <span className="lead-contact-label">
                                        {contactType === 'student' ? terms.student : contactLabel}
                                    </span>
                                    {leadTypeDisplay ? (
                                        <span className="lead-profile-type-chip">
                                            <span className="lead-profile-type-icon" aria-hidden>
                                                {TYPE_ICONS[leadTypeDisplay]}
                                            </span>
                                            {leadTypeDisplay}
                                        </span>
                                    ) : null}
                                    {pipelineStageBadge ? (
                                        <StageBadge
                                            stage={pipelineStageBadge.stageId}
                                            label={pipelineStageBadge.label}
                                            size="sm"
                                            colorIndex={Math.max(
                                                0,
                                                stages.findIndex(
                                                    (s) => String(s?.id || '').trim() === pipelineStageBadge.stageId
                                                )
                                            )}
                                        />
                                    ) : null}
                                    {heroShowOperationalStatusTag ? (
                                        <span
                                            className="status-tag lead-profile-status-tag"
                                            style={statusBadgeStyle}
                                        >
                                            {heroOperationalStatusLabel}
                                        </span>
                                    ) : null}
                                    {lead.origin ? (
                                        <span className="status-tag origin-status-tag">{lead.origin}</span>
                                    ) : null}
                                </div>
                            </div>
                    </div>

                    {editing ? (
                    <div className="lead-profile-edit-panel profile-section">
                                <div className="flex-col gap-2 w-full lead-profile-edit-fields">
                                    <div className="flex-col gap-1">
                                        <label className="info-mini-label info-mini-label--start" htmlFor="lead-profile-edit-name">
                                            {leadProfileNameFieldLabel(form)}
                                        </label>
                                        <input
                                            id="lead-profile-edit-name"
                                            name="name"
                                            value={form.name}
                                            onChange={onChange}
                                            className="form-input-sm"
                                            autoComplete="name"
                                            aria-invalid={formErrors.name ? true : undefined}
                                            aria-describedby={formErrors.name ? 'lead-profile-edit-name-error' : undefined}
                                        />
                                        <FieldError id="lead-profile-edit-name-error">{formErrors.name}</FieldError>
                                    </div>
                                    <div className="flex-col gap-1">
                                        <label className="info-mini-label info-mini-label--start" htmlFor="lead-profile-edit-phone">
                                            Telefone
                                        </label>
                                        <input
                                            ref={phoneEditInputRef}
                                            id="lead-profile-edit-phone"
                                            name="phone"
                                            value={form.phone}
                                            onChange={(e) => {
                                                setForm((f) => ({ ...f, phone: maskPhone(e.target.value) }));
                                                if (formErrors.phone) {
                                                    setFormErrors((prev) => {
                                                        const next = { ...prev };
                                                        delete next.phone;
                                                        return next;
                                                    });
                                                }
                                            }}
                                            className="form-input-sm"
                                            type="tel"
                                            inputMode="numeric"
                                            autoComplete="tel"
                                            aria-invalid={formErrors.phone ? true : undefined}
                                            aria-describedby={formErrors.phone ? 'lead-profile-edit-phone-error' : undefined}
                                        />
                                        <FieldError id="lead-profile-edit-phone-error">{formErrors.phone}</FieldError>
                                    </div>
                                </div>
                                <div className="lead-profile-edit-sections w-full mt-3">
                                    <h3 className="section-title lead-profile-edit-section-title">Perfil</h3>
                                    <div className="lead-profile-type-grid">
                                        {['Criança', 'Juniores', 'Adulto'].map((typeOption) => (
                                            <label
                                                key={typeOption}
                                                className={`lead-profile-type-option ${form.type === typeOption ? 'selected' : ''}`}
                                            >
                                                <input
                                                    type="radio"
                                                    name="lead-type"
                                                    value={typeOption}
                                                    checked={form.type === typeOption}
                                                    onChange={(e) => {
                                                        const v = e.target.value;
                                                        setForm((f) => ({
                                                            ...f,
                                                            type: v,
                                                            ...(v === 'Adulto' ? { parentName: '', age: '' } : {}),
                                                        }));
                                                    }}
                                                />
                                                <span className="lead-profile-type-icon">{TYPE_ICONS[typeOption]}</span>
                                                <span className="lead-profile-type-name">{typeOption}</span>
                                            </label>
                                        ))}
                                    </div>
                                    {(form.type === 'Criança' || form.type === 'Juniores') && (
                                        <div className="flex-col gap-2 mt-3">
                                            <div className="flex-col gap-1">
                                                <label className="info-mini-label info-mini-label--start" htmlFor="lead-profile-edit-parent">
                                                    Responsável
                                                </label>
                                                <input
                                                    id="lead-profile-edit-parent"
                                                    className="form-input-sm"
                                                    type="text"
                                                    value={form.parentName}
                                                    onChange={(e) => setForm((f) => ({ ...f, parentName: e.target.value }))}
                                                    autoComplete="name"
                                                />
                                            </div>
                                            <div className="flex-col gap-1">
                                                <label className="info-mini-label info-mini-label--start" htmlFor="lead-profile-edit-age">
                                                    Idade
                                                </label>
                                                <input
                                                    id="lead-profile-edit-age"
                                                    className="form-input-sm"
                                                    type="number"
                                                    inputMode="numeric"
                                                    value={form.age}
                                                    onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
                                                    placeholder="Ex.: 8"
                                                />
                                            </div>
                                        </div>
                                    )}
                                    <div className="flex-col gap-1 mt-3">
                                        <label className="info-mini-label info-mini-label--start" htmlFor="lead-profile-edit-origin">
                                            Origem
                                        </label>
                                        <select
                                            id="lead-profile-edit-origin"
                                            className="form-input-sm"
                                            value={form.origin}
                                            onChange={(e) => setForm((f) => ({ ...f, origin: e.target.value }))}
                                        >
                                            <option value="">—</option>
                                            {LEAD_ORIGIN.map((o) => (
                                                <option key={o} value={o}>{o}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {showLeadProfileScheduleEditSection(lead.status) && (
                                        <>
                                            <h3 className="section-title lead-profile-edit-section-title mt-4">Agendamento</h3>
                                            <div className="flex-col gap-2">
                                                <div className="flex-col gap-1">
                                                    <span className="info-mini-label info-mini-label--start">Data da aula</span>
                                                    <DateInputField
                                                        className="form-input-sm"
                                                        type="date"
                                                        value={form.scheduledDate}
                                                        onChange={(e) => setForm((f) => ({ ...f, scheduledDate: e.target.value }))}
                                                    />
                                                </div>
                                                <div className="flex-col gap-1">
                                                    <span className="info-mini-label info-mini-label--start">Horário</span>
                                                    <input
                                                        className="form-input-sm"
                                                        type="time"
                                                        value={form.scheduledTime}
                                                        onChange={(e) => setForm((f) => ({ ...f, scheduledTime: e.target.value }))}
                                                    />
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    <h3 className="section-title lead-profile-edit-section-title mt-4">Dados adicionais</h3>
                                    <div className="flex-col gap-2">
                                        <div className="profile-form-grid">
                                            <div className="flex-col gap-1">
                                                <span className="info-mini-label info-mini-label--start">Data de nascimento</span>
                                                <DateInputField
                                                    className="form-input-sm"
                                                    type="date"
                                                    value={form.birthDate}
                                                    onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
                                                />
                                            </div>
                                            <div className="flex-col gap-1">
                                                <span className="info-mini-label info-mini-label--start">Sexo</span>
                                                <SexoSelect
                                                    className="form-input-sm"
                                                    value={form.sexo}
                                                    onChange={(v) => setForm((f) => ({ ...f, sexo: v }))}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex-col gap-1">
                                            <span className="info-mini-label info-mini-label--start">Turma</span>
                                            <TurmaSelect
                                                turmas={academyTurmas}
                                                selectValue={form.turmaSelect}
                                                otherText={form.turmaOther}
                                                onSelectChange={(v) => setForm((f) => ({ ...f, turmaSelect: v }))}
                                                onOtherChange={(v) => setForm((f) => ({ ...f, turmaOther: v }))}
                                                className="form-input-sm"
                                                id="lead-profile-turma"
                                                otherId="lead-profile-turma-other"
                                            />
                                        </div>
                                        <div className="flex-col gap-1">
                                            <span className="info-mini-label info-mini-label--start">Primeira experiência?</span>
                                            <div className="lead-profile-radio-row">
                                                <label className="lead-profile-inline-radio">
                                                    <input
                                                        type="radio"
                                                        name="isFirstExperience"
                                                        value="Sim"
                                                        checked={form.isFirstExperience === 'Sim'}
                                                        onChange={(e) => setForm((f) => ({ ...f, isFirstExperience: e.target.value }))}
                                                    />
                                                    <span>Sim</span>
                                                </label>
                                                <label className="lead-profile-inline-radio">
                                                    <input
                                                        type="radio"
                                                        name="isFirstExperience"
                                                        value="Não"
                                                        checked={form.isFirstExperience === 'Não'}
                                                        onChange={(e) => setForm((f) => ({ ...f, isFirstExperience: e.target.value }))}
                                                    />
                                                    <span>Não</span>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                    <CustomLeadQuestionFields
                                        questions={customQuestions}
                                        values={form.customAnswers || {}}
                                        onChange={(qid, val) =>
                                            setForm((f) => ({
                                                ...f,
                                                customAnswers: { ...(f.customAnswers || {}), [qid]: val },
                                            }))
                                        }
                                        disabled={saving}
                                    />
                                    <div className="lead-profile-edit-actions flex gap-2 mt-4">
                                        <button
                                            type="button"
                                            className="btn-primary"
                                            onClick={() => void handleSave()}
                                            disabled={saving}
                                        >
                                            {saving ? 'Salvando…' : 'Salvar'}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-outline"
                                            onClick={cancelEdit}
                                            disabled={saving}
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                    </div>
                    ) : null}

                    {/* Próxima ação */}
                    <div className="profile-section lead-profile-next-action">
                        <ReportSectionHeading title="Próxima ação" className="lead-profile-section-heading" />
                        {lead.scheduledDate ? (
                            <div className="schedule-card lead-profile-next-action__schedule">
                                <div className="schedule-info lead-profile-next-action__datetime">
                                    <Calendar size={16} aria-hidden />
                                    <span>
                                        {new Date(lead.scheduledDate + 'T00:00:00').toLocaleDateString('pt-BR', {
                                            weekday: 'short',
                                            day: 'numeric',
                                            month: 'short',
                                        })}{' '}
                                        · {lead.scheduledTime || '--:--'}
                                    </span>
                                </div>
                                {leadAutomationBadges.length > 0 ? (
                                    <div className="flex gap-2 mt-2 flex-wrap">
                                        {leadAutomationBadges.map((b) => (
                                            <span
                                                key={b.key}
                                                className={`lead-automation-badge${b.overdue ? ' lead-automation-badge--overdue' : ''}`}
                                                title={b.title}
                                            >
                                                {b.label}
                                            </span>
                                        ))}
                                    </div>
                                ) : null}
                                {showSchedulePresence ? (
                                    <div className="flex gap-2 mt-3">
                                        <button
                                            type="button"
                                            className="btn-state-attended btn-success-action"
                                            onClick={() => void handleUpdateStatus(LEAD_STATUS.COMPLETED)}
                                            disabled={updatingStatus}
                                        >
                                            Compareceu
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-state-missed"
                                            onClick={() => void handleUpdateStatus(LEAD_STATUS.MISSED)}
                                            disabled={updatingStatus}
                                        >
                                            Não compareceu
                                        </button>
                                    </div>
                                ) : null}
                                <button
                                    type="button"
                                    className="schedule-secondary-link"
                                    onClick={() => setScheduleModalOpen(true)}
                                    disabled={updatingStatus}
                                >
                                    Reagendar
                                </button>
                            </div>
                        ) : (
                            <div className="flex-col gap-2">
                                <p className="lead-profile-next-action__empty">
                                    Sem {terms.trial.toLowerCase()} agendada.
                                </p>
                                <button
                                    type="button"
                                    className="btn-next-step highlight"
                                    onClick={() => setScheduleModalOpen(true)}
                                    disabled={updatingStatus}
                                >
                                    <Calendar size={14} aria-hidden /> Agendar {terms.trialShort.toLowerCase()}
                                </button>
                            </div>
                        )}
                        <div className="flex-col gap-2 lead-profile-next-action__cta">
                            {nextActionCtas.primary && PrimaryCtaIcon ? (
                                <button
                                    type="button"
                                    className="btn-next-step highlight"
                                    onClick={nextActionCtas.primary.onClick}
                                    disabled={updatingStatus}
                                >
                                    <PrimaryCtaIcon size={14} aria-hidden /> {nextActionCtas.primary.label}
                                </button>
                            ) : null}
                            {nextActionCtas.secondary.map((cta) => {
                                const SecondaryIcon = cta.icon;
                                return (
                                    <button
                                        key={cta.key}
                                        type="button"
                                        className="btn-next-step"
                                        onClick={cta.onClick}
                                        disabled={updatingStatus}
                                    >
                                        <SecondaryIcon size={14} aria-hidden /> {cta.label}
                                    </button>
                                );
                            })}
                            {lead.status !== LEAD_STATUS.LOST ? (
                                <div className="next-step-danger-wrap">
                                    <button
                                        type="button"
                                        className="btn-next-step danger"
                                        onClick={handleMarkLost}
                                    >
                                        <AlertTriangle size={14} aria-hidden /> Marcar como perdido
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <div className="profile-section lead-profile-quick-note-section">
                        <button
                            type="button"
                            className="lead-profile-quick-note-toggle"
                            aria-expanded={dadosQuickNoteOpen}
                            onClick={() => setDadosQuickNoteOpen((open) => !open)}
                        >
                            <span className="lead-profile-quick-note-toggle__label">
                                <StickyNote size={14} aria-hidden />
                                Nota rápida
                            </span>
                            <ChevronDown
                                size={16}
                                aria-hidden
                                className={`lead-profile-quick-note-toggle__chevron${dadosQuickNoteOpen ? ' lead-profile-quick-note-toggle__chevron--open' : ''}`}
                            />
                        </button>
                        {dadosQuickNoteOpen
                            ? renderQuickNoteComposer({
                                  idPrefix: 'dados',
                                  textareaRef: dadosNoteTextareaRef,
                                  className: 'lead-profile-quick-note--dados',
                              })
                            : null}
                    </div>

                    {/* Tarefas */}
                    <div className="profile-section">
                        <div className="flex justify-between items-center mb-2">
                            <div className="lead-profile-tasks-head">
                            <ReportSectionHeading title="Tarefas" className="lead-profile-section-heading lead-profile-section-heading--inline" />
                            {leadTaskProgress ? (
                                <span className="badge-secondary lead-profile-task-progress-badge">
                                    {leadTaskProgress}
                                </span>
                            ) : null}
                            </div>
                            {!inlineTaskOpen ? (
                                <button
                                    type="button"
                                    className="btn-action-ghost lead-profile-new-task-btn"
                                    onClick={() => setInlineTaskOpen(true)}
                                >
                                    <CheckSquare size={12} aria-hidden /> + Nova tarefa
                                </button>
                            ) : null}
                        </div>
                        {inlineTaskOpen ? (
                            <div className="lead-profile-inline-task-form flex-col gap-2">
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Descrever a tarefa…"
                                    value={inlineTaskTitle}
                                    onChange={(e) => setInlineTaskTitle(e.target.value)}
                                    aria-label="Título da tarefa"
                                />
                                <DateInputField
                                    label="Vencimento"
                                    type="date"
                                    value={inlineTaskDue}
                                    onChange={(e) => setInlineTaskDue(e.target.value)}
                                />
                                <div className="flex gap-2 lead-profile-inline-task-actions">
                                    <button
                                        type="button"
                                        className="btn btn-primary btn-sm"
                                        disabled={!String(inlineTaskTitle || '').trim() || inlineTaskSaving}
                                        onClick={() => void saveInlineTask()}
                                    >
                                        {inlineTaskSaving ? 'Salvando…' : 'Salvar'}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-outline btn-sm"
                                        disabled={inlineTaskSaving}
                                        onClick={requestCloseInlineTask}
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        ) : null}
                        {leadTasks.length === 0 && !inlineTaskOpen ? (
                            <EmptyState
                                variant="compact"
                                tone="dashed"
                                title="Nenhuma tarefa"
                                role="status"
                            />
                        ) : leadTasks.length > 0 ? (
                            <div className="flex-col gap-2">
                                {leadTasks.slice(0, 5).map((t) => (
                                    <TaskCard
                                        key={t.id}
                                        task={t}
                                        variant="compact"
                                        showLead={false}
                                        showAssignee={true}
                                        isUpdating={isUpdatingLeadTask(t.id)}
                                        onComplete={() => void toggleLeadTask(t)}
                                        onEdit={null}
                                        onDelete={null}
                                    />
                                ))}
                                {leadTasks.length > 5 ? (
                                    <button 
                                        type="button" 
                                        className="btn-action-ghost lead-profile-view-all-tasks"
                                        onClick={() => navigate(`/tarefas?lead_id=${id}`)}
                                    >
                                        Ver todas as tarefas → ({leadTasks.length})
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="btn-action-ghost lead-profile-view-all-tasks"
                                        onClick={() => navigate(`/tarefas?lead_id=${id}`)}
                                    >
                                        Ver todas as tarefas →
                                    </button>
                                )}
                            </div>
                        ) : null}
                    </div>

                    {/* Dados Adicionais (Preservados do original, mas agora em lista) */}
                    {!editing && (hasPersonalDetails || canEditProfile) ? (
                        <div className="profile-section extra-info">
                            <ReportSectionHeading title="Dados pessoais" className="lead-profile-section-heading" />
                            <div className="flex-col gap-2">
                                {(lead.birthDate || canEditProfile) && !editing
                                    ? renderLeadInlineField({
                                          fieldKey: 'birthDate',
                                          label: 'Nascimento',
                                          displayValue: formatLeadBirthDateDisplay(lead.birthDate),
                                          editValue: String(lead.birthDate || '').slice(0, 10),
                                          empty: !lead.birthDate,
                                          inputType: 'date',
                                          renderEditor: ({ draft, setDraft, onKeyDown, onBlur, commitEdit, disabled: saving, fieldId: fid }) => (
                                              <DateInputField
                                                  id={fid}
                                                  type="date"
                                                  className="form-input-sm"
                                                  value={draft ?? ''}
                                                  onChange={(e) => {
                                                      const next = e.target.value;
                                                      setDraft(next);
                                                      if (/^\d{4}-\d{2}-\d{2}$/.test(String(next || '').trim()) || next === '') {
                                                          void commitEdit(next);
                                                      }
                                                  }}
                                                  onKeyDown={onKeyDown}
                                                  onBlur={onBlur}
                                                  disabled={saving}
                                              />
                                          ),
                                      })
                                    : lead.birthDate ? (
                                          <div className="info-mini-row">
                                              <span className="info-mini-label">Nascimento:</span>
                                              <span className="info-mini-value">{formatLeadBirthDateDisplay(lead.birthDate)}</span>
                                          </div>
                                      ) : null}
                                {(lead.sexo || canEditProfile) && !editing
                                    ? renderLeadInlineField({
                                          fieldKey: 'sexo',
                                          label: 'Sexo',
                                          displayValue: sexoDisplayLabel(lead.sexo),
                                          editValue: lead.sexo || '',
                                          empty: !lead.sexo,
                                          renderEditor: ({ draft, setDraft, commitEdit, disabled: saving }) => (
                                              <SexoSelect
                                                  id="lead-inline-sexo"
                                                  className="form-input-sm"
                                                  value={draft}
                                                  onChange={(v) => {
                                                      setDraft(v);
                                                      void commitEdit(v);
                                                  }}
                                                  disabled={saving}
                                              />
                                          ),
                                      })
                                    : lead.sexo ? (
                                          <div className="info-mini-row">
                                              <span className="info-mini-label">Sexo:</span>
                                              <span className="info-mini-value">{sexoDisplayLabel(lead.sexo)}</span>
                                          </div>
                                      ) : null}
                                {(String(lead.turma || lead.className || '').trim() || canEditProfile) && !editing
                                    ? renderLeadInlineField({
                                          fieldKey: 'turma',
                                          label: 'Turma',
                                          displayValue: String(lead.turma || lead.className || '').trim(),
                                          editValue: resolveTurmaFormState(lead.turma || lead.className, academyTurmas),
                                          empty: !String(lead.turma || lead.className || '').trim(),
                                          renderEditor: ({ draft, setDraft, commitEdit, disabled: saving }) => (
                                              <div
                                                  className="profile-inline-field__turma-wrap"
                                                  onBlur={(e) => {
                                                      if (!e.currentTarget.contains(e.relatedTarget)) {
                                                          void commitEdit();
                                                      }
                                                  }}
                                              >
                                                  <TurmaSelect
                                                      id="lead-inline-turma"
                                                      otherId="lead-inline-turma-other"
                                                      turmas={academyTurmas}
                                                      selectValue={draft?.turmaSelect ?? ''}
                                                      otherText={draft?.turmaOther ?? ''}
                                                      onSelectChange={(v) => setDraft((p) => ({ ...p, turmaSelect: v }))}
                                                      onOtherChange={(v) => setDraft((p) => ({ ...p, turmaOther: v }))}
                                                      className="form-input-sm"
                                                      disabled={saving}
                                                  />
                                              </div>
                                          ),
                                      })
                                    : String(lead.turma || lead.className || '').trim() ? (
                                          <div className="info-mini-row">
                                              <span className="info-mini-label">Turma:</span>
                                              <span className="info-mini-value">{String(lead.turma || lead.className).trim()}</span>
                                          </div>
                                      ) : null}
                                {(lead.isFirstExperience || canEditProfile) && !editing
                                    ? renderLeadInlineField({
                                          fieldKey: 'isFirstExperience',
                                          label: 'Primeira experiência',
                                          displayValue: lead.isFirstExperience || '',
                                          editValue: lead.isFirstExperience || 'Sim',
                                          empty: !lead.isFirstExperience,
                                          renderEditor: ({ draft, setDraft, inputRef, commitEdit, disabled: saving }) => (
                                              <select
                                                  ref={inputRef}
                                                  className="form-input-sm"
                                                  value={draft ?? 'Sim'}
                                                  disabled={saving}
                                                  onChange={(e) => {
                                                      const v = e.target.value;
                                                      setDraft(v);
                                                      void commitEdit(v);
                                                  }}
                                              >
                                                  <option value="Sim">Sim</option>
                                                  <option value="Não">Não</option>
                                              </select>
                                          ),
                                      })
                                    : lead.isFirstExperience ? (
                                          <div className="info-mini-row">
                                              <span className="info-mini-label">Primeira experiência:</span>
                                              <span className="info-mini-value">{lead.isFirstExperience}</span>
                                          </div>
                                      ) : null}
                                {(lead.plan || canEditProfile) && !editing
                                    ? renderLeadInlineField({
                                          fieldKey: 'plan',
                                          label: terms.plan,
                                          displayValue: lead.plan || '',
                                          editValue: lead.plan || '',
                                          empty: !lead.plan,
                                      })
                                    : lead.plan ? (
                                          <div className="info-mini-row">
                                              <span className="info-mini-label">{terms.plan}:</span>
                                              <span className="info-mini-value">{lead.plan}</span>
                                          </div>
                                      ) : null}
                                {(lead.enrollmentDate || canEditProfile) && !editing
                                    ? renderLeadInlineField({
                                          fieldKey: 'enrollmentDate',
                                          label: 'Data de matrícula',
                                          displayValue: formatLeadBirthDateDisplay(lead.enrollmentDate),
                                          editValue: String(lead.enrollmentDate || '').slice(0, 10),
                                          empty: !lead.enrollmentDate,
                                          inputType: 'date',
                                          renderEditor: ({ draft, setDraft, onKeyDown, onBlur, commitEdit, disabled: saving, fieldId: fid }) => (
                                              <DateInputField
                                                  id={fid}
                                                  type="date"
                                                  className="form-input-sm"
                                                  value={draft ?? ''}
                                                  onChange={(e) => {
                                                      const next = e.target.value;
                                                      setDraft(next);
                                                      if (/^\d{4}-\d{2}-\d{2}$/.test(String(next || '').trim()) || next === '') {
                                                          void commitEdit(next);
                                                      }
                                                  }}
                                                  onKeyDown={onKeyDown}
                                                  onBlur={onBlur}
                                                  disabled={saving}
                                              />
                                          ),
                                      })
                                    : lead.enrollmentDate ? (
                                          <div className="info-mini-row">
                                              <span className="info-mini-label">Data de matrícula:</span>
                                              <span className="info-mini-value">{formatLeadBirthDateDisplay(lead.enrollmentDate)}</span>
                                          </div>
                                      ) : null}
                            </div>
                        </div>
                    ) : null}

                    {!editing && hasOtherDetails && (
                        <div className="profile-section extra-info">
                            <ReportSectionHeading title="Outros detalhes" className="lead-profile-section-heading" />
                            <div className="flex-col gap-2">
                                {(lead.parentName || canEditProfile) && !editing
                                    ? renderLeadInlineField({
                                          fieldKey: 'parentName',
                                          label: 'Responsável',
                                          displayValue: lead.parentName || '',
                                          editValue: lead.parentName || '',
                                          empty: !lead.parentName,
                                      })
                                    : lead.parentName ? (
                                          <div className="info-mini-row">
                                              <span className="info-mini-label">Responsável:</span>
                                              <span className="info-mini-value">{lead.parentName}</span>
                                          </div>
                                      ) : null}
                                {(lead.age || canEditProfile) && !editing
                                    ? renderLeadInlineField({
                                          fieldKey: 'age',
                                          label: 'Idade',
                                          displayValue: lead.age ? `${lead.age} anos` : '',
                                          editValue: lead.age || '',
                                          empty: !lead.age,
                                          inputType: 'text',
                                      })
                                    : lead.age ? (
                                          <div className="info-mini-row">
                                              <span className="info-mini-label">Idade:</span>
                                              <span className="info-mini-value">{lead.age} anos</span>
                                          </div>
                                      ) : null}
                                {customQuestions.map((q) => {
                                    const ans = (lead.customAnswers || {})[q?.id] ?? (lead.customAnswers || {})[q?.label];
                                    if (!hasLeadDisplayValue(ans)) return null;
                                    return (
                                        <div key={q?.id || q?.label} className="info-mini-row">
                                            <span className="info-mini-label">{q?.label}:</span>
                                            <span className="info-mini-value">{String(ans)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <button
                        type="button"
                        className="btn-delete-lead-link"
                        onClick={openDeleteLeadConfirm}
                        disabled={deletingLead}
                    >
                        <Trash2 size={14} aria-hidden />
                        {`Excluir ${contactLabel.toLowerCase()}`}
                    </button>
                </div>
            </div>

            <div className="lead-profile-left__footer lead-profile-panel-toggle">
                <button
                    type="button"
                    className="lead-profile-panel-toggle__btn"
                    onClick={() => setPanelOpen((open) => !open)}
                >
                    {panelOpen ? <>← Voltar ao perfil</> : <>Abrir detalhes →</>}
                </button>
            </div>
        </div>
    );

    const rightColumn = (
        <div
            className="lead-panel-right-col"
            style={{
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                minWidth: 0,
                flex: panelOpen ? 1 : 0,
                flexBasis: panelOpen ? undefined : 0,
                maxWidth: panelOpen ? (stackedLayout ? '100%' : 560) : 0,
                opacity: panelOpen ? 1 : 0,
                pointerEvents: panelOpen ? 'auto' : 'none',
                width: stackedLayout && panelOpen ? '100%' : undefined,
                background: 'var(--surface-hover)',
            }}
        >
            {stackedLayout && panelOpen ? (
                <div className="lead-profile-mobile-panel-chrome">
                    <button
                        type="button"
                        className="lead-profile-mobile-conv-back"
                        onClick={() => setPanelOpen(false)}
                        aria-label="Voltar ao perfil do contato"
                    >
                        <ArrowLeft size={18} aria-hidden />
                        Perfil
                    </button>
                    <span className="lead-profile-mobile-panel-chrome__name">{lead.name}</span>
                    <span className="lead-profile-mobile-panel-chrome__spacer" aria-hidden />
                </div>
            ) : null}

            {stackedLayout && panelOpen ? (
                <ProfileMobileQuickActions actions={mobilePanelQuickActions} />
            ) : null}

            <div className="lead-profile-panel-tabs" role="tablist" aria-label="Detalhes do contato">
                {showConversationTab ? panelTabBtn('conversation', conversationTabLabel) : null}
                {panelTabBtn('timeline', 'Histórico')}
            </div>

            <div
                className={`lead-profile-panel-body${activeProfileTab === 'conversation' ? '' : ' lead-profile-panel-body--scroll'}`}
            >
                {activeProfileTab === 'timeline' ? (
                <div
                    className="lead-profile-panel lead-profile-panel--timeline"
                    role="tabpanel"
                    id="lead-profile-panel-timeline"
                    aria-labelledby="lead-profile-panel-tab-timeline"
                >
                <div className="timeline-header">
                    <div className="timeline-header__title-row">
                        <h2 className="timeline-title">Histórico</h2>
                        <span className="lead-profile-pin-counter" aria-label={`${pinnedNotesCount} de 3 notas fixadas`}>
                            {pinnedNotesCount}/3 fixadas
                        </span>
                    </div>
                    <div className="filter-strip" role="group" aria-label="Filtrar eventos">
                        <button type="button" className={`filter-pill${eventTypeFilter === 'all' ? ' active' : ''}`} aria-pressed={eventTypeFilter === 'all'} onClick={() => setHistoryFilterWithUrl('all')}>Todos</button>
                        <button type="button" className={`filter-pill${eventTypeFilter === 'message' ? ' active' : ''}`} aria-pressed={eventTypeFilter === 'message'} onClick={() => setHistoryFilterWithUrl('message')}>Mensagens</button>
                        <button type="button" className={`filter-pill${eventTypeFilter === 'schedule' ? ' active' : ''}`} aria-pressed={eventTypeFilter === 'schedule'} onClick={() => setHistoryFilterWithUrl('schedule')}>Agendamentos</button>
                        <button type="button" className={`filter-pill${eventTypeFilter === 'stage_change' ? ' active' : ''}`} aria-pressed={eventTypeFilter === 'stage_change'} onClick={() => setHistoryFilterWithUrl('stage_change')}>Mudanças</button>
                        <button type="button" className={`filter-pill${eventTypeFilter === 'note' ? ' active' : ''}`} aria-pressed={eventTypeFilter === 'note'} onClick={() => setHistoryFilterWithUrl('note')}>Notas</button>
                        <button type="button" className={`filter-pill${eventTypeFilter === 'conversation' ? ' active' : ''}`} aria-pressed={eventTypeFilter === 'conversation'} onClick={() => setHistoryFilterWithUrl('conversation')}>Conversa</button>
                    </div>
                </div>

                <div className="timeline-input-zone">
                    {renderQuickNoteComposer({ idPrefix: 'timeline', textareaRef: noteTextareaRef })}
                </div>

                <div className="timeline-content">
                    {timelineError ? (
                        <ErrorBanner
                            className="lead-profile-timeline-error"
                            message="Não foi possível carregar o histórico."
                            onRetry={() => void refreshTimeline()}
                        />
                    ) : null}

                    {!timelineError && filteredTimelineEvents.length === 0 ? (
                        <EmptyState
                            variant="compact"
                            tone="dashed"
                            title={timelineEmptyState.title}
                            description={timelineEmptyState.description}
                            role="status"
                        />
                    ) : null}

                    {!timelineError && filteredTimelineEvents.length > 0 ? (
                        <LeadProfileTimelineEventsList
                            events={filteredTimelineEvents}
                            stages={stages}
                            terms={terms}
                            timelineEventLabels={TIMELINE_EVENT_LABELS}
                            humanizeStage={humanizeTimelineStage}
                            onTogglePin={handleTogglePin}
                        />
                    ) : null}
                </div>
                </div>
                ) : null}

                {activeProfileTab === 'conversation' && showConversationTab ? (
                    <div className="lead-profile-conversation-panel" role="tabpanel" id="lead-profile-panel-conversation" aria-labelledby="lead-profile-panel-tab-conversation">
                        <NaviChatWidgetPanel
                            academyId={academyId}
                            activePhone={lead.phone}
                            leadId={lead.id}
                            leadName={lead.name}
                            isMobile={stackedLayout}
                            embedded
                            hideProfileLink
                            onMinimize={handleConversationPanelClose}
                            onClose={handleConversationPanelClose}
                            onSummaryChange={handleConversationSummaryChange}
                            onRequestEditPhone={handleRequestEditPhone}
                        />
                    </div>
                ) : null}
            </div>
        </div>
    );

    return (
        <div
            className={`lead-profile-page-root${panelOpen ? ' lead-profile--panel-open' : ''}`}
            style={{
                display: 'flex',
                flex: 1,
                minHeight: 0,
                overflow: panelOpen ? 'hidden' : 'auto',
                width: '100%',
                background: 'var(--color-content-bg)',
            }}
        >
            <style
                dangerouslySetInnerHTML={{
                    __html: `
            @media (max-width: 1023px) {
              .lead-profile--panel-open .lead-panel-right-col {
                position: fixed;
                inset: 0;
                z-index: 200;
                max-width: 100% !important;
                flex: 1 1 auto !important;
                opacity: 1 !important;
                pointer-events: auto !important;
                box-sizing: border-box;
              }
              .lead-profile--panel-open .lead-panel-left-col {
                display: none !important;
              }
            }
          `,
                }}
            />
            {leftColumn}
            {rightColumn}

            <ConfirmDialog
                open={Boolean(confirmModal)}
                title={confirmModal?.title || ''}
                description={confirmModal?.description}
                confirmLabel={confirmModal?.confirmLabel || 'Confirmar'}
                confirmVariant={confirmModal?.danger ? 'danger' : 'primary'}
                loading={confirmBusy}
                onConfirm={() => void runConfirmModalAction()}
                onClose={() => (confirmBusy ? undefined : setConfirmModal(null))}
            />

            <ConfirmDialog
                open={inlineTaskDiscardOpen}
                title="Descartar tarefa?"
                description="Os dados preenchidos serão perdidos."
                confirmLabel="Descartar"
                confirmVariant="danger"
                onConfirm={() => {
                    setInlineTaskDiscardOpen(false);
                    resetInlineTaskForm();
                }}
                onClose={() => setInlineTaskDiscardOpen(false)}
            />

            {matriculaModalOpen ? (
            <Suspense fallback={null}>
            <MatriculaModal
                isOpen={matriculaModalOpen}
                lead={lead}
                leadId={id || ''}
                academyId={academyId}
                userId={userId}
                teamId={permCtx.teamId || ''}
                initialStep={matriculaInitialStep}
                paymentEnabled={modules?.finance === true}
                showContractPrompt={modules?.finance === true}
                enrollmentQuestions={customQuestions}
                financeConfig={financeConfig}
                submitting={matriculaSubmitting}
                onClose={() => {
                    if (matriculaSubmitting) return;
                    setMatriculaModalOpen(false);
                    setMatriculaInitialStep('choose');
                }}
                onSendContract={(studentId) => {
                    setMatriculaModalOpen(false);
                    setMatriculaInitialStep('choose');
                    setPostMatriculaContractLeadId(studentId);
                    setPostMatriculaContractOpen(true);
                }}
                onSkipAfterEnroll={(studentId) => {
                    setMatriculaModalOpen(false);
                    setMatriculaInitialStep('choose');
                    if (studentId) navigate(`/student/${studentId}?edit=enrollment`);
                }}
                onPaymentRegistered={(doc) => {
                    if (doc?.warning) {
                        toast.show({
                            type: 'warning',
                            message: String(doc.warning || '').trim() || 'Pagamento registrado, mas houve um problema ao atualizar o caixa.',
                            duration: 10000,
                        });
                    } else {
                        toast.show({ type: 'success', message: 'Pagamento registrado.' });
                    }
                    void refreshTimeline();
                }}
                onEnroll={async ({ plan, enrollmentDate, discountAmount, discountType, answers, financeConfig: enrollFinanceConfig }) => {
                    setMatriculaSubmitting(true);
                    try {
                        await runEnrollment(
                            answers,
                            plan,
                            enrollmentDate,
                            discountAmount,
                            discountType,
                            enrollFinanceConfig
                        );
                    } catch (e) {
                        toast.error(e, 'action');
                        throw e;
                    } finally {
                        setMatriculaSubmitting(false);
                    }
                }}
            />
            </Suspense>
            ) : null}

            {postMatriculaContractOpen ? (
            <Suspense fallback={null}>
            <CreateContractModal
                open={postMatriculaContractOpen}
                leadId={postMatriculaContractLeadId || undefined}
                onClose={() => {
                    setPostMatriculaContractOpen(false);
                    setPostMatriculaContractLeadId(null);
                }}
                onSuccess={() => {
                    setPostMatriculaContractOpen(false);
                    setPostMatriculaContractLeadId(null);
                }}
            />
            </Suspense>
            ) : null}
            {lostModalOpen && (
                <LostReasonModal
                    leadName={lead.name || contactLabel}
                    onCancel={() => setLostModalOpen(false)}
                    onConfirm={async (reason) => {
                        try {
                            await confirmMarkLost(reason);
                            toast.success('Marcado como não fechou.');
                        } catch (e) {
                            toast.error(e, 'save');
                        } finally {
                            setLostModalOpen(false);
                        }
                    }}
                />
            )}

            {scheduleModalOpen ? (
            <Suspense fallback={null}>
            <ScheduleModal
                open={scheduleModalOpen}
                onClose={() => setScheduleModalOpen(false)}
                onConfirm={onConfirmScheduleFromModal}
                lead={lead}
                quickTimes={profileQuickTimes}
                initialDate={lead?.scheduledDate || ''}
                initialTime={lead?.scheduledTime || ''}
            />
            </Suspense>
            ) : null}

            <FollowupOutcomeDialog
                open={Boolean(followupOutcomeLead)}
                leadName={followupOutcomeLead?.name || lead?.name}
                saving={savingFollowupOutcome}
                onClose={closeFollowupOutcome}
                onConfirm={(payload) => void confirmFollowupOutcome(payload)}
            />
</div>
    );
};

export default LeadProfile;
