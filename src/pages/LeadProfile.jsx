import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { addLeadEvent, getLeadEvents, updateLeadEvent } from '../lib/leadEvents.js';
import { useParams, useNavigate } from 'react-router-dom';
import { useLeadStore, LEAD_STATUS, LEAD_ORIGIN } from '../store/useLeadStore';
import { useStudentStore } from '../store/useStudentStore';
import { useTaskStore } from '../store/useTaskStore';
import { progressLabelForLead } from '../lib/taskTemplates.js';
import { useUiStore } from '../store/useUiStore';
import { useToast } from '../hooks/useToast';
import { ArrowLeft, ArrowRight, ChevronRight, ChevronDown, MessageCircle, Calendar, UserCheck, Phone, Send, Clock, Copy, Check, Pencil, X, Save, AlertTriangle, Trash2, StickyNote, Pin, Baby, Users, Dumbbell, CheckSquare, BadgeCheck } from 'lucide-react';
import LeadCloseSaleModal from '../components/sales/LeadCloseSaleModal.jsx';
import { canShowLeadCloseSale } from '../lib/leadCloseSale.js';
import { databases, DB_ID, ACADEMIES_COL, account, createSessionJwt } from '../lib/appwrite';
import LabelPill from '../components/shared/LabelPill';
import LabelSelector from '../components/shared/LabelSelector';
import { DEFAULT_WHATSAPP_TEMPLATES, WHATSAPP_TEMPLATE_LABELS } from '../../lib/whatsappTemplateDefaults.js';
import { useWhatsappTemplates } from '../lib/useWhatsappTemplates.js';
import { sendWhatsappTemplateOutbound } from '../lib/outboundWhatsappTemplate.js';
import { LostReasonModal } from '../components/LostReasonModal';
import ConfirmDialog from '../components/shared/ConfirmDialog.jsx';
import MatriculaModal from '../components/MatriculaModal';
import { performEnrollment } from '../lib/performEnrollment.js';
import NlCommandBar, { NlCommandBarTrigger } from '../components/NlCommandBar';
import { getStudentPayments } from '../lib/studentPayments';
import { LEAD_TIMELINE_CHANGED, emitLeadTimelineChanged } from '../lib/leadTimelineEvents.js';
import { PIPELINE_WAITING_DECISION_STAGE, PIPELINE_STAGES } from '../constants/pipeline.js';
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
import ProfileConversationTab from '../components/inbox/ProfileConversationTab.jsx';
import {
  useTerms,
  contactLabelSingular,
  operationalStatusDisplayLabel,
  pipelineStageDisplayLabel,
} from '../lib/terminology.js';
import EmptyState from '../components/shared/EmptyState.jsx';
import { useAcademyLabels } from '../hooks/useAcademyLabels.js';

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
    [LEAD_STATUS.NEW]: { bg: 'var(--accent-light)', color: 'var(--accent)' },
    [LEAD_STATUS.SCHEDULED]: { bg: 'var(--warning-light)', color: 'var(--warning)' },
    [LEAD_STATUS.COMPLETED]: { bg: 'var(--success-light)', color: 'var(--success)' },
    [LEAD_STATUS.MISSED]: { bg: 'var(--danger-light)', color: 'var(--danger)' },
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

const LeadProfile = () => {
    const { id } = useParams();
    const navigate = useNavigate();
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

    const academyNameDisplay = useMemo(() => {
        const cur = (academyList || []).find((a) => a.id === academyId);
        return String(cur?.name || '').trim();
    }, [academyList, academyId]);

    const [nlOpen, setNlOpen] = useState(false);
    const [studentPayments, setStudentPayments] = useState([]);
    const [leadTasks, setLeadTasks] = useState([]);
    const leadTaskProgress = useMemo(() => progressLabelForLead(id, leadTasks), [id, leadTasks]);

    useEffect(() => {
        if (!id || !academyId) return;
        let cancelled = false;
        createSessionJwt().then(jwt => {
            if (!jwt || cancelled) return;
            fetch(`/api/tasks?academy_id=${encodeURIComponent(academyId)}&lead_id=${encodeURIComponent(id)}`, {
                headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': academyId }
            }).then(r => r.json()).then(data => {
                if (!cancelled && data.sucesso) {
                    setLeadTasks(data.tasks || []);
                }
            }).catch(() => {});
        });
        return () => { cancelled = true; };
    }, [id, academyId]);

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

    /** Financeiro + funil no mesmo assistente (validação no servidor só bloqueia em contextos exclusivos). */
    const nlCommandContext = 'perfil';

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

    const { allLabels } = useAcademyLabels(academyId, {
        onLoadError: () => toast.show({ type: 'error', message: 'Não foi possível carregar etiquetas.' }),
    });

    const [note, setNote] = useState('');
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
            <div className="container lead-profile-loading" style={{ paddingTop: 24, paddingBottom: 40 }}>
                <div className="lead-profile-inner">
                    <div className="lead-profile-skeleton-bar lead-profile-skeleton-bar--title" aria-hidden />
                    <div className="lead-profile-skeleton-card mt-4">
                        <div className="lead-profile-skeleton-bar lead-profile-skeleton-bar--line" />
                        <div className="lead-profile-skeleton-bar lead-profile-skeleton-bar--line short" />
                        <div className="lead-profile-skeleton-bar lead-profile-skeleton-bar--line" />
                    </div>
                    <p className="text-small text-light mt-4" style={{ textAlign: 'center' }}>Carregando perfil…</p>
                </div>
            </div>
        );
    }

    if (!lead) {
        return (
            <div className="container" style={{ paddingTop: 40, textAlign: 'center' }}>
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
        } catch (e) {
            toast.error(e, 'save');
        } finally {
            setAddingNote(false);
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

    const handleLabelsChange = async (newIds) => {
        try {
            await updateLead(id, { label_ids: newIds });
            toast.success('Etiquetas atualizadas.');
        } catch (e) {
            toast.error(e, 'save');
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
            onClick={() => setActiveProfileTab(id)}
            style={{
                flexShrink: 0,
                padding: '8px 14px',
                borderRadius: 8,
                border: 'none',
                background: activeProfileTab === id ? 'var(--surface)' : 'transparent',
                color: activeProfileTab === id ? 'var(--text)' : 'var(--text-secondary)',
                fontWeight: activeProfileTab === id ? 800 : 600,
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'inherit',
                boxShadow: activeProfileTab === id ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
            }}
        >
            {label}
        </button>
    );

    return (
        <div className={`lead-profile-container ${profilePanelOpen ? 'timeline-open' : 'timeline-closed'}`}>
            <div className="lead-profile-left-col">
                <div className="left-col-header">
                    <button type="button" className="icon-btn" onClick={() => navigate(-1)}>
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex gap-2" style={{ marginLeft: 'auto', alignItems: 'center' }}>
                        <NlCommandBarTrigger onClick={() => setNlOpen(true)} />
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

                <div
                    style={{
                        padding: '8px 16px',
                        display: 'flex',
                        gap: 6,
                        borderBottom: '1px solid var(--border-light)',
                        flexShrink: 0,
                        overflowX: 'auto',
                        WebkitOverflowScrolling: 'touch',
                    }}
                >
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
                                                <span className="info-mini-label" style={{ alignSelf: 'flex-start' }}>Responsável</span>
                                                <input
                                                    className="form-input-sm"
                                                    type="text"
                                                    value={form.parentName}
                                                    onChange={(e) => setForm((f) => ({ ...f, parentName: e.target.value }))}
                                                    placeholder="Nome do responsável"
                                                />
                                            </div>
                                            <div className="flex-col gap-1">
                                                <span className="info-mini-label" style={{ alignSelf: 'flex-start' }}>Idade</span>
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
                                        <span className="info-mini-label" style={{ alignSelf: 'flex-start' }}>Origem</span>
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
                                                    <span className="info-mini-label" style={{ alignSelf: 'flex-start' }}>Data da aula</span>
                                                    <DateInputField
                                                        className="form-input-sm"
                                                        type="date"
                                                        value={form.scheduledDate}
                                                        onChange={(e) => setForm((f) => ({ ...f, scheduledDate: e.target.value }))}
                                                    />
                                                </div>
                                                <div className="flex-col gap-1">
                                                    <span className="info-mini-label" style={{ alignSelf: 'flex-start' }}>Horário</span>
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
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                                            <div className="flex-col gap-1">
                                                <span className="info-mini-label" style={{ alignSelf: 'flex-start' }}>Data de nascimento</span>
                                                <DateInputField
                                                    className="form-input-sm"
                                                    type="date"
                                                    value={form.birthDate}
                                                    onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
                                                />
                                            </div>
                                            <div className="flex-col gap-1">
                                                <span className="info-mini-label" style={{ alignSelf: 'flex-start' }}>Sexo</span>
                                                <SexoSelect
                                                    className="form-input-sm"
                                                    value={form.sexo}
                                                    onChange={(v) => setForm((f) => ({ ...f, sexo: v }))}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex-col gap-1">
                                            <span className="info-mini-label" style={{ alignSelf: 'flex-start' }}>Turma</span>
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
                                            <span className="info-mini-label" style={{ alignSelf: 'flex-start' }}>Primeira experiência?</span>
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
                                className="status-tag"
                                style={{
                                    ...statusBadgeStyle,
                                    fontFamily: 'Arial, sans-serif',
                                    fontWeight: 600,
                                    fontStyle: 'normal',
                                }}
                            >
                                {operationalStatusDisplayLabel(terms, lead.status)}
                            </span>
                            {!editing && lead.origin && (
                                <span className="status-tag origin-status-tag">{lead.origin}</span>
                            )}
                        </div>

                        {!editing && (
                            <div className="flex flex-wrap gap-1 mt-3">
                                {(lead.labelIds || []).map((labelId) => {
                                    const label = allLabels.find((l) => l.$id === labelId);
                                    if (!label) return null;
                                    return (
                                        <LabelPill
                                            key={labelId}
                                            label={label}
                                            onRemove={() => handleLabelsChange((lead.labelIds || []).filter((x) => x !== labelId))}
                                        />
                                    );
                                })}
                                <LabelSelector
                                    allLabels={allLabels}
                                    selectedIds={lead.labelIds || []}
                                    onChange={handleLabelsChange}
                                />
                            </div>
                        )}
                    </div>

                    {/* Comunicação */}
                    <div className="profile-section">
                        <h3 className="section-title">Comunicação</h3>
                        <div className="comm-actions-wrap" style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                            {normalizeLeadPhoneForInbox(lead.phone) ? (
                                <button
                                    type="button"
                                    className="btn btn-outline"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40 }}
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
                                className="comm-btn-primary"
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
                                <span className="ti ti-dots-vertical" aria-hidden />
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
                        <h3 className="section-title">Agendamento</h3>
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
                                        className="btn-state-attended"
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
                        <h3 className="section-title">Próximos Passos</h3>
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
                                    className="btn-next-step"
                                    style={{
                                        background: 'var(--accent)',
                                        color: '#fff',
                                        border: 'none',
                                    }}
                                    onClick={() => setCloseSaleOpen(true)}
                                    disabled={updatingStatus}
                                >
                                    <BadgeCheck size={14} /> Fechar venda
                                </button>
                            ) : null}
                            {lead.status !== LEAD_STATUS.CONVERTED && (
                                <button
                                    type="button"
                                    className="btn-next-step highlight"
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <h3 className="section-title" style={{ margin: 0 }}>Tarefas</h3>
                            {leadTaskProgress ? (
                                <span className="badge-secondary" style={{ fontSize: 10, borderRadius: 999, padding: '2px 8px' }}>
                                    {leadTaskProgress}
                                </span>
                            ) : null}
                            </div>
                            {leadTasks.length > 0 && (
                                <button
                                    type="button"
                                    className="btn-action-ghost"
                                    style={{ fontSize: 11, padding: '2px 6px', color: 'var(--accent)' }}
                                    onClick={() => navigate(`/tarefas?lead_id=${id}&new=1`)}
                                >
                                    <CheckSquare size={12} style={{ marginRight: 4 }} /> + Nova
                                </button>
                            )}
                        </div>
                        {leadTasks.length === 0 ? (
                            <EmptyState
                                variant="compact"
                                tone="dashed"
                                title="Nenhuma tarefa"
                                primaryAction={{
                                    label: '+ Nova tarefa',
                                    onClick: () => navigate(`/tarefas?lead_id=${id}&new=1`),
                                }}
                                role="status"
                            />
                        ) : (
                            <div className="flex-col gap-2">
                                {leadTasks.slice(0, 5).map(t => (
                                    <div key={t.id} className={`task-row ${t.status === 'done' ? 'done' : ''}`}>
                                        <input 
                                            type="checkbox" 
                                            checked={t.status === 'done'} 
                                            onChange={() => toggleLeadTask(t)} 
                                            style={{ cursor: 'pointer' }}
                                        />
                                        <span className="task-title">{t.title}</span>
                                        {(t.due_date || t.dueDate) && (
                                            <span className="task-due">
                                                {new Date((t.due_date || t.dueDate) + 'T00:00:00').toLocaleDateString('pt-BR')}
                                            </span>
                                        )}
                                    </div>
                                ))}
                                {leadTasks.length > 5 && (
                                    <button 
                                        type="button" 
                                        className="btn-action-ghost" 
                                        style={{ fontSize: 12, marginTop: 4 }}
                                        onClick={() => navigate(`/tarefas?lead_id=${id}`)}
                                    >
                                        Ver todas ({leadTasks.length})
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Dados Adicionais (Preservados do original, mas agora em lista) */}
                    {!editing && (lead.sexo || lead.turma || lead.className) ? (
                        <div className="profile-section extra-info">
                            <h3 className="section-title">Dados pessoais</h3>
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
                            <h3 className="section-title">Outros detalhes</h3>
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
                        <span className="ti ti-trash" aria-hidden style={{ fontSize: 14, lineHeight: 1 }} />
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
                        <span style={{ order: 2 }}><ArrowRight size={16} /></span>
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
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder={`Adicione uma observação sobre este ${contactLabel.toLowerCase()}...`}
                            className="timeline-textarea"
                            rows={3}
                        />
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

            <NlCommandBar
                open={nlOpen}
                onOpenChange={setNlOpen}
                academyName={academyNameDisplay}
                context={nlCommandContext}
                pipelineStages={stages}
                recentPayments={recentPaymentsForNl}
            />

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes leadProfileSk { from { background-position: 200% 0; } to { background-position: -200% 0; } }
                .lead-profile-skeleton-bar {
                    border-radius: 10px;
                    background: linear-gradient(90deg, rgba(148,163,184,0.12) 25%, rgba(148,163,184,0.24) 50%, rgba(148,163,184,0.12) 75%);
                    background-size: 200% 100%;
                    animation: leadProfileSk 1.2s ease-in-out infinite;
                }
                .lead-profile-skeleton-bar--title { width: 55%; max-width: 240px; height: 22px; }
                .lead-profile-skeleton-bar--line { margin-top: 14px; width: 100%; height: 14px; }
                .lead-profile-skeleton-bar--line.short { width: 72%; }
                .lead-profile-skeleton-card {
                    border-radius: var(--radius);
                    border: 1px solid var(--border);
                    background: var(--surface);
                    padding: 20px 18px;
                }
                .lead-profile-inner {
                    max-width: min(100%, 42rem);
                    margin-left: auto;
                    margin-right: auto;
                }

                .lead-profile-container {
                    display: flex;
                    height: 100%;
                    overflow: hidden;
                    background: var(--surface-hover);
                    transition: all 0.3s ease;
                }

                /* Coluna Esquerda */
                .lead-profile-left-col {
                    display: flex;
                    flex-direction: column;
                    background: var(--surface);
                    border-right: 1px solid var(--border);
                    height: 100%;
                    z-index: 10;
                    min-width: 0;
                    transition: width 0.25s ease, flex 0.25s ease, max-width 0.25s ease;
                }

                .timeline-open .lead-profile-left-col {
                    width: 360px;
                    flex: 0 0 auto;
                    flex-shrink: 0;
                    flex-grow: 0;
                    max-width: 100%;
                }

                .timeline-closed .lead-profile-left-col {
                    flex: 1;
                    max-width: 560px;
                    width: auto;
                }

                .left-col-header {
                    padding: 16px;
                    display: flex;
                    align-items: center;
                    border-bottom: 1px solid var(--border-light);
                }

                .left-col-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 24px;
                }

                .left-col-footer {
                    padding: 16px;
                    border-top: 1px solid var(--border-light);
                    background: var(--surface);
                }

                .timeline-closed .left-col-footer {
                    display: flex;
                    justify-content: flex-end;
                }

                /* Seções do Perfil */
                .profile-main-header {
                    display: flex;
                    flex-direction: row;
                    align-items: flex-start;
                    gap: 14px;
                }

                .profile-avatar {
                    width: 52px;
                    height: 52px;
                    border-radius: 50%;
                    background: var(--v100);
                    border: 0.5px solid var(--border-violet);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    font-size: 18px;
                    font-weight: 700;
                    color: var(--v700);
                    letter-spacing: -0.02em;
                    overflow: hidden;
                }

                .profile-id-info {
                    flex: 1;
                    min-width: 0;
                }

                .profile-name {
                    font-size: 1.125rem;
                    font-weight: 700;
                    color: var(--text);
                    margin: 0 0 4px;
                }

                .profile-phone {
                    display: flex;
                    align-items: center;
                    justify-content: flex-start;
                    gap: 6px;
                    font-size: 13px;
                    color: var(--text-secondary);
                }

                .section-title {
                    font-size: 11px;
                    font-weight: 500;
                    letter-spacing: 0.04em;
                    color: var(--color-text-tertiary, var(--text-muted));
                    margin: 0 0 8px;
                }

                .profile-section {
                    padding-top: 20px;
                    padding-bottom: 4px;
                    border-top: 0.5px solid var(--color-border-tertiary, var(--border-light));
                }

                .profile-section:first-of-type {
                    border-top: none;
                    padding-top: 0;
                }

                /* Mini Rows */
                .info-mini-row {
                    display: flex;
                    justify-content: space-between;
                    font-size: 13px;
                    padding: 4px 0;
                }

                .info-mini-label { color: var(--text-muted); }
                .info-mini-value { color: var(--text); font-weight: 600; }
                .info-meta-grid {
                    display: grid;
                    grid-template-columns: 120px 1fr;
                    gap: 6px 8px;
                    font-size: 13px;
                }
                .info-meta-grid .info-mini-label {
                    color: var(--color-text-secondary, var(--text-secondary));
                }
                .info-meta-grid .info-mini-value {
                    color: var(--color-text-primary, var(--text));
                    font-weight: 500;
                }
                .lead-contact-label {
                    color: var(--color-text-secondary, var(--text-secondary));
                    font-size: 13px;
                    font-weight: 500;
                    line-height: 1.2;
                    font-style: normal;
                }
                .status-tag {
                    border-radius: 20px;
                    padding: 2px 8px;
                    font-size: 11px;
                    line-height: 1.2;
                }
                .origin-status-tag {
                    display: inline-flex;
                    align-items: center;
                    background: var(--color-background-secondary, var(--surface-hover)) !important;
                    border: 0.5px solid var(--color-border-secondary, var(--border)) !important;
                    color: var(--color-text-secondary, var(--text-secondary)) !important;
                    font-size: 11px;
                    padding: 2px 8px;
                    border-radius: 20px;
                    font-weight: 500;
                }
                .contact-type-badge,
                .status-tag {
                    font-family: var(--font-sans, Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif) !important;
                }
                .lead-status-row,
                .lead-status-row * {
                    font-family: var(--font-sans, Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif) !important;
                }
                .lead-status-row .contact-type-badge,
                .lead-status-row .status-tag {
                    font-family: Arial, sans-serif !important;
                    font-style: normal !important;
                }

                /* Botões de Perfil */
                .btn-edit-header {
                    padding: 6px 12px;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 700;
                    border: 1px solid var(--border);
                    background: var(--surface);
                    color: var(--text-secondary);
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    cursor: pointer;
                }
                .btn-edit-header.save { background: var(--accent); color: white; border: none; }
                .btn-edit-header.cancel { color: var(--danger); }

                .form-input-sm {
                    width: 100%;
                    padding: 8px 12px;
                    border-radius: 8px;
                    border: 1px solid var(--border);
                    font-size: 13px;
                    background: var(--surface-hover);
                }

                .profile-main-header .lead-profile-edit-sections {
                    text-align: left;
                    align-self: stretch;
                }
                .lead-profile-edit-section-title {
                    text-align: left;
                    margin-bottom: 10px !important;
                }
                .lead-profile-type-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                    gap: 8px;
                }
                .lead-profile-type-option {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 10px 6px;
                    border: 2px solid var(--border);
                    border-radius: var(--radius-sm);
                    text-align: center;
                    cursor: pointer;
                    gap: 4px;
                    background: var(--surface-hover);
                }
                .lead-profile-type-option input { display: none; }
                .lead-profile-type-icon { color: var(--text-muted); }
                .lead-profile-type-name { font-size: 11px; font-weight: 700; color: var(--text-secondary); }
                .lead-profile-type-option.selected {
                    border-color: var(--accent);
                    background: var(--accent-light);
                }
                .lead-profile-type-option.selected .lead-profile-type-icon,
                .lead-profile-type-option.selected .lead-profile-type-name { color: var(--accent); }
                .lead-profile-radio-row {
                    display: flex;
                    gap: 16px;
                    flex-wrap: wrap;
                    padding: 4px 0;
                }
                .lead-profile-inline-radio {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 13px;
                    color: var(--text);
                    cursor: pointer;
                }

                /* Comunicação */
                .comm-actions-wrap {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                .comm-btn-primary {
                    flex: 1;
                    height: 40px;
                    background: var(--accent);
                    color: white;
                    border: none;
                    border-radius: 10px;
                    font-weight: 700;
                    font-size: 13px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    cursor: pointer;
                }
                .comm-btn-primary:hover { filter: brightness(0.96); }
                .comm-btn-primary:focus-visible {
                    outline: 2px solid color-mix(in srgb, var(--accent) 45%, white);
                    outline-offset: 2px;
                }

                .comm-btn-dropdown {
                    width: 44px;
                    height: 44px;
                    background: var(--color-background-secondary, var(--surface-hover));
                    color: var(--color-text-primary, var(--text));
                    border: 0.5px solid var(--color-border-secondary, var(--border));
                    border-radius: var(--border-radius-md, 10px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                }
                .comm-btn-dropdown .ti {
                    font-size: 18px;
                    color: var(--color-text-primary, var(--text));
                    line-height: 1;
                }
                .comm-btn-dropdown:hover { background: var(--surface); }
                .comm-btn-dropdown:focus-visible {
                    outline: 2px solid color-mix(in srgb, var(--accent) 35%, white);
                    outline-offset: 2px;
                }

                .comm-dropdown-menu {
                    left: 0;
                    right: 0;
                    max-height: 200px;
                    overflow-y: auto;
                    z-index: 100;
                }

                /* Agendamento Card */
                .schedule-card {
                    background: var(--surface-hover);
                    border: 1px solid var(--border);
                    border-radius: 12px;
                    padding: 12px;
                }

                .schedule-info {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 13px;
                    font-weight: 700;
                    color: var(--text);
                }

                .btn-state-attended {
                    flex: 1;
                    padding: 8px;
                    background: var(--accent);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 700;
                    cursor: pointer;
                }

                .btn-state-missed {
                    flex: 1;
                    padding: 8px;
                    background: var(--color-background-secondary, var(--surface-hover));
                    color: var(--color-text-secondary, var(--text-secondary));
                    border: 0.5px solid var(--color-border-secondary, var(--border));
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 700;
                    cursor: pointer;
                }

                /* Próximos Passos */
                .btn-next-step {
                    width: 100%;
                    padding: 10px 16px;
                    border-radius: 10px;
                    border: 1.5px solid var(--border);
                    background: var(--surface);
                    color: var(--text-secondary);
                    font-weight: 700;
                    font-size: 13px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    cursor: pointer;
                    margin-bottom: 8px;
                }
                .btn-next-step:hover { background: var(--surface-hover); }
                .btn-next-step:focus-visible {
                    outline: 2px solid color-mix(in srgb, var(--accent) 32%, white);
                    outline-offset: 2px;
                }

                .btn-next-step.highlight { border-color: var(--accent); background: var(--accent-light); color: var(--accent); }
                .btn-next-step.highlight {
                    background: var(--accent);
                    border-color: var(--accent);
                    color: #fff;
                }
                .btn-next-step.highlight:hover { filter: brightness(0.96); }
                .next-step-danger-wrap {
                    margin-top: 8px;
                    padding-top: 8px;
                    border-top: 0.5px solid var(--color-border-tertiary, var(--border-light));
                }
                .btn-next-step.danger {
                    border: none;
                    background: none;
                    color: var(--text-muted);
                    margin-bottom: 0;
                    padding: 4px 0;
                    font-size: 12px;
                }
                .btn-next-step.danger:hover {
                    color: var(--color-text-danger, var(--danger));
                }

                .schedule-secondary-link {
                    margin-top: 10px;
                    border: none;
                    background: none;
                    padding: 0;
                    font-size: 12px;
                    color: var(--accent);
                    font-weight: 600;
                    cursor: pointer;
                }
                .schedule-secondary-link:hover { text-decoration: underline; }
                .schedule-secondary-link:focus-visible {
                    outline: 2px solid color-mix(in srgb, var(--accent) 32%, white);
                    outline-offset: 2px;
                    border-radius: 6px;
                }
                .schedule-secondary-link:disabled {
                    opacity: 0.6;
                    cursor: default;
                }

                .task-row {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 13px;
                }
                .task-title {
                    color: var(--text);
                    flex: 1;
                }
                .task-due {
                    color: var(--text-muted);
                    font-size: 11px;
                    font-weight: 500;
                    margin-left: auto;
                }
                .task-row.done .task-title {
                    text-decoration: line-through;
                    opacity: 0.6;
                }

                .btn-delete-lead-link {
                    width: 100%;
                    padding: 0;
                    border-radius: 0;
                    background: transparent;
                    color: var(--color-text-tertiary, var(--text-muted));
                    border: none;
                    font-size: 12px;
                    font-weight: 500;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    cursor: pointer;
                    margin-top: 24px;
                    margin-bottom: 16px;
                }
                .btn-delete-lead-link:hover {
                    color: var(--color-text-danger, var(--danger));
                }
                .btn-delete-lead-link:focus-visible {
                    outline: 2px solid color-mix(in srgb, var(--danger) 35%, white);
                    outline-offset: 2px;
                    border-radius: 8px;
                }
                    width: 100%;
                    padding: 12px;
                    border-radius: 12px;
                    background: var(--accent-light);
                    color: var(--cosmos);
                    border: none;
                    font-weight: 700;
                    font-size: 13px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    cursor: pointer;
                }

                .timeline-closed .btn-toggle-timeline {
                    width: auto;
                    margin-left: auto;
                }

                /* Painel Timeline */
                .lead-profile-right-panel {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    overflow: hidden;
                    background: var(--surface-hover);
                    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                    max-width: 420px;
                }

                .timeline-closed .lead-profile-right-panel {
                    flex: 0;
                    max-width: 0;
                    opacity: 0;
                    pointer-events: none;
                }

                .timeline-header {
                    padding: 24px 24px 12px;
                }

                .timeline-title {
                    font-size: 1.25rem;
                    font-weight: 800;
                    color: var(--text);
                    margin: 0 0 16px;
                }

                .timeline-input-zone {
                    padding: 0 24px 24px;
                }

                .note-container {
                    position: relative;
                    background: var(--surface);
                    border: 1px solid var(--border);
                    border-radius: 16px;
                    padding: 4px;
                    box-shadow: var(--shadow-sm);
                }

                .timeline-textarea {
                    width: 100%;
                    border: none;
                    padding: 12px 48px 12px 12px;
                    font-family: inherit;
                    font-size: 14px;
                    color: var(--text);
                    background: transparent;
                    resize: none;
                    outline: none;
                }

                .btn-send-note {
                    position: absolute;
                    bottom: 8px;
                    right: 8px;
                    width: 36px;
                    height: 36px;
                    border-radius: var(--border-radius-md, 10px);
                    background: var(--petroleo);
                    color: white;
                    border: none;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 4px;
                    cursor: pointer;
                    box-shadow: var(--shadow);
                }
                .btn-send-note .send-note-icon {
                    color: #fff;
                    display: block;
                    flex-shrink: 0;
                }

                .timeline-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 0 24px 40px;
                }

                .timeline-events-list {
                    position: relative;
                    display: flex;
                    flex-direction: column;
                    padding-left: 24px;
                }

                .timeline-vertical-line {
                    position: absolute;
                    left: 7px;
                    top: 12px;
                    bottom: 0;
                    width: 1px;
                    background: var(--border-light);
                    z-index: 0;
                }

                .timeline-event-item {
                    position: relative;
                    margin-bottom: 24px;
                    padding-left: 12px;
                    z-index: 1;
                }

                .event-dot {
                    position: absolute;
                    left: -24px;
                    top: 4px;
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    border: 2px solid var(--surface);
                    box-shadow: 0 0 0 1px var(--border-light);
                }

                .event-header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 4px;
                }

                .event-type-label {
                    font-size: 10px;
                    font-weight: 800;
                    text-transform: uppercase;
                    color: var(--text-muted);
                    letter-spacing: 0.02em;
                }

                .event-date {
                    font-size: 11px;
                    color: var(--faint);
                }

                .event-message {
                    font-size: 14px;
                    color: var(--text);
                    line-height: 1.5;
                }

                .inbox-tag {
                    font-size: 10px;
                    color: var(--text-muted);
                    margin-left: 6px;
                }

                .event-pin-btn {
                    background: none;
                    border: none;
                    padding: 4px;
                    margin-left: auto;
                    cursor: pointer;
                    color: var(--text-muted);
                    opacity: 0.4;
                    transition: all 0.2s;
                }
                .timeline-event-item:hover .event-pin-btn, .timeline-event-item.pinned .event-pin-btn {
                    opacity: 1;
                }
                .timeline-event-item.pinned .event-pin-btn { color: var(--accent); }

                .timeline-event-item.pinned {
                    background: rgba(var(--accent-rgb), 0.03);
                    border-radius: 8px;
                    padding: 8px 12px;
                    margin-left: -12px;
                    border: 1px solid var(--accent-light);
                }

                @media (min-width: 1025px) {
                    .lead-profile-container {
                        max-width: 780px;
                        margin-left: auto;
                        margin-right: auto;
                    }
                }

                @media (min-width: 1025px) and (max-width: 1200px) {
                    .lead-profile-container {
                        max-width: 700px;
                    }
                    .timeline-open .lead-profile-left-col {
                        width: 320px;
                    }
                    .timeline-open .lead-profile-right-panel {
                        max-width: 380px;
                    }
                }

                /* Responsividade */
                @media (max-width: 1024px) {
                    .lead-profile-left-col {
                        width: 100%;
                    }
                    .timeline-closed .lead-profile-left-col {
                        width: 100%;
                        max-width: 100%;
                        flex: 1 1 auto;
                    }
                    .lead-profile-right-panel {
                        position: fixed;
                        inset: 0;
                        z-index: 200;
                        transform: translateX(100%);
                        padding-top: env(safe-area-inset-top, 0px);
                        box-sizing: border-box;
                    }

                    .timeline-open .lead-profile-left-col { display: none; }
                    .timeline-open .lead-profile-right-panel { transform: translateX(0); max-width: 100%; }
                    .timeline-closed .lead-profile-right-panel { display: none; }
                }

                .filter-strip {
                    display: flex;
                    flex-wrap: nowrap;
                    gap: 6px;
                    overflow-x: auto;
                    overflow-y: hidden;
                    padding-bottom: 2px;
                    -webkit-overflow-scrolling: touch;
                    scrollbar-width: none;
                }
                .filter-strip::-webkit-scrollbar { display: none; }

                .filter-pill {
                    padding: 4px 10px;
                    border-radius: 100px;
                    border: 1px solid var(--border-light);
                    background: transparent;
                    color: var(--text-secondary);
                    font-size: 11px;
                    font-weight: 600;
                    white-space: nowrap;
                    cursor: pointer;
                    min-height: 30px;
                    display: inline-flex;
                    align-items: center;
                    box-sizing: border-box;
                }
                .filter-pill:hover {
                    border-color: var(--border);
                    background: color-mix(in srgb, var(--surface-hover) 55%, transparent);
                }
                .filter-pill:focus-visible {
                    outline: 2px solid color-mix(in srgb, var(--accent) 28%, white);
                    outline-offset: 2px;
                }
                .filter-pill.active {
                    background: var(--accent-light);
                    color: var(--accent);
                    border-color: var(--accent);
                }

                @media (max-width: 640px) {
                    .left-col-content {
                        padding: 16px;
                        gap: 18px;
                    }
                    .profile-section {
                        padding-top: 16px;
                    }
                    .comm-actions-wrap {
                        gap: 6px;
                    }
                    .comm-btn-primary,
                    .comm-btn-dropdown {
                        height: 38px;
                    }
                    .btn-next-step {
                        padding: 10px 12px;
                        font-size: 12px;
                    }
                    .filter-pill {
                        min-height: 28px;
                        padding: 3px 9px;
                        font-size: 10px;
                    }
                }

                /* Confirm Modal Tweaks */
                .dashboard-confirm-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 1000;
                    background: rgba(0, 4, 53, 0.35);
                    backdrop-filter: blur(12px) saturate(1.4);
                    -webkit-backdrop-filter: blur(12px) saturate(1.4);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }
                .dashboard-confirm-modal {
                    background: var(--surface);
                    border-radius: 20px;
                    padding: 32px;
                    width: 100%;
                    max-width: 400px;
                    text-align: center;
                    box-shadow: var(--shadow-2xl);
                }
                .confirm-title { font-size: 1.25rem; font-weight: 800; margin-bottom: 8px; }
                .confirm-desc { font-size: 15px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 24px; }
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
                .dashboard-confirm-actions .btn-danger,
                .dashboard-confirm-actions .btn-secondary {
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
                `
            }} />
        </div>
    );
};

export default LeadProfile;
