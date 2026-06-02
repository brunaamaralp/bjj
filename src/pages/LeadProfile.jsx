import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { addLeadEvent, getLeadEvents, updateLeadEvent } from '../lib/leadEvents.js';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useLeadStore, LEAD_STATUS, LEAD_ORIGIN } from '../store/useLeadStore';
import { useStudentStore } from '../store/useStudentStore';
import { useTaskStore } from '../store/useTaskStore';
import { progressLabelForLead } from '../lib/taskTemplates.js';
import { useUiStore } from '../store/useUiStore';
import { useToast } from '../hooks/useToast';
import { ArrowLeft, ArrowRight, ChevronRight, ChevronDown, MessageCircle, Calendar, UserCheck, Phone, Send, Clock, Copy, Check, Pencil, X, Save, AlertTriangle, Trash2, StickyNote, Pin, Baby, Users, Dumbbell, CheckSquare, BadgeCheck, MoreVertical } from 'lucide-react';
import LeadCloseSaleModal from '../components/sales/LeadCloseSaleModal.jsx';
import { canShowLeadCloseSale } from '../lib/leadCloseSale.js';
import { databases, DB_ID, ACADEMIES_COL, account, createSessionJwt } from '../lib/appwrite';
import { DEFAULT_WHATSAPP_TEMPLATES, WHATSAPP_TEMPLATE_LABELS } from '../../lib/whatsappTemplateDefaults.js';
import { useWhatsappTemplates } from '../lib/useWhatsappTemplates.js';
import { sendWhatsappTemplateOutbound } from '../lib/outboundWhatsappTemplate.js';
import { LostReasonModal } from '../components/LostReasonModal';
import ConfirmDialog from '../components/shared/ConfirmDialog.jsx';
import MatriculaModal from '../components/MatriculaModal';
import { performEnrollment } from '../lib/performEnrollment.js';
import { useNlPageContext } from '../hooks/useNlPageContext.js';
import { getStudentPayments } from '../lib/studentPayments';
import { LEAD_TIMELINE_CHANGED, emitLeadTimelineChanged } from '../lib/leadTimelineEvents.js';
import { PIPELINE_WAITING_DECISION_STAGE, PIPELINE_STAGES } from '../constants/pipeline.js';
import { LEAD_PROFILE_QUICK_NOTE_CHIPS } from '../lib/leadProfileQuickNotes.js';
import { friendlyError } from '../lib/errorMessages.js';
import { maskPhone } from '../lib/masks.js';
import SexoSelect from '../components/shared/SexoSelect.jsx';
import TurmaSelect from '../components/shared/TurmaSelect.jsx';
import { useAcademyTurmas } from '../hooks/useAcademyTurmas.js';
import { resolveTurmaFormState, turmaValueFromForm } from '../lib/academyTurmas.js';
import { sexoDisplayLabel } from '../lib/leadSexo.js';
import ScheduleModal from '../components/ScheduleModal.jsx';
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
    formatWhatsappTemplateSentTimeline,
    getLeadAutomationBadges,
} from '../lib/automationUx.js';
import { normalizeLeadProfileType } from '../../lib/leadTypeNormalize.js';
import { getPipelineStageColor } from '../lib/pipelineStageColors.js';
import {
    LEAD_PROFILE_FROM_DASHBOARD,
    LEAD_PROFILE_FROM_PIPELINE,
} from '../lib/pipelineSessionState.js';
import ProfileConversationTab from '../components/inbox/ProfileConversationTab.jsx';
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
import '../styles/lead-profile.css';

function hasLeadDisplayValue(val) {
    const s = String(val ?? '').trim();
    return Boolean(s) && s !== '-';
}

function normalizeLeadPhoneForInbox(v) {
    return String(v || '').replace(/\D/g, '');
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
    [LEAD_STATUS.LOST]: { bg: '#f1f5f9', color: '#64748b' },
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
    followup_done: 'Follow-up concluído',
    inbox_note: 'Nota Inbox',
    whatsapp: 'WhatsApp',
    whatsapp_template_sent: 'WhatsApp automático',
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

function truncateBreadcrumbName(name, maxLen = 28) {
    const s = String(name || '').trim();
    if (s.length <= maxLen) return s;
    return `${s.slice(0, maxLen - 1)}…`;
}

const LeadProfile = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const profileFrom = location.state?.from;
    const lead = useLeadStore((s) => s.leads.find((l) => l.id === id));
    const loading = useLeadStore((s) => s.loading);
    const studentsLoading = useStudentStore((s) => s.loading);

    useEffect(() => {
        if (loading || studentsLoading || lead) return;
        const student = useStudentStore.getState().getStudentById(id);
        if (student) navigate(`/student/${id}`, { replace: true });
    }, [loading, studentsLoading, lead, id, navigate]);
    const updateLead = useLeadStore((s) => s.updateLead);
    const deleteLead = useLeadStore((s) => s.deleteLead);
    const toast = useToast();
    const academyId = useLeadStore((s) => s.academyId);
    const financeConfig = useLeadStore((s) => s.financeConfig);
    const modules = useLeadStore((s) => s.modules);

    const { turmas: academyTurmas } = useAcademyTurmas(academyId);
    const userId = useLeadStore((s) => s.userId);
    const academyList = useLeadStore((s) => s.academyList);
    const terms = useTerms();
    const labels = useLeadStore((s) => s.labels);
    const contactLabel = useMemo(() => contactLabelSingular(labels), [labels]);
    const pipelineLabel = labels?.pipeline || 'Funil';

    const profileBreadcrumb = useMemo(() => {
        if (profileFrom === LEAD_PROFILE_FROM_DASHBOARD) {
            return { parentLabel: 'Hoje', parentTo: '/', restorePipeline: false };
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
    }, [lead, lead?.pipelineStage, lead?.stage, stages, terms]);

    const academyNameDisplay = useMemo(() => {
        const cur = (academyList || []).find((a) => a.id === academyId);
        return String(cur?.name || '').trim();
    }, [academyList, academyId]);

    const [studentPayments, setStudentPayments] = useState([]);
    const [leadTasks, setLeadTasks] = useState([]);
    const leadTaskProgress = useMemo(() => progressLabelForLead(id, leadTasks), [id, leadTasks]);
    const storeTasks = useTaskStore((s) => s.tasks);
    const isUpdatingLeadTask = useTaskStore((s) => s.isUpdating);

    const loadLeadTasks = useCallback(() => {
        if (!id || !academyId) return;
        createSessionJwt().then((jwt) => {
            if (!jwt) return;
            fetch(`/api/tasks?academy_id=${encodeURIComponent(academyId)}&lead_id=${encodeURIComponent(id)}`, {
                headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': academyId },
            })
                .then((r) => r.json())
                .then((data) => {
                    if (data.sucesso) {
                        setLeadTasks(data.tasks || []);
                    }
                })
                .catch(() => {});
        });
    }, [id, academyId]);

    useEffect(() => {
        let cancelled = false;
        if (!id || !academyId) return undefined;
        createSessionJwt().then((jwt) => {
            if (!jwt || cancelled) return;
            fetch(`/api/tasks?academy_id=${encodeURIComponent(academyId)}&lead_id=${encodeURIComponent(id)}`, {
                headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': academyId },
            })
                .then((r) => r.json())
                .then((data) => {
                    if (!cancelled && data.sucesso) {
                        setLeadTasks(data.tasks || []);
                    }
                })
                .catch(() => {});
        });
        return () => {
            cancelled = true;
        };
    }, [id, academyId]);

    useEffect(() => {
        if (!id) return;
        const relevant = (storeTasks || []).filter(
            (t) => String(t.lead_id || t.leadId || '').trim() === String(id).trim()
        );
        if (!relevant.length) return;
        setLeadTasks((prev) => {
            const byId = new Map(relevant.map((t) => [t.id, t]));
            let changed = false;
            const next = prev.map((t) => {
                const hit = byId.get(t.id);
                if (!hit) return t;
                if (
                    hit.status === t.status &&
                    hit.title === t.title &&
                    String(hit.due_date || '') === String(t.due_date || t.dueDate || '')
                ) {
                    return t;
                }
                changed = true;
                return { ...t, ...hit };
            });
            return changed ? next : prev;
        });
    }, [storeTasks, id]);

    useEffect(() => {
        const onVis = () => {
            if (document.visibilityState === 'visible') loadLeadTasks();
        };
        document.addEventListener('visibilitychange', onVis);
        return () => document.removeEventListener('visibilitychange', onVis);
    }, [loadLeadTasks]);

    const toggleLeadTask = async (t) => {
        const newStatus = t.status === 'done' ? 'pending' : 'done';
        setLeadTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: newStatus } : x));
        try {
            await useTaskStore.getState().updateTask(t.id, { status: newStatus });
        } catch(e) {
            setLeadTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: t.status } : x));
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
    }, [id, academyId, lead?.id, lead?.status, lead?.contact_type]);

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
    }, [id, academyId, lead?.id, lead?.status, lead?.contact_type]);

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
    const [timelineOpen, setTimelineOpen] = useState(true);
    const [activeProfileTab, setActiveProfileTab] = useState('dados');

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
        return { type: t, ...base };
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
                    if (ev?.type === 'pipeline_change' && String(ev?.from || '') === String(ev?.to || '')) {
                        return false;
                    }
                    if (eventTypeFilter === 'all') return true;
                    const t = ev.type || 'note';
                    if (eventTypeFilter === 'note') return t === 'note' || t === 'inbox_note';
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
    const noteTextareaRef = useRef(null);
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
    const [closeSaleOpen, setCloseSaleOpen] = useState(false);
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
    const showConversationTab =
        modules?.whatsapp === true || Boolean(String(waZapHook || waCtx.zapster || '').trim());

    useEffect(() => {
        if (activeProfileTab === 'timeline' || activeProfileTab === 'conversation') {
            setTimelineOpen(true);
        } else if (activeProfileTab === 'dados') {
            setTimelineOpen(false);
        }
    }, [activeProfileTab]);

    const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
    const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
    const [profileQuickTimes, setProfileQuickTimes] = useState([]);

    useEffect(() => {
        setTemplateMenuOpen(false);
    }, [id]);

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
    }, [academyId]);

    const fillFormFromLead = (src) => {
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
        
        function normalizeDateToISO(dateStr) {
            if (!dateStr) return '';
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
            if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
                const [day, month, year] = dateStr.split('/');
                return `${year}-${month}-${day}`;
            }
            return '';
        }

        setForm({
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
            ...(() => {
                const t = resolveTurmaFormState(src.turma || src.className, academyTurmas);
                return { turmaSelect: t.selectValue, turmaOther: t.otherText };
            })(),
        });
    };

    if (loading && !lead) {
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
        fillFormFromLead(lead);
        setEditing(true);
    };

    const cancelEdit = () => {
        setEditing(false);
    };

    const onChange = (e) => {
        const { name, value } = e.target;
        setForm((f) => ({ ...f, [name]: value }));
    };

    const executeSaveLead = async (payload) => {
        if (!String(payload.name || '').trim()) {
            toast.show({ type: 'error', message: 'Nome é obrigatório' });
            return;
        }
        if (!String(payload.phone || '').trim()) {
            toast.show({ type: 'error', message: 'Telefone é obrigatório' });
            return;
        }
        const digits = String(payload.phone || '').replace(/\D/g, '');
        if (digits.length < 10) {
            toast.show({ type: 'error', message: 'Telefone inválido — mínimo 10 dígitos' });
            return;
        }
        setSaving(true);
        try {
            const digitsPhone = String(payload.phone || '').replace(/\D/g, '');
            const { turmaSelect, turmaOther, ...rest } = payload;
            await updateLead(id, {
                ...rest,
                phone: digitsPhone,
                turma: turmaValueFromForm(turmaSelect, turmaOther),
                sexo: payload.sexo || '',
            });
            setEditing(false);
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
        if (!form.name?.trim()) {
            toast.show({ type: 'error', message: 'Nome é obrigatório' });
            return;
        }
        if (!form.phone?.trim()) {
            toast.show({ type: 'error', message: 'Telefone é obrigatório' });
            return;
        }
        const digits = String(form.phone).replace(/\D/g, '');
        if (digits.length < 10) {
            toast.show({ type: 'error', message: 'Telefone inválido — mínimo 10 dígitos' });
            return;
        }
        const payload = { ...form, phone: digits };
        const hasDate = String(payload.scheduledDate || '').trim().length > 0;
        if (hasDate && lead.status !== LEAD_STATUS.CONVERTED) {
            payload.status = LEAD_STATUS.SCHEDULED;
            payload.pipelineStage = 'Aula experimental';
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
                const autoResult = await afterPresenceConfirmed({
                    lead: { ...lead, ...patch },
                    ...autoCtx,
                }).catch(() => null);
                if (autoResult) notifyAutomationFeedback(toast.addToast, autoResult);
                toast.success('Comparecimento registrado.');
            } else if (newStatus === LEAD_STATUS.MISSED) {
                const autoResult = await afterMissed({
                    lead: { ...lead, ...patch },
                    ...autoCtx,
                }).catch(() => null);
                if (autoResult) notifyAutomationFeedback(toast.addToast, autoResult);
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
                await updateLead(id, patch);
            } catch {
                await updateLead(id, patch);
            }
            const autoResult = await afterExperimentalScheduled({
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
            }).catch(() => null);
            if (autoResult) notifyAutomationFeedback(toast.addToast, autoResult);
            await refreshTimeline();
            toast.success('Aula agendada com sucesso.');
        } catch (e) {
            toast.error(e, 'save');
            throw e;
        }
    };

    const handleMarkLost = () => {
        setLostModalOpen(true);
    };

    const handleMatricularClick = () => {
        setMatriculaModalOpen(true);
    };

    const runEnrollment = async (customAnswers = {}, plan = '') => {
        let extraToast = '';
        await performEnrollment({
            lead,
            academyId,
            userId,
            permissionContext: permCtx,
            updateLead,
            customQuestions,
            customAnswers,
            plan,
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
        });
        toast.show({
            type: 'success',
            message: terms.leadMarkedConvertedToast + (extraToast ? ` ${extraToast}` : ''),
        });
    };

    const handleConfirmSimple = async (plan) => {
        setMatriculaModalOpen(false);
        setMatriculaSubmitting(true);
        try {
            await runEnrollment({}, plan);
        } catch (e) {
            toast.error(e, 'action');
        } finally {
            setMatriculaSubmitting(false);
        }
    };

    const handleConfirmFull = async (customAnswers, plan) => {
        setMatriculaSubmitting(true);
        try {
            await runEnrollment(customAnswers, plan);
            setMatriculaModalOpen(false);
            navigate(`/student/${id}?edit=enrollment`);
        } catch (e) {
            toast.error(e, 'action');
        } finally {
            setMatriculaSubmitting(false);
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

    const sendTemplateKey = async (key) => {
        if (sendingWhatsapp) return;
        setSendingWhatsapp(true);
        setTemplateMenuOpen(false);
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
                await updateLead(id, { lastWhatsappActivityAt: new Date().toISOString() });
            } catch (err) {
                console.error('Erro ao registrar evento WhatsApp', err);
            }
        } finally {
            setSendingWhatsapp(false);
        }
    };

    const handleWhatsAppPrimary = () => void sendTemplateKey('dashboard_contact');

    const focusNoteTextarea = useCallback(() => {
        requestAnimationFrame(() => {
            const el = noteTextareaRef.current;
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
        (chipText) => {
            setNote((prev) => {
                const trimmed = String(prev || '').trim();
                return trimmed ? `${trimmed} ${chipText}` : chipText;
            });
            focusNoteTextarea();
        },
        [focusNoteTextarea]
    );

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
            focusNoteTextarea();
        } catch (e) {
            toast.error(e, 'save');
        } finally {
            setAddingNote(false);
        }
    };

    const resetInlineTaskForm = useCallback(() => {
        setInlineTaskTitle('');
        setInlineTaskDue('');
        setInlineTaskOpen(false);
    }, []);

    const inlineTaskHasContent = Boolean(String(inlineTaskTitle || '').trim() || String(inlineTaskDue || '').trim());

    const requestCloseInlineTask = useCallback(() => {
        if (inlineTaskHasContent) {
            setInlineTaskDiscardOpen(true);
            return;
        }
        resetInlineTaskForm();
    }, [inlineTaskHasContent, resetInlineTaskForm]);

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
            if (created) {
                setLeadTasks((prev) => [created, ...prev]);
            }
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
                  background: '#F6EFE0',
                  color: '#8A6A2B',
                  border: '1px solid #E8D8B0',
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

    const profilePanelOpen =
        activeProfileTab === 'timeline' || activeProfileTab === 'conversation' || timelineOpen;

    const profileTabBtn = (id, label) => (
        <button
            key={id}
            type="button"
            className={`profile-tab${activeProfileTab === id ? ' is-active' : ''}`}
            onClick={() => setActiveProfileTab(id)}
        >
            {label}
        </button>
    );

    return (
        <div className={`lead-profile-container ${profilePanelOpen ? 'timeline-open' : 'timeline-closed'}`}>
            <div className="lead-profile-left-col">
                <div className="left-col-header lead-profile-left-col-header">
                    <button type="button" className="icon-btn" onClick={handleProfileBack} aria-label="Voltar">
                        <ArrowLeft size={20} />
                    </button>
                    {profileBreadcrumb && lead ? (
                        <nav className="lead-profile-breadcrumb" aria-label="Navegação">
                            <Link
                                to={profileBreadcrumb.parentTo}
                                state={profileBreadcrumb.restorePipeline ? { fresh: false } : undefined}
                                className="lead-profile-breadcrumb__parent"
                            >
                                {profileBreadcrumb.parentLabel}
                            </Link>
                            <span className="lead-profile-breadcrumb__sep" aria-hidden>
                                ›
                            </span>
                            <span className="lead-profile-breadcrumb__current" title={String(lead.name || '')}>
                                {truncateBreadcrumbName(lead.name)}
                            </span>
                        </nav>
                    ) : lead ? (
                        <span className="lead-profile-breadcrumb lead-profile-breadcrumb--solo" title={String(lead.name || '')}>
                            {truncateBreadcrumbName(lead.name)}
                        </span>
                    ) : null}
                    <div className="flex gap-2 lead-profile-header-actions">
                        {!editing ? (
                            <button type="button" className="btn-edit-header" onClick={startEdit}>
                                <Pencil size={14} /> Editar
                            </button>
                        ) : (
                            <>
                                <button type="button" className="btn-edit-header cancel" onClick={cancelEdit}><X size={14} /></button>
                                <button type="button" className="btn-edit-header save" onClick={() => void handleSave()} disabled={saving}>
                                    {saving ? '...' : <Save size={14} />}
                                </button>
                            </>
                        )}
                    </div>
                </div>

                <div className="lead-profile-tab-bar">
                    {profileTabBtn('dados', 'Dados')}
                    {profileTabBtn('timeline', 'Timeline')}
                    {showConversationTab ? profileTabBtn('conversation', 'Conversa') : null}
                </div>

                {activeProfileTab === 'dados' ? (
                <div className="left-col-content">
                    {/* Lead Header */}
                    <div className="profile-main-header">
                        {!editing ? (
                            <>
                            <div className="profile-avatar" aria-hidden>
                                {String(lead.name || '')
                                    .trim()
                                    .split(' ')
                                    .filter(Boolean)
                                    .slice(0, 2)
                                    .map((w) => w[0].toUpperCase())
                                    .join('') || '?'}
                            </div>
                            <div className="profile-id-info">
                                <h1 className="profile-name">{lead.name}</h1>
                                {pipelineStageBadge ? (
                                    <StageBadge
                                        stage={pipelineStageBadge.stageId}
                                        label={pipelineStageBadge.label}
                                        size="md"
                                        colorIndex={stages.findIndex((s) => String(s?.id || '').trim() === pipelineStageBadge.stageId)}
                                    />
                                ) : null}
                                {lead.phone && (
                                    <div className="profile-phone">
                                        <Phone size={12} />
                                        <span>{lead.phone}</span>
                                    </div>
                                )}
                            </div>
                            </>
                        ) : (
                            <>
                                <div className="flex-col gap-2 w-full mt-2 lead-profile-edit-fields">
                                    <input name="name" value={form.name} onChange={onChange} className="form-input-sm" placeholder="Nome" />
                                    <input
                                        name="phone"
                                        value={form.phone}
                                        onChange={(e) => setForm((f) => ({ ...f, phone: maskPhone(e.target.value) }))}
                                        className="form-input-sm"
                                        type="tel"
                                        inputMode="numeric"
                                        placeholder="Telefone"
                                    />
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
                                                <span className="info-mini-label info-mini-label--start">Responsável</span>
                                                <input
                                                    className="form-input-sm"
                                                    type="text"
                                                    value={form.parentName}
                                                    onChange={(e) => setForm((f) => ({ ...f, parentName: e.target.value }))}
                                                    placeholder="Nome do responsável"
                                                />
                                            </div>
                                            <div className="flex-col gap-1">
                                                <span className="info-mini-label info-mini-label--start">Idade</span>
                                                <input
                                                    className="form-input-sm"
                                                    type="number"
                                                    value={form.age}
                                                    onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
                                                    placeholder="Ex: 8"
                                                />
                                            </div>
                                        </div>
                                    )}
                                    <div className="flex-col gap-1 mt-3">
                                        <span className="info-mini-label info-mini-label--start">Origem</span>
                                        <select
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
                                </div>
                            </>
                        )}
                    </div>

                    {/* Status e Tags */}
                    <div className="profile-section">
                        <div className="lead-status-row flex items-center gap-2 flex-wrap mb-3">
                            <span
                                className="lead-contact-label"
                            >
                                {contactType === 'student' ? terms.student : contactLabel}
                            </span>
                            <span
                                className="status-tag lead-profile-status-tag"
                                style={statusBadgeStyle}
                            >
                                {operationalStatusDisplayLabel(terms, lead.status)}
                            </span>
                            {!editing && lead.origin && (
                                <span className="status-tag origin-status-tag">{lead.origin}</span>
                            )}
                        </div>

                    </div>

                    {/* Comunicação */}
                    <div className="profile-section">
                        <ReportSectionHeading title="Comunicação" className="lead-profile-section-heading" />
                        <div className="comm-actions-wrap lead-profile-comm-actions">
                            {normalizeLeadPhoneForInbox(lead.phone) ? (
                                <button
                                    type="button"
                                    className="btn btn-outline lead-profile-inbox-btn"
                                    onClick={() =>
                                        navigate(`/inbox?phone=${encodeURIComponent(normalizeLeadPhoneForInbox(lead.phone))}`)
                                    }
                                >
                                    <MessageCircle size={16} aria-hidden />
                                    Abrir conversa
                                </button>
                            ) : null}
                            <button
                                type="button"
                                className="comm-btn-primary btn-wa"
                                disabled={!normalizeLeadPhoneForInbox(lead.phone) || sendingWhatsapp}
                                onClick={() => handleWhatsAppPrimary()}
                            >
                                <MessageCircle size={16} /> {sendingWhatsapp ? 'Enviando…' : 'WhatsApp'}
                            </button>
                            <button
                                type="button"
                                className="comm-btn-dropdown"
                                disabled={!String(lead.phone || '').replace(/\D/g, '').length || sendingWhatsapp}
                                aria-label="Abrir opções de mensagem no WhatsApp"
                                title="Mais opções de WhatsApp"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setTemplateMenuOpen((o) => !o);
                                }}
                            >
                                <MoreVertical size={18} aria-hidden />
                            </button>

                            {templateMenuOpen && (
                                <div className="navi-menu__panel comm-dropdown-menu">
                                    {Object.entries(waCtx.templates)
                                        .filter(([, text]) => typeof text === 'string' && String(text).trim())
                                        .map(([key]) => (
                                            <button
                                                key={key}
                                                type="button"
                                                className="navi-menu__item comm-dropdown-item"
                                                onClick={() => void sendTemplateKey(key)}
                                            >
                                                {WHATSAPP_TEMPLATE_LABELS[key] || key}
                                            </button>
                                        ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Agendamento */}
                    <div className="profile-section">
                        <ReportSectionHeading title="Agendamento" className="lead-profile-section-heading" />
                        {lead.scheduledDate ? (
                            <div className="schedule-card">
                                <div className="schedule-info">
                                    <Calendar size={14} />
                                    <span>{new Date(lead.scheduledDate + 'T00:00:00').toLocaleDateString('pt-BR')} às {lead.scheduledTime || '--:--'}</span>
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
                                <p className="text-muted text-xs">Sem {terms.trial.toLowerCase()} agendada.</p>
                                <button
                                    type="button"
                                    className="btn-next-step"
                                    onClick={() => setScheduleModalOpen(true)}
                                    disabled={updatingStatus}
                                >
                                    <Calendar size={14} /> Agendar primeira aula
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Próximos Passos */}
                    <div className="profile-section">
                        <ReportSectionHeading title="Próximos Passos" className="lead-profile-section-heading" />
                        <div className="flex-col gap-2">
                            {lead.scheduledDate && (
                                <button
                                    type="button"
                                    className="btn-next-step"
                                    onClick={() => setScheduleModalOpen(true)}
                                    disabled={updatingStatus}
                                >
                                    <Calendar size={14} /> Agendar nova data
                                </button>
                            )}
                            
                            {canShowLeadCloseSale(lead) ? (
                                <button
                                    type="button"
                                    className="btn-next-step btn-primary-action"
                                    onClick={() => setCloseSaleOpen(true)}
                                    disabled={updatingStatus}
                                >
                                    <BadgeCheck size={14} /> Fechar venda
                                </button>
                            ) : null}
                            {lead.status !== LEAD_STATUS.CONVERTED && (
                                <button
                                    type="button"
                                    className="btn-next-step btn-primary-action highlight"
                                    onClick={handleMatricularClick}
                                    disabled={updatingStatus}
                                >
                                    <UserCheck size={14} /> {terms.enrollment}
                                </button>
                            )}
                            {lead.status !== LEAD_STATUS.LOST && (
                                <div className="next-step-danger-wrap">
                                    <button
                                        type="button"
                                        className="btn-next-step danger"
                                        onClick={handleMarkLost}
                                    >
                                        <AlertTriangle size={14} /> Marcar como perdido
                                    </button>
                                </div>
                            )}
                        </div>
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
                                    className="input-field"
                                    placeholder="Descrever a tarefa..."
                                    value={inlineTaskTitle}
                                    onChange={(e) => setInlineTaskTitle(e.target.value)}
                                    autoFocus
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
                    {!editing && (lead.sexo || lead.turma || lead.className) ? (
                        <div className="profile-section extra-info">
                            <ReportSectionHeading title="Dados pessoais" className="lead-profile-section-heading" />
                            <div className="flex-col gap-2">
                                {lead.sexo ? (
                                    <div className="info-mini-row">
                                        <span className="info-mini-label">Sexo:</span>
                                        <span className="info-mini-value">{sexoDisplayLabel(lead.sexo)}</span>
                                    </div>
                                ) : null}
                                {String(lead.turma || lead.className || '').trim() ? (
                                    <div className="info-mini-row">
                                        <span className="info-mini-label">Turma:</span>
                                        <span className="info-mini-value">{String(lead.turma || lead.className).trim()}</span>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    ) : null}

                    {!editing && hasOtherDetails && (
                        <div className="profile-section extra-info">
                            <ReportSectionHeading title="Outros detalhes" className="lead-profile-section-heading" />
                            <div className="flex-col gap-2">
                                {lead.parentName && (
                                    <div className="info-mini-row">
                                        <span className="info-mini-label">Responsável:</span>
                                        <span className="info-mini-value">{lead.parentName}</span>
                                    </div>
                                )}
                                {lead.age && (
                                    <div className="info-mini-row">
                                        <span className="info-mini-label">Idade:</span>
                                        <span className="info-mini-value">{lead.age} anos</span>
                                    </div>
                                )}
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
                ) : null}

                {activeProfileTab === 'dados' ? (
                <div className="left-col-footer">
                    <button
                        type="button"
                        className="btn-toggle-timeline"
                        onClick={() => {
                            setActiveProfileTab('timeline');
                            setTimelineOpen(true);
                        }}
                    >
                        <span className="lead-profile-next-step-icon"><ArrowRight size={16} /></span>
                        Abrir histórico →
                    </button>
                </div>
                ) : null}
            </div>

            <div className={`lead-profile-right-panel ${profilePanelOpen ? 'open' : 'closed'}`}>
                {activeProfileTab === 'conversation' && showConversationTab ? (
                    <ProfileConversationTab
                        phone={lead.phone}
                        academyId={academyId}
                        leadName={lead.name}
                    />
                ) : null}
                {activeProfileTab === 'timeline' ? (
                <>
                <div className="timeline-header">
                    <h2 className="timeline-title">Linha do tempo</h2>
                    <div className="filter-strip">
                        <button type="button" className={`filter-pill${eventTypeFilter === 'all' ? ' active' : ''}`} onClick={() => setEventTypeFilter('all')}>Todos</button>
                        <button type="button" className={`filter-pill${eventTypeFilter === 'message' ? ' active' : ''}`} onClick={() => setEventTypeFilter('message')}>Mensagens</button>
                        <button type="button" className={`filter-pill${eventTypeFilter === 'schedule' ? ' active' : ''}`} onClick={() => setEventTypeFilter('schedule')}>Agendamentos</button>
                        <button type="button" className={`filter-pill${eventTypeFilter === 'stage_change' ? ' active' : ''}`} onClick={() => setEventTypeFilter('stage_change')}>Mudanças</button>
                        <button type="button" className={`filter-pill${eventTypeFilter === 'note' ? ' active' : ''}`} onClick={() => setEventTypeFilter('note')}>Notas</button>
                    </div>
                </div>

                <div className="timeline-input-zone">
                    <div className="note-container">
                        <textarea
                            ref={noteTextareaRef}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder={`Adicione uma observação sobre este ${contactLabel.toLowerCase()}...`}
                            className="timeline-textarea"
                            rows={3}
                        />
                        <div className="lead-profile-quick-note-chips">
                            {LEAD_PROFILE_QUICK_NOTE_CHIPS.map((chip) => (
                                <button
                                    key={chip}
                                    type="button"
                                    className="lead-profile-quick-note-chip"
                                    onClick={() => applyQuickNoteChip(chip)}
                                >
                                    {chip}
                                </button>
                            ))}
                        </div>
                        <button 
                            type="button" 
                            className="btn-send-note" 
                            onClick={() => void addNote()} 
                            disabled={!note.trim() || addingNote}
                        >
                            <Send size={16} aria-hidden className="send-note-icon" />
                        </button>
                    </div>
                </div>

                <div className="timeline-content">
                    {timelineError && (
                        <div className="timeline-error-banner">
                            <span>Não foi possível carregar o histórico.</span>
                            <button type="button" className="btn-outline" onClick={() => void refreshTimeline()}>Tentar novamente</button>
                        </div>
                    )}

                    {!timelineError && filteredTimelineEvents.length === 0 && (
                        <EmptyState variant="compact" tone="dashed" title="Nenhum evento registrado." role="status" />
                    )}

                    {!timelineError && filteredTimelineEvents.length > 0 && (
                        <div className="timeline-events-list">
                            <div className="timeline-vertical-line"></div>
                            {filteredTimelineEvents.map((n, i) => {
                                const when = new Date(n.at || n.date).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
                                const type = n.type || 'note';
                                const tag =
                                    type === 'converted' ? terms.convertedStatusUi : TIMELINE_EVENT_LABELS[type] ?? type;
                                
                                let dotColor = '#8E8E8E';
                                if (type === 'note' || type === 'inbox_note') dotColor = 'var(--petroleo)';
                                else if (type === 'message' || type === 'whatsapp_template_sent') dotColor = '#25D366';
                                else if (type === 'schedule') dotColor = '#0088CC';
                                else if (type === 'followup_done') dotColor = '#2E7D32';
                                else if (type === 'task_created') dotColor = 'var(--petroleo)';
                                else if (type === 'task_done') dotColor = '#2E7D32';
                                else if (['stage_change', 'attended', 'missed', 'converted', 'lost'].includes(type)) dotColor = '#888780';
                                else if (type === 'pipeline_change') dotColor = '#F5A623';

                                let label = n.text || '';
                                if (type === 'schedule') {
                                    label = `Agendado para ${n.date} ${n.time || ''}`.trim();
                                } else if (type === 'followup_done') {
                                    label = n.text || 'Follow-up marcado como concluído';
                                } else if (type === 'task_done') {
                                    label = n.text || 'Tarefa marcada como concluída';
                                } else if (type === 'stage_change' || type === 'pipeline_change') {
                                    label = `De ${humanizeTimelineStage(n.from, stages, terms)} para ${humanizeTimelineStage(n.to, stages, terms)}`;
                                } else if (type === 'inbox_note') {
                                    label = (
                                        <span>
                                            {n.text}
                                            <span className="inbox-tag">· Inbox</span>
                                        </span>
                                    );
                                } else if (type === 'whatsapp_template_sent') {
                                    label = n.text || 'Mensagem automática enviada';
                                }

                                const isPinned = Boolean(n.is_pinned);
                                const canPin = type === 'note' || type === 'inbox_note';

                                return (
                                    <div key={i} className={`timeline-event-item ${isPinned ? 'pinned' : ''}`}>
                                        <div className="event-dot" style={{ backgroundColor: dotColor }}></div>
                                        <div className="event-body">
                                            <div className="event-header">
                                                <span className="event-type-label">{tag}</span>
                                                <span className="event-date">{when}</span>
                                                {canPin && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleTogglePin(n)}
                                                        className="event-pin-btn"
                                                        title={isPinned ? 'Desafixar' : 'Fixar'}
                                                    >
                                                        <Pin size={12} fill={isPinned ? 'currentColor' : 'none'} style={{ transform: isPinned ? 'none' : 'rotate(45deg)' }} />
                                                    </button>
                                                )}
                                            </div>
                                            <div className="event-message">{label}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
                </>
                ) : null}
            </div>

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

            <LeadCloseSaleModal
                open={closeSaleOpen}
                lead={lead}
                academyId={academyId}
                userId={userId}
                permissionContext={permCtx}
                onClose={() => {
                    setCloseSaleOpen(false);
                    void refreshTimeline();
                }}
            />

            <MatriculaModal
                isOpen={matriculaModalOpen}
                enrollmentQuestions={customQuestions}
                financeConfig={financeConfig}
                submitting={matriculaSubmitting}
                onClose={() => {
                    if (matriculaSubmitting) return;
                    setMatriculaModalOpen(false);
                }}
                onConfirmSimple={handleConfirmSimple}
                onConfirmFull={handleConfirmFull}
            />
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

            <ScheduleModal
                open={scheduleModalOpen}
                onClose={() => setScheduleModalOpen(false)}
                onConfirm={onConfirmScheduleFromModal}
                lead={lead}
                quickTimes={profileQuickTimes}
                initialDate={lead?.scheduledDate || ''}
                initialTime={lead?.scheduledTime || ''}
            />
</div>
    );
};

export default LeadProfile;
