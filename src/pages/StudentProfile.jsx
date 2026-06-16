import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { User, ChevronDown, MessageCircle, Send, Trash2, AlertTriangle, PauseCircle, ArrowLeft, FileSignature } from 'lucide-react';
import { databases, DB_ID, ACADEMIES_COL, account } from '../lib/appwrite';
import {
    getStudentPayments,
    createPayment,
    getPaymentStatus,
    updatePayment,
    deletePayment,
    cancelBundleCoverageFromMonth,
    PAYMENT_CATEGORY,
} from '../lib/studentPayments.js';
import { StudentPaymentsApiError } from '../lib/studentPaymentsApi.js';
import StudentFinancialTimeline from '../components/student/StudentFinancialTimeline.jsx';
import StudentContractsSection from '../components/student/StudentContractsSection.jsx';
import StudentContractHeaderChip from '../components/student/StudentContractHeaderChip.jsx';
import PlanFreezeModal from '../components/student/PlanFreezeModal.jsx';
import {
    startPlanFreeze,
    endPlanFreeze,
    listPlanFreezes,
    formatFreezeDateBr,
    canStartPlanFreeze,
    isFreezeActive,
    activeFreezeReasonFromHistory,
} from '../lib/planFreeze.js';
import StudentPaymentModal, {
    buildDefaultPayForm,
    paymentFormFromDoc,
    PAYMENT_MODAL_PRODUCT,
} from '../components/student/StudentPaymentModal.jsx';
import ConfirmDialog from '../components/shared/ConfirmDialog.jsx';
import FieldError from '../components/shared/FieldError.jsx';
import { useCanManageStudentPayments } from '../lib/canManageStudentPayments.js';
import { getSalesByStudent } from '../lib/salesByStudent.js';
import { fetchReportsByStudent } from '../lib/reportsByStudentApi.js';
import { getAttendance, getAttendanceStats, createCheckin, isAttendanceConfigured } from '../lib/attendance.js';
import { addLeadEvent, getLeadEvents } from '../lib/leadEvents.js';
import { DEFAULT_WHATSAPP_TEMPLATES, WHATSAPP_TEMPLATE_LABELS } from '../../lib/whatsappTemplateDefaults.js';
import { useWhatsappTemplates } from '../lib/useWhatsappTemplates.js';
import { sendWhatsappTemplateOutbound } from '../lib/outboundWhatsappTemplate.js';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import { useStudentStore, selectStudentById } from '../store/useStudentStore';
import '../styles/student-profile.css';
import { useToast } from '../hooks/useToast';
import { friendlyError } from '../lib/errorMessages.js';
import { maskCPF, maskPhone } from '../lib/masks.js';
import { centsToNumber, parseMaskToCents } from '../lib/moneyBr';
import { PIPELINE_STAGES } from '../constants/pipeline.js';
import { useTerms, contactLabelSingular, operationalStatusDisplayLabel, pipelineStageDisplayLabel } from '../lib/terminology.js';
import { useNlPageContext } from '../hooks/useNlPageContext.js';
import { NL_PAYMENT_PREFILL_EVENT } from '../lib/nlCorrect.js';
import { formatBRLFromCents } from '../lib/moneyBr';
import { DateInputField } from '../components/DateInput';
import PlanSelect from '../components/shared/PlanSelect.jsx';
import { LEAD_TIMELINE_CHANGED, LEAD_ATTENDANCE_CHANGED, emitLeadAttendanceChanged } from '../lib/leadTimelineEvents.js';
import { formatCollectionResultLabel } from '../lib/collectionRules.js';
import EmptyState from '../components/shared/EmptyState.jsx';
import DeactivateStudentModal from '../components/DeactivateStudentModal.jsx';
import CreateContractModal from '../components/contracts/CreateContractModal.jsx';
import { isActiveStudent, isInactiveStudent } from '../lib/studentStatus.js';
import { storageDialectMethodLabelsMap, storageDialectPaymentMethodOptions } from '../lib/paymentMethods.js';
import { deactivateStudent, reactivateStudent } from '../lib/deactivateStudent.js';
import { fetchStudentProfileBundle } from '../lib/studentsApi.js';
import { getAcademyDocument } from '../lib/getAcademyDocument.js';
import { useCanViewStudentFinance } from '../lib/canViewStudentFinance.js';
import StudentStatusBadge from '../components/student/StudentStatusBadge.jsx';
import StudentOverdueBadge from '../components/student/StudentOverdueBadge.jsx';
import { resolveStudentListStatus } from '../lib/studentDisplayStatus.js';
import { normalizeProfilePaymentStatus } from '../lib/paymentStatus.js';
import { readStudentExitReasonsFromAcademyDoc } from '../lib/studentExitConfig.js';
import { readStudentFreezeReasonsFromAcademyDoc } from '../lib/studentFreezeConfig.js';
import { defaultEnrollmentDateIso } from '../lib/studentEnrollmentDate.js';
import {
    applyRegisteredEmergencyToForm,
    emergencyMatchesRegistered,
} from '../lib/studentEmergencyContact.js';
import NaviChatWidgetPanel from '../components/chat-widget/NaviChatWidgetPanel.jsx';
import { validateBankAccountForPayment, validatePreferredPaymentAccount } from '../lib/bankAccounts.js';
import { trocoFieldsForPaymentPayload, validateStudentPaymentTroco } from '../lib/studentPaymentTroco.js';
import BankAccountSelect from '../components/finance/BankAccountSelect.jsx';
import SexoSelect from '../components/shared/SexoSelect.jsx';
import TurmaSelect from '../components/shared/TurmaSelect.jsx';
import { useAcademyTurmas } from '../hooks/useAcademyTurmas.js';
import { useAcademyControlId } from '../hooks/useAcademyControlId.js';
import StudentControlIdPhoto from '../components/student/StudentControlIdPhoto.jsx';
import { resolveTurmaFormState, turmaValueFromForm } from '../lib/academyTurmas.js';
import { sexoDisplayLabel } from '../lib/leadSexo.js';
import {
    findDuplicateStudentCpf,
    formatPaymentDateLabel,
    isPaymentDateInFuture,
    isValidCPF,
} from '../lib/validations.js';
import { buildReceivablesPath } from '../lib/financeiroReceivablesSections.js';

function formatDateBR(ymd) {
    if (!ymd || String(ymd).length < 10) return '';
    try {
        return new Date(`${String(ymd).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
    } catch {
        return '';
    }
}

/** @param {string|undefined} raw */
function formatPhone(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    const local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
    if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
    if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
    return raw || '';
}

const STATUS_CONFIG = {
    [LEAD_STATUS.NEW]: { bg: 'var(--accent-light)', color: 'var(--accent)' },
    [LEAD_STATUS.SCHEDULED]: { bg: 'var(--warning-light)', color: 'var(--warning)' },
    [LEAD_STATUS.COMPLETED]: { bg: 'var(--success-light)', color: 'var(--success)' },
    [LEAD_STATUS.MISSED]: { bg: 'var(--danger-light)', color: 'var(--danger)' },
    [LEAD_STATUS.CONVERTED]: { bg: 'rgba(228, 181, 93, 0.12)', color: 'var(--dourado)' },
    [LEAD_STATUS.LOST]: { bg: '#f1f5f9', color: '#64748b' },
};

const TIMELINE_EVENT_LABELS = {
    message: 'Mensagem enviada',
    call: 'Ligação',
    schedule: 'Agendamento',
    stage_change: 'Mudança de etapa',
    pipeline_change: 'Movido no funil',
    note: 'Nota',
    lead_created: 'Cadastro',
    import: 'Importação',
    attended: 'Compareceu à aula',
    missed: 'Não compareceu',
    converted: 'Matriculado',
    lost: 'Perda',
    inbox_note: 'Nota Inbox',
    whatsapp: 'WhatsApp',
    collection_attempt: 'Cobrança',
    collection_escalated: 'Cobrança escalada',
    task_created: 'Tarefa criada',
    task_done: 'Tarefa concluída',
    student_enrolled: 'Matrícula',
    student_deactivated: 'Desligamento',
    student_reactivated: 'Reativação',
    student_freeze_started: 'Trancamento iniciado',
    student_freeze_ended: 'Trancamento encerrado',
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

const STUDENT_DATA_FIELDS = [
    { key: 'name', label: 'Nome', type: 'text', placeholder: 'Nome completo' },
    { key: 'plan', label: 'Plano', type: 'plan' },
    { key: 'enrollmentDate', label: 'Ingresso', type: 'date', placeholder: '' },
    { key: 'birthDate', label: 'Nascimento', type: 'date', placeholder: '' },
    { key: 'sexo', label: 'Sexo', type: 'sexo' },
    { key: 'turma', label: 'Turma', type: 'turma' },
    { key: 'phone', label: 'Telefone (WhatsApp)', type: 'tel', placeholder: '(00) 00000-0000' },
    {
        key: 'email',
        label: 'E-mail',
        type: 'email',
        placeholder: 'nome@email.com',
    },
    { key: 'cpf', label: 'CPF', type: 'text', placeholder: '000.000.000-00' },
    { key: 'responsavel', label: 'Responsável', type: 'text', placeholder: 'Nome do responsável' },
    { key: 'cpfResponsavel', label: 'CPF do responsável', type: 'text', placeholder: '000.000.000-00' },
];

const EMERGENCY_FIELDS = [
    { key: 'emergencyContact', label: 'Contato de emergência', type: 'text', placeholder: 'Nome do contato' },
    { key: 'emergencyPhone', label: 'Telefone de emergência', type: 'tel', placeholder: 'Celular' },
];

const PREFERRED_PAYMENT_SELECT_OPTIONS = storageDialectPaymentMethodOptions();

const PAYMENT_HABIT_FIELDS = [
    {
        key: 'preferredPaymentMethod',
        label: 'Forma de pagamento habitual',
        type: 'select',
        options: PREFERRED_PAYMENT_SELECT_OPTIONS,
    },
    {
        key: 'dueDay',
        label: 'Dia de vencimento',
        type: 'number',
        placeholder: '1 a 31',
        min: 1,
        max: 31,
    },
];

const BG_SECONDARY = 'var(--surface-hover)';

const STUDENT_PROFILE_TABS = ['frequency', 'payments', 'contracts', 'timeline', 'conversation'];

function readInitialTimelineOpen() {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(min-width: 1024px)').matches;
}

function formatCheckinAt(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso || '');
    const date = d.toLocaleDateString('pt-BR');
    const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${date} · ${time}`;
}

function capitalizePtBrMonthYear(s) {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** reference_month YYYY-MM → "Abril 2026" (usa dia 02 para evitar timezone) */
function formatReferenceMonthLong(ym) {
    if (!ym || String(ym).length < 7) return '';
    try {
        const raw = new Date(`${String(ym).slice(0, 7)}-02`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        return capitalizePtBrMonthYear(raw);
    } catch {
        return '';
    }
}

const METHOD_PAYMENT_LABELS = storageDialectMethodLabelsMap();

export default function StudentProfile() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const student = useStudentStore((s) => selectStudentById(s, id));
    const loading = useStudentStore((s) => s.loading);
    const fetchStudentById = useStudentStore((s) => s.fetchStudentById);
    const mergeStudent = useStudentStore((s) => s.mergeStudent);
    const refreshStudentPaymentStatus = useStudentStore((s) => s.refreshStudentPaymentStatus);
    const canViewFinance = useCanViewStudentFinance();
    const [profileResolving, setProfileResolving] = useState(
        () => !selectStudentById(useStudentStore.getState(), id)
    );
    const academyId = useLeadStore((s) => s.academyId);
    const modules = useLeadStore((s) => s.modules);
    const financeConfig = useLeadStore((s) => s.financeConfig);
    const { turmas: academyTurmas } = useAcademyTurmas(academyId);
    const userId = useLeadStore((s) => s.userId);
    const academyList = useLeadStore((s) => s.academyList);
    const deleteStudent = useStudentStore((s) => s.deleteStudent);
    const updateStudent = useStudentStore((s) => s.updateStudent);
    const uiLabels = useLeadStore((s) => s.labels);
    const toast = useToast();
    const terms = useTerms();
    const contactLabel = useMemo(() => contactLabelSingular(uiLabels), [uiLabels]);

    const permCtx = useMemo(() => {
        const acad = (academyList || []).find((a) => a.id === academyId) || {};
        return { ownerId: acad.ownerId, teamId: acad.teamId, userId: userId || '' };
    }, [academyList, academyId, userId]);

    const pipelineStagesNl = useMemo(() => {
        const patchStageLabels = (rows) =>
            (rows || []).map((s) => {
                let out = { ...s };
                if (String(s?.id || '').trim() === 'Aula experimental') out = { ...out, label: terms.trial };
                if (String(s?.id || '').trim() === 'Matriculado') out = { ...out, label: terms.pipelineEnrolledColumnLabel };
                return out;
            });
        const fixed = patchStageLabels(PIPELINE_STAGES.map((stage) => ({ id: stage, label: stage })));
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
                    const sid = String(s?.id || '').trim();
                    const label = String(s?.label || s?.id || '').trim();
                    return sid ? { id: sid, label: label || sid } : null;
                })
                .filter(Boolean);
            return normalized.length > 0 ? patchStageLabels(normalized) : fixed;
        } catch {
            return fixed;
        }
    }, [academyList, academyId, terms.trial, terms.pipelineEnrolledColumnLabel]);

    const studentDataFields = useMemo(
        () => STUDENT_DATA_FIELDS.map((f) => (f.key === 'plan' ? { ...f, label: terms.plan } : f)),
        [terms.plan]
    );

    const [deactivateOpen, setDeactivateOpen] = useState(false);
    const [deactivateBusy, setDeactivateBusy] = useState(false);
    const [rescissionContractOpen, setRescissionContractOpen] = useState(false);
    const [rescissionLeadOverrides, setRescissionLeadOverrides] = useState(null);
    const [reactivateBusy, setReactivateBusy] = useState(false);
    const [exitReasons, setExitReasons] = useState([]);
    const [freezeReasons, setFreezeReasons] = useState([]);
    const [editingData, setEditingData] = useState(false);
    const [emergencySameAsRegistered, setEmergencySameAsRegistered] = useState(false);
    const [dataForm, setDataForm] = useState({
        name: '',
        type: 'Adulto',
        plan: '',
        sexo: '',
        turmaSelect: '',
        turmaOther: '',
        enrollmentDate: '',
        birthDate: '',
        phone: '',
        email: '',
        cpf: '',
        responsavel: '',
        cpfResponsavel: '',
        emergencyContact: '',
        emergencyPhone: '',
        preferredPaymentMethod: '',
        preferredPaymentAccount: '',
        dueDay: '',
    });
    const [savingData, setSavingData] = useState(false);
    const [cpfErrors, setCpfErrors] = useState({ cpf: '', cpfResponsavel: '' });
    const [futurePaidDateLabel, setFuturePaidDateLabel] = useState(null);
    const skipFuturePaidDateRef = useRef(false);
    const [timelineOpen, setTimelineOpen] = useState(readInitialTimelineOpen);
    const [activeTab, setActiveTab] = useState('frequency');
    const profileBundleRef = useRef(null);
    const controlIdCfg = useAcademyControlId(academyId, { fetch: activeTab === 'frequency' });
    const waTemplateMenuRef = useRef(null);
    const [waCtx, setWaCtx] = useState({
        name: '',
        zapster: '',
        templates: DEFAULT_WHATSAPP_TEMPLATES,
    });
    const { templates: waTemplatesHook, academyName: waNameHook, zapsterInstanceId: waZapHook } =
        useWhatsappTemplates(academyId);
    // Alinhado ao menu /inbox: aba sempre visível; estados vazios ficam no painel de chat.
    const showConversationTab = true;
    const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
    const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
    const [note, setNote] = useState('');
    const [addingNote, setAddingNote] = useState(false);
    const [timelineEvents, setTimelineEvents] = useState([]);
    const [timelineError, setTimelineError] = useState(false);
    const [eventTypeFilter, setEventTypeFilter] = useState('all');
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [deleteBusy, setDeleteBusy] = useState(false);
    const [checkingIn, setCheckingIn] = useState(false);
    const [sessionUserName, setSessionUserName] = useState('Usuário');
    const [checkins, setCheckins] = useState([]);
    const [freqStats, setFreqStats] = useState(null);
    const [loadingFreq, setLoadingFreq] = useState(true);
    const [freqError, setFreqError] = useState(false);
    /** Código HTTP do Appwrite (ex.: 401 permissão). */
    const [freqErrorCode, setFreqErrorCode] = useState(null);
    const [payments, setPayments] = useState([]);
    const [sales, setSales] = useState([]);
    const [extratoUnificado, setExtratoUnificado] = useState(null);
    const [loadingPayments, setLoadingPayments] = useState(true);
    const [paymentsError, setPaymentsError] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [editingPaymentId, setEditingPaymentId] = useState(null);
    const [payFormError, setPayFormError] = useState('');
    const [paymentStatus, setPaymentStatus] = useState(null);
    const [payForm, setPayForm] = useState(() => buildDefaultPayForm(null));
    const [savingPayment, setSavingPayment] = useState(false);
    const [deletePaymentTarget, setDeletePaymentTarget] = useState(null);
    const [deletePaymentBusy, setDeletePaymentBusy] = useState(false);
    const [cancellingCoverage, setCancellingCoverage] = useState(false);
    const [planFreezes, setPlanFreezes] = useState([]);
    const [freezeModalOpen, setFreezeModalOpen] = useState(false);
    const [freezeBusy, setFreezeBusy] = useState(false);
    const [endFreezeBusy, setEndFreezeBusy] = useState(false);
    const [academySettingsDoc, setAcademySettingsDoc] = useState(null);
    const [viewportStacked, setViewportStacked] = useState(
        () => typeof window !== 'undefined' && window.innerWidth < 1024
    );
    const stackedLayout = viewportStacked;

    const leadId = id || '';

    const academyDocForRole = useMemo(
        () => (academyList || []).find((a) => a.id === academyId) || null,
        [academyList, academyId]
    );
    const canManagePayments = useCanManageStudentPayments(academyDocForRole);

    useEffect(() => {
        if (!id) return undefined;
        let cancelled = false;
        if (selectStudentById(useStudentStore.getState(), id)) {
            setProfileResolving(false);
            return undefined;
        }
        setProfileResolving(true);
        void fetchStudentById(id).finally(() => {
            if (!cancelled) setProfileResolving(false);
        });
        return () => {
            cancelled = true;
        };
    }, [id, fetchStudentById]);

    useEffect(() => {
        if (!id || !academyId) return;
        profileBundleRef.current = null;
        void fetchStudentProfileBundle(id)
            .then((bundle) => {
                profileBundleRef.current = bundle;
                if (bundle?.student) mergeStudent(id, bundle.student);
                if (bundle?.paymentStatus && bundle.paymentStatus.key) {
                    setPaymentStatus({
                        status: normalizeProfilePaymentStatus(bundle.paymentStatus),
                        payment: null,
                    });
                }
                if (bundle?.attendanceStats) {
                    setFreqStats(bundle.attendanceStats);
                }
            })
            .catch((e) => console.warn('[StudentProfile] profile bundle:', e?.message || e));
    }, [id, academyId, mergeStudent]);

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 1023px)');
        const onChange = () => setViewportStacked(mq.matches);
        mq.addEventListener('change', onChange);
        setViewportStacked(mq.matches);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    useEffect(() => {
        const onNlPaymentPrefill = (ev) => {
            const d = ev?.detail || {};
            if (!student || String(d.student_id || '').trim() !== String(student.id || '').trim()) return;
            const base = buildDefaultPayForm(student, financeConfig);
            const amountNum = Number(d.amount);
            setPayForm({
                ...base,
                reference_month: String(d.reference_month || base.reference_month).trim() || base.reference_month,
                amount:
                    Number.isFinite(amountNum) && amountNum > 0
                        ? formatBRLFromCents(Math.round(amountNum * 100))
                        : base.amount,
                method: d.method || base.method,
                plan_name: d.plan_name || base.plan_name,
                note: d.note || '',
                status: 'paid',
            });
            setShowPaymentModal(true);
        };
        window.addEventListener(NL_PAYMENT_PREFILL_EVENT, onNlPaymentPrefill);
        return () => window.removeEventListener(NL_PAYMENT_PREFILL_EVENT, onNlPaymentPrefill);
    }, [student, financeConfig]);

    useEffect(() => {
        if (!student) return;
        setDataForm({
            name: String(student.name || '').trim(),
            type: student.type || 'Adulto',
            plan: student.plan || '',
            sexo: student.sexo || '',
            ...(() => {
                const t = resolveTurmaFormState(student.turma || student.className, academyTurmas);
                return { turmaSelect: t.selectValue, turmaOther: t.otherText };
            })(),
            enrollmentDate: defaultEnrollmentDateIso(student),
            birthDate: student.birthDate || '',
            phone: maskPhone(String(student.phone || '')),
            email: String(student.email || '').trim(),
            cpf: maskCPF(String(student.cpf || '')),
            responsavel: student.responsavel || '',
            cpfResponsavel: maskCPF(String(student.cpfResponsavel || '')),
            emergencyContact: student.emergencyContact || '',
            emergencyPhone: maskPhone(String(student.emergencyPhone || '')),
            preferredPaymentMethod: student.preferredPaymentMethod || '',
            preferredPaymentAccount: student.preferredPaymentAccount || '',
            dueDay: student.dueDay != null && student.dueDay !== '' ? String(student.dueDay) : '',
        });
        setEmergencySameAsRegistered(
            emergencyMatchesRegistered({
                type: student.type,
                name: student.name,
                responsavel: student.responsavel,
                phone: student.phone,
                emergencyContact: student.emergencyContact,
                emergencyPhone: student.emergencyPhone,
            })
        );
        setEditingData(false);
        // Sincronizar só ao mudar de aluno (id), não a cada atualização do objeto na store.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- student fields read intentionally when id changes
    }, [student?.id]);

    useEffect(() => {
        if (!emergencySameAsRegistered || !editingData) return;
        setDataForm((p) => {
            const next = applyRegisteredEmergencyToForm(p);
            return {
                ...next,
                emergencyPhone: maskPhone(next.emergencyPhone || ''),
            };
        });
    }, [
        emergencySameAsRegistered,
        editingData,
        dataForm.name,
        dataForm.phone,
        dataForm.responsavel,
        dataForm.type,
    ]);

    useEffect(() => {
        if (searchParams.get('edit') === 'enrollment' && student) {
            setEditingData(true);
        }
    }, [searchParams, student?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (!tab || !STUDENT_PROFILE_TABS.includes(tab)) return;
        if (tab === 'payments' && !canViewFinance) return;
        if (tab === 'contracts' && modules?.finance !== true) return;
        if (tab === 'conversation' && !showConversationTab) return;
        setActiveTab(tab);
        setTimelineOpen(true);
    }, [searchParams, canViewFinance, modules?.finance, showConversationTab]);

    useEffect(() => {
        if (searchParams.get('sendRescission') !== '1' || !id || modules?.finance !== true) return;
        setActiveTab('contracts');
        setTimelineOpen(true);
        void fetchStudentById(id).finally(() => setRescissionContractOpen(true));
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                next.delete('sendRescission');
                return next;
            },
            { replace: true }
        );
    }, [searchParams, id, modules?.finance, fetchStudentById, setSearchParams]);

    useEffect(() => {
        if (activeTab === 'timeline' || activeTab === 'conversation') {
            setTimelineOpen(true);
        }
    }, [activeTab]);

    useEffect(() => {
        setTemplateMenuOpen(false);
    }, [leadId]);

    useEffect(() => {
        if (!templateMenuOpen) return undefined;
        const onPointerDown = (e) => {
            if (waTemplateMenuRef.current?.contains(e.target)) return;
            setTemplateMenuOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        return () => document.removeEventListener('mousedown', onPointerDown);
    }, [templateMenuOpen]);

    useEffect(() => {
        let cancelled = false;
        account
            .get()
            .then((u) => {
                if (cancelled) return;
                const n = String(u.name || u.email || '').trim();
                setSessionUserName(n || 'Usuário');
            })
            .catch(() => {
                if (!cancelled) setSessionUserName('Usuário');
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const loadFrequency = useCallback(async () => {
        if (!leadId || !academyId) {
            setCheckins([]);
            setFreqStats(null);
            setLoadingFreq(false);
            return;
        }
        setLoadingFreq(true);
        setFreqError(false);
        setFreqErrorCode(null);
        try {
            const [docs, stats] = await Promise.all([
                getAttendance(leadId, academyId, { limit: 50 }),
                getAttendanceStats(leadId, academyId),
            ]);
            setCheckins(docs);
            setFreqStats(stats);
        } catch (e) {
            setFreqError(true);
            setFreqErrorCode(e?.code != null && !Number.isNaN(Number(e.code)) ? Number(e.code) : null);
            setCheckins([]);
            setFreqStats(null);
        } finally {
            setLoadingFreq(false);
        }
    }, [leadId, academyId]);

    useEffect(() => {
        if (activeTab !== 'frequency') return;
        void loadFrequency();
    }, [activeTab, loadFrequency]);

    const loadPayments = useCallback(async () => {
        if (!leadId || !academyId) {
            setPayments([]);
            setSales([]);
            setPaymentStatus({ status: 'none', payment: null });
            setLoadingPayments(false);
            setPaymentsError(false);
            return;
        }
        setLoadingPayments(true);
        setPaymentsError(false);
        try {
            const salesPromise = canViewFinance
                ? getSalesByStudent(leadId, { limit: 50 }).catch((err) => {
                      console.warn('getSalesByStudent:', leadId, err?.message || err);
                      return [];
                  })
                : Promise.resolve([]);
            const extratoPromise = canViewFinance
                ? fetchReportsByStudent(leadId, { academyId }).catch((err) => {
                      console.warn('fetchReportsByStudent:', leadId, err?.message || err);
                      return null;
                  })
                : Promise.resolve(null);
            const bundle = profileBundleRef.current;
            const statusPromise = canViewFinance
                ? bundle?.paymentStatus?.key
                    ? Promise.resolve({
                          status: normalizeProfilePaymentStatus(bundle.paymentStatus),
                          payment: null,
                      })
                    : getPaymentStatus(leadId, academyId)
                : Promise.resolve({ status: 'none', payment: null });
            const freezesPromise =
                bundle?.planFreezes != null
                    ? Promise.resolve(bundle.planFreezes)
                    : listPlanFreezes(leadId, academyId).catch(() => []);
            const [docs, status, salesList, freezes, extrato] = await Promise.all([
                canViewFinance ? getStudentPayments(leadId, academyId) : Promise.resolve([]),
                statusPromise,
                salesPromise,
                freezesPromise,
                extratoPromise,
            ]);
            setPayments(docs);
            setPaymentStatus(status);
            setSales(salesList);
            setPlanFreezes(freezes);
            setExtratoUnificado(
                extrato ? { timeline: extrato.timeline || [], totals: extrato.totals || null } : null
            );
        } catch (e) {
            console.error(e);
            setPaymentsError(true);
            setPayments([]);
            setSales([]);
            setExtratoUnificado(null);
            setPaymentStatus({ status: 'none', payment: null });
        } finally {
            setLoadingPayments(false);
        }
    }, [leadId, academyId, canViewFinance]);

    useEffect(() => {
        if (activeTab !== 'payments' || !canViewFinance) return;
        void loadPayments();
    }, [activeTab, canViewFinance, loadPayments]);

    const handleConfirmFreeze = useCallback(
        async ({ startYmd, endYmd, durationDays, reason, indefinite = false }) => {
            if (!student || !leadId || !academyId) return;
            setFreezeBusy(true);
            try {
                const acad = (academyList || []).find((a) => a.id === academyId) || {};
                await startPlanFreeze({
                    student,
                    leadId,
                    academyId,
                    startYmd,
                    endYmd,
                    durationDays,
                    reason,
                    indefinite,
                    userId,
                    teamId: acad.teamId,
                    mergeStudent,
                    onAfterFreeze: () => refreshStudentPaymentStatus(leadId, academyId),
                    academySettingsRaw: academySettingsDoc,
                    financeConfig,
                });
                setFreezeModalOpen(false);
                toast.show({
                    type: 'success',
                    message: indefinite
                        ? `Matrícula trancada desde ${formatFreezeDateBr(startYmd)} (retorno indefinido).`
                        : `Matrícula trancada até ${formatFreezeDateBr(endYmd)}. Acesso bloqueado quando possível.`,
                });
                void loadPayments();
                void refreshStudentPaymentStatus(leadId, academyId);
            } catch (e) {
                toast.error(e, 'save');
                throw e;
            } finally {
                setFreezeBusy(false);
            }
        },
        [student, leadId, academyId, academyList, userId, mergeStudent, academySettingsDoc, financeConfig, toast, loadPayments, refreshStudentPaymentStatus]
    );

    const handleEndFreezeEarly = useCallback(async () => {
        if (!student || !leadId || !academyId) return;
        setEndFreezeBusy(true);
        try {
            const acad = (academyList || []).find((a) => a.id === academyId) || {};
            await endPlanFreeze({
                student,
                leadId,
                academyId,
                userId,
                teamId: acad.teamId,
                mergeStudent,
                academySettingsRaw: academySettingsDoc,
                early: true,
                payments,
            });
            toast.success('Trancamento encerrado. Acesso reativado na catraca quando possível.');
            void loadPayments();
            void refreshStudentPaymentStatus(leadId, academyId);
        } catch (e) {
            toast.error(e, 'save');
        } finally {
            setEndFreezeBusy(false);
        }
    }, [student, leadId, academyId, academyList, userId, mergeStudent, academySettingsDoc, payments, toast, loadPayments, refreshStudentPaymentStatus]);

    const recentPaymentsForNl = useMemo(() => {
        if (!student) return [];
        const nm = String(student.name || '').trim();
        const sid = String(student.id || leadId).trim();
        return (payments || [])
            .filter((p) => String(p.status || '').toLowerCase() !== 'cancelled')
            .map((p) => ({
                id: p.$id,
                lead_id: String(p.lead_id || sid).trim(),
                student_id: String(p.lead_id || sid).trim(),
                student_name: nm,
                reference_month: String(p.reference_month || '').trim(),
                amount: Number(p.amount),
                status: String(p.status || ''),
                method: String(p.method || ''),
                note: String(p.note || ''),
                plan_name: String(p.plan_name || ''),
                account: String(p.account || '')
            }));
    }, [payments, student, leadId]);

    const nlPageCtx = useMemo(
        () => ({
            context: 'perfil',
            pipelineStages: pipelineStagesNl,
            recentPayments: recentPaymentsForNl,
        }),
        [pipelineStagesNl, recentPaymentsForNl]
    );
    useNlPageContext(nlPageCtx);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        function onPaymentUpdated() {
            void loadPayments();
        }
        window.addEventListener('navi-student-payment-updated', onPaymentUpdated);
        return () => window.removeEventListener('navi-student-payment-updated', onPaymentUpdated);
    }, [loadPayments]);

    useEffect(() => {
        if (!waTemplatesHook) return;
        setWaCtx({
            name: waNameHook || '',
            zapster: waZapHook || '',
            templates: waTemplatesHook,
        });
    }, [waTemplatesHook, waNameHook, waZapHook]);

    useEffect(() => {
        if (!academyId) return;
        getAcademyDocument(academyId)
            .then((doc) => {
                setExitReasons(readStudentExitReasonsFromAcademyDoc(doc));
                setFreezeReasons(readStudentFreezeReasonsFromAcademyDoc(doc));
                setAcademySettingsDoc(doc);
            })
            .catch(() => {
                setWaCtx({ name: '', zapster: '', templates: DEFAULT_WHATSAPP_TEMPLATES });
                setExitReasons(readStudentExitReasonsFromAcademyDoc(null));
                setFreezeReasons(readStudentFreezeReasonsFromAcademyDoc(null));
                setAcademySettingsDoc(null);
            });
    }, [academyId]);

    const mapLeadEventDocToUi = useCallback((d) => {
        const at = d.at;
        const base = { at, from: d.from, to: d.to, text: d.text || '', $id: d.$id, is_pinned: d.is_pinned };
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
                text: d.text || '',
                $id: d.$id,
                is_pinned: d.is_pinned,
            };
        }
        if (t === 'whatsapp') {
            return {
                type: 'message',
                channel: 'whatsapp',
                text: d.text || 'WhatsApp',
                at,
                meta: payload,
                $id: d.$id,
                is_pinned: d.is_pinned,
            };
        }
        if (t === 'attended') return { type: 'stage_change', from: d.from, to: LEAD_STATUS.COMPLETED, at, text: d.text, $id: d.$id, is_pinned: d.is_pinned };
        if (t === 'missed') return { type: 'stage_change', from: d.from, to: LEAD_STATUS.MISSED, at, text: d.text, $id: d.$id, is_pinned: d.is_pinned };
        if (t === 'converted') return { type: 'stage_change', from: d.from, to: LEAD_STATUS.CONVERTED, at, text: d.text, $id: d.$id, is_pinned: d.is_pinned };
        if (t === 'lost') return { type: 'stage_change', from: d.from, to: LEAD_STATUS.LOST, at, text: d.text, $id: d.$id, is_pinned: d.is_pinned };
        if (t === 'lead_criado') return { type: 'lead_created', at, text: d.text || `${contactLabel} cadastrado no CRM`, $id: d.$id, is_pinned: d.is_pinned };
        return { type: t, ...base };
    }, [contactLabel]);

    const refreshTimeline = useCallback(async () => {
        if (!leadId || !academyId) return;
        setTimelineError(false);
        try {
            const res = await getLeadEvents(leadId, academyId);
            const docs = res.documents || [];
            setTimelineEvents(docs.map(mapLeadEventDocToUi));
        } catch {
            setTimelineError(true);
            setTimelineEvents([]);
        }
    }, [leadId, academyId, mapLeadEventDocToUi]);

    useEffect(() => {
        if (activeTab === 'timeline') void refreshTimeline();
    }, [activeTab, refreshTimeline]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        function onTimelineChanged(e) {
            const evId = String(e?.detail?.leadId || '').trim();
            if (evId && evId === String(leadId || '').trim()) void refreshTimeline();
        }
        window.addEventListener(LEAD_TIMELINE_CHANGED, onTimelineChanged);
        return () => window.removeEventListener(LEAD_TIMELINE_CHANGED, onTimelineChanged);
    }, [leadId, refreshTimeline]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        function onAttendanceChanged(e) {
            const evId = String(e?.detail?.leadId || '').trim();
            if (evId && evId === String(leadId || '').trim()) void loadFrequency();
        }
        window.addEventListener(LEAD_ATTENDANCE_CHANGED, onAttendanceChanged);
        return () => window.removeEventListener(LEAD_ATTENDANCE_CHANGED, onAttendanceChanged);
    }, [leadId, loadFrequency]);

    const filteredTimelineEvents = useMemo(
        () =>
            [...(timelineEvents || [])]
                .filter((ev) => {
                    if (eventTypeFilter === 'all') return true;
                    const t = ev.type || 'note';
                    if (eventTypeFilter === 'note') return t === 'note' || t === 'inbox_note';
                    return false;
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

    const collectionAttempts = useMemo(() => {
        return (timelineEvents || [])
            .filter((ev) => ev.type === 'collection_attempt' || ev.type === 'collection_escalated')
            .map((ev) => {
                let payload = {};
                try {
                    payload =
                        typeof ev.payload_json === 'string'
                            ? JSON.parse(ev.payload_json || '{}')
                            : ev.payload_json || {};
                } catch {
                    payload = {};
                }
                return { ...ev, payload };
            })
            .sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime())
            .slice(0, 8);
    }, [timelineEvents]);

    const cancelDataEdit = useCallback(() => {
        if (!student) return;
        setDataForm({
            name: String(student.name || '').trim(),
            type: student.type || 'Adulto',
            plan: student.plan || '',
            sexo: student.sexo || '',
            ...(() => {
                const t = resolveTurmaFormState(student.turma || student.className, academyTurmas);
                return { turmaSelect: t.selectValue, turmaOther: t.otherText };
            })(),
            enrollmentDate: defaultEnrollmentDateIso(student),
            birthDate: student.birthDate || '',
            phone: maskPhone(String(student.phone || '')),
            email: String(student.email || '').trim(),
            cpf: maskCPF(String(student.cpf || '')),
            responsavel: student.responsavel || '',
            cpfResponsavel: maskCPF(String(student.cpfResponsavel || '')),
            emergencyContact: student.emergencyContact || '',
            emergencyPhone: maskPhone(String(student.emergencyPhone || '')),
            preferredPaymentMethod: student.preferredPaymentMethod || '',
            preferredPaymentAccount: student.preferredPaymentAccount || '',
            dueDay: student.dueDay != null && student.dueDay !== '' ? String(student.dueDay) : '',
        });
        setEmergencySameAsRegistered(
            emergencyMatchesRegistered({
                type: student.type,
                name: student.name,
                responsavel: student.responsavel,
                phone: student.phone,
                emergencyContact: student.emergencyContact,
                emergencyPhone: student.emergencyPhone,
            })
        );
        setEditingData(false);
    }, [student, academyTurmas]);

    const handleSaveData = useCallback(async () => {
        if (!student || savingData) return;
        const name = String(dataForm.name || '').trim();
        if (!name) {
            toast.show({ type: 'error', message: 'Informe o nome do aluno.' });
            return;
        }

        const cpfDigits = String(dataForm.cpf || '').replace(/\D/g, '');
        const cpfRespDigits = String(dataForm.cpfResponsavel || '').replace(/\D/g, '');
        setCpfErrors({ cpf: '', cpfResponsavel: '' });

        if (cpfDigits) {
            if (!isValidCPF(cpfDigits)) {
                setCpfErrors((prev) => ({ ...prev, cpf: 'CPF inválido' }));
                return;
            }
            const dupCpf = await findDuplicateStudentCpf(academyId, cpfDigits, leadId);
            if (dupCpf) {
                setCpfErrors((prev) => ({ ...prev, cpf: 'CPF já cadastrado para outro aluno' }));
                return;
            }
        }
        if (cpfRespDigits && !isValidCPF(cpfRespDigits)) {
            setCpfErrors((prev) => ({ ...prev, cpfResponsavel: 'CPF inválido' }));
            return;
        }

        setSavingData(true);
        try {
            const dueRaw = String(dataForm.dueDay ?? '').trim();
            const dueNum = dueRaw === '' ? null : Number(dueRaw.replace(/[^\d]/g, ''));
            const dueDay =
                dueNum != null && Number.isFinite(dueNum) && dueNum >= 1 && dueNum <= 31 ? Math.trunc(dueNum) : null;
            const accountCheck = validatePreferredPaymentAccount(dataForm.preferredPaymentAccount, financeConfig);
            if (!accountCheck.ok) {
                toast.show({ type: 'error', message: accountCheck.message });
                setSavingData(false);
                return;
            }

            const emailTrim = String(dataForm.email || '').trim();
            if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
                toast.show({ type: 'error', message: 'E-mail inválido.' });
                setSavingData(false);
                return;
            }

            await updateStudent(leadId, {
                name,
                type: student.type || 'Adulto',
                turma: turmaValueFromForm(dataForm.turmaSelect, dataForm.turmaOther),
                sexo: dataForm.sexo || '',
                plan: dataForm.plan,
                enrollmentDate: dataForm.enrollmentDate,
                birthDate: dataForm.birthDate,
                responsavel: dataForm.responsavel,
                cpfResponsavel: String(dataForm.cpfResponsavel || '').replace(/\D/g, ''),
                emergencyContact: dataForm.emergencyContact,
                emergencyPhone: String(dataForm.emergencyPhone || '').replace(/\D/g, ''),
                preferredPaymentMethod: dataForm.preferredPaymentMethod,
                preferredPaymentAccount: dataForm.preferredPaymentAccount,
                dueDay,
                cpf: String(dataForm.cpf || '').replace(/\D/g, ''),
                phone: String(dataForm.phone || '').replace(/\D/g, ''),
                email: String(dataForm.email || '').trim(),
            });
            setEditingData(false);
            toast.success('Dados salvos com sucesso.');
        } catch (e) {
            toast.error(e, 'save');
        } finally {
            setSavingData(false);
        }
    }, [student, savingData, leadId, academyId, dataForm, updateStudent, toast, financeConfig]);

    const sendTemplateKey = async (key) => {
        if (sendingWhatsapp || !student) return;
        setSendingWhatsapp(true);
        setTemplateMenuOpen(false);
        try {
            const r = await sendWhatsappTemplateOutbound({
                lead: student,
                academyId,
                academyName: waCtx.name,
                templateKey: key,
                templatesMap: waCtx.templates,
                zapsterInstanceId: waCtx.zapster,
                onToast: (t) => toast.show(t),
            });
            if (!r?.ok) return;
            try {
                const label = WHATSAPP_TEMPLATE_LABELS[key] || key;
                await addLeadEvent({
                    academyId,
                    leadId: leadId,
                    type: 'message',
                    text: `WhatsApp: template “${label}”`,
                    createdBy: userId || 'user',
                    permissionContext: permCtx,
                });
                await updateStudent(leadId, { lastWhatsappActivityAt: new Date().toISOString() });
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
                leadId: leadId,
                type: 'note',
                text: note.trim().slice(0, 1000),
                createdBy: userId || 'user',
                permissionContext: permCtx,
            });
            await updateStudent(leadId, { lastNoteAt: new Date().toISOString() });
            setNote('');
            toast.success('Nota adicionada.');
        } catch (e) {
            toast.error(e, 'save');
        } finally {
            setAddingNote(false);
        }
    };

    const runDeleteStudent = async () => {
        if (deleteBusy) return;
        setDeleteBusy(true);
        try {
            await deleteStudent(leadId);
            toast.success(`${terms.student} excluído com sucesso.`);
            setConfirmDeleteOpen(false);
            navigate('/students');
        } catch (e) {
            toast.error(e, 'delete');
        } finally {
            setDeleteBusy(false);
        }
    };

    const handleConfirmDeactivate = async ({
        exitReason,
        exitDate,
        exitNotes,
        cancelFuturePayments,
        sendRescissionTerm,
    }) => {
        if (deactivateBusy || !student) return;
        setDeactivateBusy(true);
        try {
            let academyDoc = null;
            if (academyId) {
                academyDoc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
            }
            const { tasksCreated, paymentsCancelled } = await deactivateStudent({
                student,
                leadId,
                academyId,
                userId,
                permCtx,
                exitReason,
                exitDate,
                exitNotes,
                cancelFuturePayments: cancelFuturePayments === true,
                mergeStudent,
                refreshPaymentStatus: refreshStudentPaymentStatus,
                academySettingsRaw: academyDoc?.settings,
            });
            setDeactivateOpen(false);
            if (sendRescissionTerm) {
                setRescissionLeadOverrides({
                    exitDate: String(exitDate || '').slice(0, 10),
                    exitReason: String(exitReason || '').trim(),
                });
                setActiveTab('contracts');
                setTimelineOpen(true);
                void fetchStudentById(leadId).finally(() => setRescissionContractOpen(true));
            }
            let msg = `${terms.student} desligado com sucesso.`;
            if (sendRescissionTerm) {
                msg += ' Envie o termo de rescisão no passo a seguir.';
            }
            if (paymentsCancelled > 0) {
                msg += ` ${paymentsCancelled} cobrança(s) futura(s) cancelada(s).`;
            }
            if (tasksCreated > 0) {
                msg += ` ${tasksCreated} tarefa${tasksCreated === 1 ? '' : 's'} de desligamento foram criadas.`;
            }
            toast.show({ type: 'success', message: msg });
            void refreshTimeline();
            void loadPayments();
        } catch (e) {
            toast.error(e, 'save');
        } finally {
            setDeactivateBusy(false);
        }
    };

    const handleReactivate = async () => {
        if (reactivateBusy || !student) return;
        setReactivateBusy(true);
        try {
            await reactivateStudent({
                leadId,
                leadName: String(student?.name || '').trim(),
                academyId,
                userId,
                permCtx,
                mergeStudent,
                refreshPaymentStatus: refreshStudentPaymentStatus,
            });
            toast.success(`${terms.student} reativado com sucesso.`);
            void refreshTimeline();
        } catch (e) {
            toast.error(e, 'save');
        } finally {
            setReactivateBusy(false);
        }
    };

    const handleCheckin = async () => {
        if (checkingIn || !leadId || !academyId) return;
        setCheckingIn(true);
        try {
            const doc = await createCheckin(
                {
                    lead_id: leadId,
                    academy_id: academyId,
                    checked_in_by: userId || 'user',
                    checked_in_by_name: sessionUserName,
                },
                permCtx
            );
            toast.success(`${terms.attendance} registrada!`);
            setCheckins((prev) => [doc, ...prev]);
            setFreqStats((prev) => {
                if (!prev) {
                    return {
                        thisMonth: 1,
                        lastMonth: 0,
                        total: 1,
                        monthlyRate: ((1 / 26) * 100).toFixed(0) + '%',
                    };
                }
                const newThis = prev.thisMonth + 1;
                const newTotal = prev.total + 1;
                return {
                    ...prev,
                    thisMonth: newThis,
                    total: newTotal,
                    monthlyRate: ((newThis / 26) * 100).toFixed(0) + '%',
                };
            });
            emitLeadAttendanceChanged(leadId);
        } catch (e) {
            toast.show({ type: 'error', message: friendlyError(e, 'save') || `Não foi possível registrar a ${terms.attendance.toLowerCase()}.` });
        } finally {
            setCheckingIn(false);
        }
    };

    const closePaymentModal = useCallback(() => {
        setShowPaymentModal(false);
        setEditingPaymentId(null);
        setPayFormError('');
    }, []);

    const openPaymentModal = useCallback((presetType = PAYMENT_CATEGORY.PLAN) => {
        if (!student) return;
        setEditingPaymentId(null);
        setPayFormError('');
        setPayForm({ ...buildDefaultPayForm(student, financeConfig), payment_type: presetType });
        setShowPaymentModal(true);
    }, [student, financeConfig]);

    const openEditPaymentModal = useCallback(
        (payment) => {
            if (!student || !payment?.$id) return;
            setEditingPaymentId(payment.$id);
            setPayFormError('');
            setPayForm(paymentFormFromDoc(payment, student, financeConfig));
            setShowPaymentModal(true);
        },
        [student, financeConfig]
    );

    const saveStudentPayment = useCallback(async () => {
        if (!student || !academyId || savingPayment) return;
        setPayFormError('');
        const paymentType = payForm.payment_type || PAYMENT_CATEGORY.PLAN;
        const desc = String(payForm.note || '').trim();
        const isEdit = Boolean(editingPaymentId);

        if (paymentType === PAYMENT_CATEGORY.FEE && !desc) {
            toast.show({ type: 'error', message: 'Informe a descrição da taxa (ex.: taxa de competição).' });
            return;
        }

        if (isEdit && (paymentType === PAYMENT_CATEGORY.BUNDLE || paymentType === PAYMENT_MODAL_PRODUCT)) {
            toast.show({ type: 'error', message: 'Este tipo de lançamento não pode ser editado aqui.' });
            return;
        }

        const amountNum = centsToNumber(parseMaskToCents(payForm.amount));
        if (!Number.isFinite(amountNum) || amountNum <= 0) {
            toast.show({ type: 'error', message: 'Informe um valor maior que zero.' });
            return;
        }

        const trocoCheck = validateStudentPaymentTroco(payForm, amountNum, financeConfig);
        if (!trocoCheck.ok) {
            toast.show({ type: 'error', message: trocoCheck.message });
            return;
        }

        const accountCheck = validateBankAccountForPayment(payForm.account, financeConfig);
        if (!accountCheck.ok) {
            toast.show({ type: 'error', message: accountCheck.message });
            return;
        }
        const paymentAccount = accountCheck.account || payForm.account || '';

        const paidAtIso =
            (payForm.status === 'paid' || paymentType === PAYMENT_CATEGORY.FEE || paymentType === PAYMENT_CATEGORY.OTHER) &&
            payForm.paid_at
                ? new Date(payForm.paid_at).toISOString()
                : null;

        const paidAtYmd = payForm.paid_at ? String(payForm.paid_at).slice(0, 10) : '';
        if (!skipFuturePaidDateRef.current && paidAtIso && isPaymentDateInFuture(paidAtYmd)) {
            setFuturePaidDateLabel(formatPaymentDateLabel(paidAtYmd));
            return;
        }
        skipFuturePaidDateRef.current = false;

        const data = {
            lead_id: student.id,
            academy_id: academyId,
            amount: amountNum,
            paid_amount: amountNum,
            method: payForm.method,
            account: paymentAccount,
            plan_name: payForm.plan_name || student.plan || '',
            status: payForm.status,
            payment_category: paymentType,
            due_date:
                payForm.status === 'pending' && payForm.due_date
                    ? new Date(payForm.due_date).toISOString()
                    : null,
            paid_at: paidAtIso,
            registered_by: userId || '',
            registered_by_name: sessionUserName,
            note: desc,
            ...trocoFieldsForPaymentPayload(payForm, amountNum, financeConfig),
        };

        if (paymentType === PAYMENT_CATEGORY.BUNDLE) {
            data.bundle_months = Number(payForm.bundle_months) || 12;
            data.coverage_start_month = payForm.bundle_start_month;
            data.reference_month = payForm.bundle_start_month;
        } else if (paymentType === PAYMENT_CATEGORY.FEE || paymentType === PAYMENT_CATEGORY.OTHER) {
            data.reference_month = null;
        } else {
            data.reference_month = payForm.reference_month;
        }

        setSavingPayment(true);
        try {
            const doc = isEdit
                ? await updatePayment(editingPaymentId, data)
                : await createPayment(data);
            await loadPayments();
            void fetchStudentById(student.id);
            const localYm = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
            if (
                doc.reference_month === localYm &&
                (paymentType === PAYMENT_CATEGORY.PLAN || paymentType === PAYMENT_CATEGORY.BUNDLE)
            ) {
                const profileSt = normalizeProfilePaymentStatus(doc.status);
                if (profileSt === 'paid') setPaymentStatus({ status: 'paid', payment: doc });
                else if (profileSt === 'pending') setPaymentStatus({ status: 'pending', payment: doc });
            }
            closePaymentModal();
            toast.show({
                type: 'success',
                message: isEdit ? 'Pagamento atualizado.' : 'Pagamento registrado.',
            });
        } catch (e) {
            const isDup =
                (e instanceof StudentPaymentsApiError && e.status === 409) ||
                String(e?.message || '').includes('Já existe um lançamento');
            if (isDup) {
                setPayFormError(
                    'Já existe um lançamento com este valor e data para este aluno.'
                );
                return;
            }
            toast.error(e, 'save');
        } finally {
            setSavingPayment(false);
        }
    }, [
        student,
        academyId,
        savingPayment,
        payForm,
        editingPaymentId,
        userId,
        sessionUserName,
        toast,
        financeConfig,
        loadPayments,
        closePaymentModal,
        fetchStudentById,
    ]);

    const handleConfirmDeletePayment = useCallback(async () => {
        if (!deletePaymentTarget?.$id || !academyId || deletePaymentBusy) return;
        setDeletePaymentBusy(true);
        try {
            await deletePayment(deletePaymentTarget.$id, academyId);
            await loadPayments();
            setDeletePaymentTarget(null);
            toast.success('Lançamento excluído.');
        } catch (e) {
            toast.error(e, 'delete');
        } finally {
            setDeletePaymentBusy(false);
        }
    }, [deletePaymentTarget, academyId, deletePaymentBusy, loadPayments, toast]);

    const handleCancelCoverage = useCallback(
        async ({ anchor_id, from_reference_month, refundAmount }) => {
            if (!student || !academyId || cancellingCoverage) return;
            setCancellingCoverage(true);
            try {
                await cancelBundleCoverageFromMonth({
                    lead_id: student.id,
                    academy_id: academyId,
                    anchor_id,
                    from_reference_month,
                    payments,
                    registered_by: userId || '',
                    registered_by_name: sessionUserName,
                    refundAmount,
                    note: `Cancelamento cobertura a partir de ${from_reference_month}`,
                });
                await loadPayments();
                toast.success('Cobertura cancelada.');
            } catch (e) {
                toast.error(e, 'save');
            } finally {
                setCancellingCoverage(false);
            }
        },
        [student, academyId, cancellingCoverage, payments, userId, sessionUserName, loadPayments, toast]
    );

    const setProfileTab = useCallback(
        (tabId) => {
            setActiveTab(tabId);
            setTimelineOpen(true);
            setSearchParams(
                (prev) => {
                    const next = new URLSearchParams(prev);
                    if (tabId === 'frequency') next.delete('tab');
                    else next.set('tab', tabId);
                    return next;
                },
                { replace: true }
            );
        },
        [setSearchParams]
    );

    const handleConversationClose = useCallback(() => {
        setProfileTab('frequency');
    }, [setProfileTab]);

    const handleRequestEditPhone = useCallback(() => {
        setTimelineOpen(false);
        setEditingData(true);
    }, []);

    const inputStyle = {
        padding: '9px 12px',
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        color: 'var(--text)',
        fontSize: 14,
        width: '100%',
        boxSizing: 'border-box',
        fontFamily: 'inherit',
    };

    if ((loading || profileResolving) && !student) {
        return (
            <div className="container lead-profile-loading" style={{ paddingTop: 24, paddingBottom: 40, minHeight: '100vh' }}>
                <div className="lead-profile-inner">
                    <div className="lead-profile-skeleton-bar lead-profile-skeleton-bar--title" aria-hidden />
                    <div className="lead-profile-skeleton-card mt-4">
                        <div className="lead-profile-skeleton-bar lead-profile-skeleton-bar--line" />
                        <div className="lead-profile-skeleton-bar lead-profile-skeleton-bar--line short" />
                        <div className="lead-profile-skeleton-bar lead-profile-skeleton-bar--line" />
                    </div>
                    <p className="text-small text-light mt-4" style={{ textAlign: 'center' }}>
                        Carregando perfil…
                    </p>
                </div>
            </div>
        );
    }

    if (!student) {
        return (
            <div className="container" style={{ paddingTop: 40, textAlign: 'center', minHeight: '100vh' }}>
                <p className="text-light">{terms.student} não encontrado.</p>
                <button type="button" className="btn-primary mt-4" onClick={() => navigate('/students')}>
                    Voltar aos {terms.students.toLowerCase()}
                </button>
            </div>
        );
    }

    const phoneHasDigits = Boolean(String(student.phone || '').replace(/\D/g, '').length);
    const attendanceReady = isAttendanceConfigured();
    const studentsPlural = terms.students;
    const currentYm = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const currentMonthExtended = formatReferenceMonthLong(currentYm);
    const studentPhotoUrl = String(student.photo_url || '').trim();
    const studentDisplayName = editingData
        ? String(dataForm.name || '').trim() || 'Sem nome'
        : student.name || 'Sem nome';
    const studentInitials = studentDisplayName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0].toUpperCase())
        .join('');

    const displayStudentFieldValue = (key, raw) => {
        if (key === 'enrollmentDate' || key === 'birthDate') {
            const br = formatDateBR(raw);
            return br || '';
        }
        if (key === 'cpf' || key === 'cpfResponsavel') {
            const s = String(raw ?? '').replace(/\D/g, '');
            return s ? maskCPF(s) : '';
        }
        if (key === 'phone') {
            return formatPhone(raw) || '';
        }
        if (key === 'email') {
            return String(raw ?? '').trim();
        }
        if (key === 'preferredPaymentMethod') {
            const v = String(raw ?? '').trim();
            return v ? METHOD_PAYMENT_LABELS[v] || v : '';
        }
        if (key === 'dueDay') {
            const n = Number(raw);
            return Number.isFinite(n) && n >= 1 && n <= 31 ? `Dia ${Math.trunc(n)}` : '';
        }
        if (key === 'sexo') return sexoDisplayLabel(raw);
        if (key === 'turma') {
            const t = String(student?.turma || student?.className || raw || '').trim();
            return t;
        }
        return raw != null && String(raw).trim() ? String(raw).trim() : '';
    };

    const dataFormInputStyle = {
        width: '100%',
        boxSizing: 'border-box',
        padding: '6px 10px',
        fontSize: 13,
        borderRadius: 'var(--radius-sm)',
        border: '0.5px solid var(--border-light)',
        background: 'var(--surface)',
        color: 'var(--text)',
        fontFamily: 'inherit',
    };

    const renderStudentDataViewRow = (field) => {
        const raw = field.key === 'turma' ? student.turma || student.className : student[field.key];
        const shown = displayStudentFieldValue(field.key, raw);
        const empty = !shown;
        return (
            <div
                key={field.key}
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 0',
                    borderBottom: '0.5px solid var(--border-light)',
                }}
            >
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, flexShrink: 0 }}>{field.label}</span>
                <span
                    style={{
                        fontSize: 13,
                        color: empty ? 'var(--text-secondary)' : 'var(--text)',
                        fontStyle: 'normal',
                        textAlign: 'right',
                        maxWidth: '58%',
                        wordBreak: 'break-word',
                    }}
                >
                    {empty ? '—' : shown}
                </span>
            </div>
        );
    };

    const renderStudentDataEditRow = (field) => (
        <div key={field.key} style={{ marginBottom: 12 }}>
            <label
                htmlFor={`student-data-${field.key}`}
                style={{
                    display: 'block',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    marginBottom: 6,
                }}
            >
                {field.label}
            </label>
            {field.type === 'sexo' ? (
                <SexoSelect
                    id={`student-data-${field.key}`}
                    className="student-profile-data-input"
                    style={dataFormInputStyle}
                    disabled={savingData}
                    value={dataForm.sexo}
                    onChange={(v) => setDataForm((p) => ({ ...p, sexo: v }))}
                />
            ) : field.type === 'turma' ? (
                <TurmaSelect
                    id="student-data-turma"
                    otherId="student-data-turma-other"
                    turmas={academyTurmas}
                    selectValue={dataForm.turmaSelect}
                    otherText={dataForm.turmaOther}
                    onSelectChange={(v) => setDataForm((p) => ({ ...p, turmaSelect: v }))}
                    onOtherChange={(v) => setDataForm((p) => ({ ...p, turmaOther: v }))}
                    className="student-profile-data-input"
                    style={dataFormInputStyle}
                    disabled={savingData}
                />
            ) : field.type === 'plan' ? (
                <PlanSelect
                    id={`student-data-${field.key}`}
                    financeConfig={financeConfig}
                    value={dataForm.plan}
                    onChange={(v) => setDataForm((p) => ({ ...p, plan: v }))}
                    className="student-profile-data-input"
                    style={dataFormInputStyle}
                    disabled={savingData}
                />
            ) : field.type === 'select' && Array.isArray(field.options) ? (
                <select
                    id={`student-data-${field.key}`}
                    className="student-profile-data-input"
                    disabled={savingData || field.disabled}
                    value={dataForm[field.key] ?? ''}
                    onChange={(e) => setDataForm((p) => ({ ...p, [field.key]: e.target.value }))}
                    style={{ ...dataFormInputStyle, cursor: 'pointer' }}
                >
                    <option value="">Selecione…</option>
                    {field.options.map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.label}
                        </option>
                    ))}
                </select>
            ) : field.type === 'email' ? (
                <input
                    id={`student-data-${field.key}`}
                    type="email"
                    className="student-profile-data-input"
                    placeholder={field.placeholder}
                    disabled={savingData || field.disabled}
                    value={dataForm[field.key] ?? ''}
                    onChange={(e) => setDataForm((p) => ({ ...p, [field.key]: e.target.value.trim() }))}
                    style={dataFormInputStyle}
                    autoComplete="email"
                />
            ) : field.type === 'date' ? (
                <DateInputField
                    id={`student-data-${field.key}`}
                    type="date"
                    className="student-profile-data-input form-input"
                    placeholder={field.placeholder}
                    disabled={savingData || field.disabled}
                    value={dataForm[field.key] ?? ''}
                    onChange={(e) => setDataForm((p) => ({ ...p, [field.key]: e.target.value }))}
                />
            ) : (
                <input
                    id={`student-data-${field.key}`}
                    type={field.type === 'sexo' || field.type === 'turma' ? 'text' : field.type}
                    className="student-profile-data-input"
                    placeholder={field.placeholder}
                    disabled={savingData || field.disabled}
                    value={dataForm[field.key] ?? ''}
                    onChange={(e) => {
                        let v = e.target.value;
                        if (field.key === 'cpf' || field.key === 'cpfResponsavel') {
                            v = maskCPF(e.target.value);
                            setCpfErrors((prev) => ({ ...prev, [field.key]: '' }));
                        } else if (field.key === 'phone') v = maskPhone(e.target.value);
                        setDataForm((p) => ({ ...p, [field.key]: v }));
                    }}
                    onBlur={
                        field.key === 'cpf' || field.key === 'cpfResponsavel'
                            ? () => {
                                  const digits = String(dataForm[field.key] || '').replace(/\D/g, '');
                                  if (!digits) {
                                      setCpfErrors((prev) => ({ ...prev, [field.key]: '' }));
                                      return;
                                  }
                                  setCpfErrors((prev) => ({
                                      ...prev,
                                      [field.key]: isValidCPF(digits) ? '' : 'CPF inválido',
                                  }));
                              }
                            : undefined
                    }
                    style={dataFormInputStyle}
                />
            )}
            {field.key === 'cpf' && cpfErrors.cpf ? (
                <FieldError>{cpfErrors.cpf}</FieldError>
            ) : null}
            {field.key === 'cpfResponsavel' && cpfErrors.cpfResponsavel ? (
                <FieldError>{cpfErrors.cpfResponsavel}</FieldError>
            ) : null}
            {field.key === 'enrollmentDate' ? (
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    Padrão: data do cadastro. Altere se a matrícula for retroativa.
                </p>
            ) : null}
            {field.key === 'email' ? (
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    Usado em contratos digitais e comunicações por e-mail.
                </p>
            ) : null}
        </div>
    );

    const sectionEyebrowStyle = {
        margin: '0 0 10px',
        fontSize: 11,
        fontWeight: 800,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
    };

    const renderOperationalActionsSection = () => (
        <div style={{ marginBottom: 22, width: '100%', textAlign: 'left' }}>
            <p style={sectionEyebrowStyle}>Matrícula</p>
            {isActiveStudent(student) ? (
                <>
                    {isFreezeActive(student) ? (
                        <button
                            type="button"
                            onClick={() => void handleEndFreezeEarly()}
                            disabled={endFreezeBusy}
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                padding: '10px 12px',
                                marginBottom: 8,
                                borderRadius: 10,
                                border: '1px solid #fbbf24',
                                background: '#fffbeb',
                                color: '#b45309',
                                fontWeight: 700,
                                fontSize: 13,
                                cursor: endFreezeBusy ? 'not-allowed' : 'pointer',
                                fontFamily: 'inherit',
                                opacity: endFreezeBusy ? 0.7 : 1,
                            }}
                        >
                            {endFreezeBusy ? 'Encerrando…' : 'Encerrar trancamento'}
                        </button>
                    ) : canStartPlanFreeze(student, financeConfig) ? (
                        <button
                            type="button"
                            onClick={() => setFreezeModalOpen(true)}
                            disabled={freezeBusy}
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                padding: '10px 12px',
                                marginBottom: 8,
                                borderRadius: 10,
                                border: '1px solid #fbbf24',
                                background: 'var(--surface)',
                                color: '#b45309',
                                fontWeight: 700,
                                fontSize: 13,
                                cursor: freezeBusy ? 'not-allowed' : 'pointer',
                                fontFamily: 'inherit',
                                opacity: freezeBusy ? 0.7 : 1,
                            }}
                        >
                            <PauseCircle size={16} /> Trancar matrícula
                        </button>
                    ) : String(student.plan || '').trim() ? (
                        <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                            Trancamento disponível para planos anuais (até 90 dias por ano do plano).
                        </p>
                    ) : null}
                </>
            ) : isInactiveStudent(student) ? (
                <>
                    {modules?.finance === true ? (
                        <button
                            type="button"
                            onClick={() => {
                                setRescissionLeadOverrides(null);
                                setActiveTab('contracts');
                                setTimelineOpen(true);
                                void fetchStudentById(leadId).finally(() => setRescissionContractOpen(true));
                            }}
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                padding: '10px 12px',
                                marginBottom: 8,
                                borderRadius: 10,
                                border: '1px solid var(--purple)',
                                background: 'var(--v50, var(--azul-gelo))',
                                color: 'var(--purple)',
                                fontWeight: 700,
                                fontSize: 13,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >
                            <FileSignature size={16} /> Enviar termo de rescisão
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => void handleReactivate()}
                        disabled={reactivateBusy}
                        style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            padding: '10px 12px',
                            marginBottom: 8,
                            borderRadius: 10,
                            border: '1px solid var(--success)',
                            background: 'var(--success-light)',
                            color: 'var(--success)',
                            fontWeight: 700,
                            fontSize: 13,
                            cursor: reactivateBusy ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit',
                            opacity: reactivateBusy ? 0.7 : 1,
                        }}
                    >
                        {reactivateBusy ? 'Reativando…' : `Reativar ${terms.student.toLowerCase()}`}
                    </button>
                </>
            ) : null}
        </div>
    );

    const renderDangerZoneSection = () => (
        <div
            style={{
                marginBottom: 22,
                width: '100%',
                textAlign: 'left',
                paddingTop: 16,
                borderTop: '1px solid var(--border-light)',
            }}
        >
            <p style={sectionEyebrowStyle}>Zona de risco</p>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                Ações de saída ou remoção definitiva — use com cuidado.
            </p>
            {isActiveStudent(student) ? (
                <button
                    type="button"
                    onClick={() => setDeactivateOpen(true)}
                    style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        padding: '10px 12px',
                        marginBottom: 8,
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                    }}
                >
                    <AlertTriangle size={16} /> Desligar {terms.student.toLowerCase()}
                </button>
            ) : null}
            <button
                type="button"
                onClick={() => setConfirmDeleteOpen(true)}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid var(--danger)',
                    background: 'var(--danger-light, #fef2f2)',
                    color: 'var(--danger)',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                }}
            >
                <Trash2 size={16} /> Excluir {terms.student.toLowerCase()}
            </button>
        </div>
    );

    const leftColumn = (
        <div
            className="student-panel-left-col"
            style={{
                display: stackedLayout && timelineOpen ? 'none' : 'flex',
                width:
                    stackedLayout && timelineOpen
                        ? 0
                        : stackedLayout
                          ? '100%'
                          : timelineOpen
                            ? '360px'
                            : 'auto',
                flex:
                    stackedLayout && timelineOpen
                        ? '0 0 0'
                        : stackedLayout && !timelineOpen
                          ? '1 1 0%'
                          : !stackedLayout && !timelineOpen
                            ? '1 1 0%'
                            : '0 0 auto',
                maxWidth: !stackedLayout && !timelineOpen ? 560 : undefined,
                flexShrink: !stackedLayout && timelineOpen ? 0 : 0,
                overflow: 'hidden',
                flexDirection: 'column',
                borderRight: stackedLayout ? 'none' : '1px solid var(--border)',
                background: 'var(--surface)',
                minHeight: 0,
                minWidth: 0,
                transition: 'width 0.25s ease, flex 0.25s ease, max-width 0.25s ease',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '12px 14px',
                    borderBottom: '1px solid var(--border-light)',
                    flexShrink: 0,
                }}
            >
                <button
                    type="button"
                    onClick={() => navigate('/students')}
                    style={{
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        fontFamily: 'inherit',
                        padding: 4,
                    }}
                >
                    ← {studentsPlural}
                </button>
            </div>

            <div className="student-panel-left__scroll" style={{ padding: '16px 14px' }}>
                <div className="student-profile-hd">
                    {/* Avatar com iniciais */}
                    <div className="student-profile-hd__avatar">
                        {studentPhotoUrl ? (
                            <img
                                src={studentPhotoUrl}
                                alt=""
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                        ) : (
                            <span className="student-profile-hd__initials">{studentInitials}</span>
                        )}
                    </div>
                    <div className="student-profile-hd__body">
                    <h2 className="student-profile-hd__name">{studentDisplayName}</h2>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        <StudentStatusBadge
                            status={resolveStudentListStatus(student, paymentStatus)}
                        />
                        {modules?.finance === true ? (
                            <StudentOverdueBadge student={student} financeConfig={financeConfig} />
                        ) : null}
                        {modules?.finance === true && student?.id ? (
                            <StudentContractHeaderChip
                                leadId={student.id}
                                onOpenContractsTab={() => {
                                    setProfileTab('contracts');
                                    setTimelineOpen(true);
                                }}
                            />
                        ) : null}
                    </div>
                    {/* Plano + vencimento */}
                    <div className="student-profile-hd__meta">
                        {String(student.plan || '').trim() ? (
                            <span className="student-profile-hd__plan">{student.plan}</span>
                        ) : null}
                        {student.dueDay ? (
                            <span className="student-profile-hd__due">Vence dia {student.dueDay}</span>
                        ) : null}
                    </div>

                    {/* Contato */}
                    <div className="student-profile-hd__contact">
                        {formatPhone(student.phone) || '—'}
                        {String(student.email || '').trim() ? (
                            <span> · {String(student.email).trim()}</span>
                        ) : null}
                    </div>

                    {/* Turma */}
                    {String(student.turma || student.className || '').trim() ? (
                        <span className="student-profile-hd__turma">
                            Turma: {String(student.turma || student.className).trim()}
                        </span>
                    ) : null}

                    {/* Saída ou trancamento */}
                    {isInactiveStudent(student) && (student.exitReason || student.exitDate) ? (
                        <p className="student-profile-hd__exit">
                            {student.exitReason ? <>Motivo: {student.exitReason}</> : null}
                            {student.exitReason && student.exitDate ? ' · ' : null}
                            {student.exitDate ? <>Saída: {formatDateBR(student.exitDate)}</> : null}
                        </p>
                    ) : null}
                    {isActiveStudent(student) && isFreezeActive(student) ? (
                        <p className="student-profile-hd__freeze">
                            Matrícula trancada
                            {String(student.freeze_end || '').slice(0, 10)
                                ? ` até ${formatFreezeDateBr(String(student.freeze_end).slice(0, 10))}`
                                : ' (retorno indefinido)'}
                            {activeFreezeReasonFromHistory(planFreezes, student)
                                ? ` · ${activeFreezeReasonFromHistory(planFreezes, student)}`
                                : ''}
                        </p>
                    ) : null}

                    </div>{/* fecha student-profile-hd__body */}
                </div>{/* fecha student-profile-hd */}

                <div
                    style={{
                        borderRadius: 10,
                        padding: '12px 14px',
                        marginBottom: 8,
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 10,
                        background:
                            paymentStatus === null && loadingPayments
                                ? BG_SECONDARY
                                : paymentStatus?.status === 'paid'
                                  ? '#EAF3DE'
                                  : paymentStatus?.status === 'pending'
                                    ? '#FCEBEB'
                                    : 'var(--surface-hover)',
                    }}
                >
                    <div style={{ minWidth: 0 }}>
                        {paymentStatus === null && loadingPayments ? (
                            <>
                                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Carregando...</div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Status do mês</div>
                            </>
                        ) : paymentStatus?.status === 'paid' ? (
                            <>
                                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Pagamento em dia</div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.45 }}>
                                    {currentMonthExtended} · pago em{' '}
                                    {formatDateBR(String(paymentStatus.payment?.paid_at || '').slice(0, 10)) || '—'}
                                </div>
                            </>
                        ) : paymentStatus?.status === 'pending' ? (
                            <>
                                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Pagamento pendente</div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.45 }}>
                                    {currentMonthExtended} ·{' '}
                                    {paymentStatus.payment?.due_date
                                        ? `vence ${formatDateBR(String(paymentStatus.payment.due_date).slice(0, 10))}`
                                        : 'vencimento não definido'}
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Sem registro este mês</div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.45 }}>
                                    Registre o pagamento na aba Pagamentos
                                </div>
                            </>
                        )}
                    </div>
                    {paymentStatus === null && loadingPayments ? (
                        <span className="badge-secondary" style={{ fontSize: 10, borderRadius: 6, padding: '2px 8px', flexShrink: 0 }}>
                            …
                        </span>
                    ) : paymentStatus?.status === 'paid' ? (
                        <span className="badge-success" style={{ fontSize: 10, borderRadius: 6, padding: '2px 8px', flexShrink: 0 }}>
                            Em dia
                        </span>
                    ) : paymentStatus?.status === 'pending' ? (
                        <span className="badge-danger" style={{ fontSize: 10, borderRadius: 6, padding: '2px 8px', flexShrink: 0 }}>
                            Pendente
                        </span>
                    ) : (
                        <span className="badge-secondary" style={{ fontSize: 10, borderRadius: 6, padding: '2px 8px', flexShrink: 0 }}>
                            Não registrado
                        </span>
                    )}
                </div>

                {collectionAttempts.length > 0 ? (
                    <div
                        style={{
                            marginBottom: 16,
                            padding: '12px 14px',
                            borderRadius: 10,
                            border: '0.5px solid var(--border-light)',
                            background: 'var(--surface-hover)',
                        }}
                    >
                        <p
                            style={{
                                margin: '0 0 8px',
                                fontSize: 11,
                                fontWeight: 800,
                                color: 'var(--text-muted)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                            }}
                        >
                            Tentativas de cobrança
                        </p>
                        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {collectionAttempts.map((ev) => {
                                const when = new Date(ev.at || Date.now()).toLocaleDateString('pt-BR');
                                const isEscalation = ev.type === 'collection_escalated';
                                const resultLabel = ev.payload?.result
                                    ? formatCollectionResultLabel(ev.payload.result)
                                    : null;
                                return (
                                    <li key={ev.$id || `${ev.at}-${ev.type}`} style={{ fontSize: 12, lineHeight: 1.45 }}>
                                        <strong>{when}</strong>
                                        {isEscalation ? (
                                            <span style={{ color: 'var(--text-secondary)' }}> · {ev.text || 'Escalada'}</span>
                                        ) : (
                                            <span style={{ color: 'var(--text-secondary)' }}>
                                                {' '}
                                                · {ev.payload?.stage || 'Cobrança'}
                                                {resultLabel ? ` · ${resultLabel}` : ''}
                                                {ev.payload?.notes ? ` — ${ev.payload.notes}` : ''}
                                            </span>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ) : null}

                <button
                    type="button"
                    disabled={checkingIn || !leadId || !academyId || !attendanceReady}
                    onClick={() => void handleCheckin()}
                    style={{
                        width: '100%',
                        marginBottom: 22,
                        padding: '12px 14px',
                        borderRadius: 10,
                        background: 'var(--petroleo)',
                        border: 'none',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: checkingIn || !leadId || !academyId || !attendanceReady ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit',
                        opacity: checkingIn || !leadId || !academyId || !attendanceReady ? 0.65 : 1,
                    }}
                >
                    {checkingIn ? 'Registrando...' : `+ Registrar ${terms.attendance.toLowerCase()}`}
                </button>

                <div style={{ marginBottom: 22 }}>
                    <p
                        style={{
                            margin: '0 0 10px',
                            fontSize: 11,
                            fontWeight: 800,
                            color: 'var(--text-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                        }}
                    >
                        Comunicação
                    </p>
                    <div ref={waTemplateMenuRef} style={{ display: 'flex', gap: 8, alignItems: 'stretch', position: 'relative' }}>
                        <button
                            type="button"
                            disabled={!phoneHasDigits || sendingWhatsapp}
                            onClick={() => void handleWhatsAppPrimary()}
                            style={{
                                flex: 1,
                                height: 40,
                                borderRadius: 10,
                                border: 'none',
                                background: 'var(--petroleo)',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: 14,
                                cursor: !phoneHasDigits || sendingWhatsapp ? 'not-allowed' : 'pointer',
                                opacity: !phoneHasDigits ? 0.5 : 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                fontFamily: 'inherit',
                            }}
                        >
                            <MessageCircle size={16} /> {sendingWhatsapp ? 'Enviando…' : 'WhatsApp'}
                        </button>
                        <button
                            type="button"
                            disabled={!phoneHasDigits || sendingWhatsapp}
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setTemplateMenuOpen((o) => !o);
                            }}
                            style={{
                                width: 44,
                                borderRadius: 10,
                                border: '1px solid var(--border)',
                                background: 'var(--surface)',
                                cursor: !phoneHasDigits || sendingWhatsapp ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                            aria-label="Templates WhatsApp"
                        >
                            <ChevronDown size={18} color="var(--text-secondary)" />
                        </button>
                        {templateMenuOpen ? (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    marginTop: 6,
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 10,
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                                    zIndex: 20,
                                    maxHeight: 220,
                                    overflowY: 'auto',
                                }}
                            >
                                {Object.entries(waCtx.templates)
                                    .filter(([, text]) => typeof text === 'string' && String(text).trim())
                                    .map(([key]) => (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => void sendTemplateKey(key)}
                                            style={{
                                                display: 'block',
                                                width: '100%',
                                                textAlign: 'left',
                                                padding: '10px 14px',
                                                border: 'none',
                                                borderBottom: '1px solid var(--border-light)',
                                                background: 'none',
                                                fontSize: 13,
                                                cursor: 'pointer',
                                                fontFamily: 'inherit',
                                                color: 'var(--text)',
                                            }}
                                        >
                                            {WHATSAPP_TEMPLATE_LABELS[key] || key}
                                        </button>
                                    ))}
                            </div>
                        ) : null}
                    </div>
                </div>

                {renderOperationalActionsSection()}

                <div style={{ marginBottom: 8 }}>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 10,
                            marginBottom: 12,
                        }}
                    >
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Dados do {terms.student.toLowerCase()}</h3>
                        {!editingData ? (
                            <button type="button" className="btn-outline" style={{ minHeight: 44, fontSize: 12, padding: '6px 12px' }} onClick={() => setEditingData(true)}>
                                Editar
                            </button>
                        ) : null}
                    </div>
                    {editingData ? studentDataFields.map(renderStudentDataEditRow) : studentDataFields.map(renderStudentDataViewRow)}
                </div>

                {controlIdCfg.enabled && (
                    <StudentControlIdPhoto
                        academyId={academyId}
                        leadId={id}
                        photoUrl={student.photo_url}
                        controlidSynced={student.controlid_synced}
                        onPhotoSaved={(url) => {
                            void updateStudent(id, { photo_url: url });
                        }}
                    />
                )}

                <div style={{ marginBottom: 22 }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Contato de emergência</h3>
                    {editingData ? (
                        <>
                            <label
                                style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: 10,
                                    marginBottom: 12,
                                    fontSize: 13,
                                    cursor: savingData ? 'not-allowed' : 'pointer',
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={emergencySameAsRegistered}
                                    disabled={savingData}
                                    onChange={(e) => {
                                        const checked = e.target.checked;
                                        setEmergencySameAsRegistered(checked);
                                        if (checked) {
                                            setDataForm((p) => {
                                                const next = applyRegisteredEmergencyToForm(p);
                                                return {
                                                    ...next,
                                                    emergencyPhone: maskPhone(next.emergencyPhone || ''),
                                                };
                                            });
                                        }
                                    }}
                                    style={{ marginTop: 2 }}
                                />
                                <span>Mesmo contato do cadastro (nome e telefone do {terms.student.toLowerCase()})</span>
                            </label>
                            {EMERGENCY_FIELDS.map((field) =>
                                renderStudentDataEditRow({
                                    ...field,
                                    disabled: emergencySameAsRegistered,
                                })
                            )}
                        </>
                    ) : (
                        EMERGENCY_FIELDS.map(renderStudentDataViewRow)
                    )}
                </div>

                <div style={{ marginBottom: 22 }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Pagamento habitual</h3>
                    {editingData ? (
                        <>
                            {PAYMENT_HABIT_FIELDS.map(renderStudentDataEditRow)}
                            <BankAccountSelect
                                id="student-preferred-account"
                                academyId={academyId}
                                financeConfig={financeConfig}
                                value={dataForm.preferredPaymentAccount}
                                onChange={(v) => setDataForm((p) => ({ ...p, preferredPaymentAccount: v }))}
                                label="Conta habitual"
                                allowEmpty
                                emptyLabel="Nenhuma (opcional)"
                                disabled={savingData}
                                className="student-profile-data-input"
                                style={dataFormInputStyle}
                            />
                        </>
                    ) : (
                        <>
                            {PAYMENT_HABIT_FIELDS.map(renderStudentDataViewRow)}
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: 12,
                                    padding: '10px 0',
                                    borderBottom: '0.5px solid var(--border-light)',
                                }}
                            >
                                <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>Conta habitual</span>
                                <span style={{ fontSize: 13, color: 'var(--text)', textAlign: 'right' }}>
                                    {student.preferredPaymentAccount || '—'}
                                </span>
                            </div>
                        </>
                    )}
                </div>

                {editingData ? (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
                        <button
                            type="button"
                            className="btn-outline"
                            disabled={savingData}
                            onClick={() => cancelDataEdit()}
                            style={{ minHeight: 44, fontSize: 13 }}
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            className="btn-primary"
                            disabled={savingData}
                            onClick={() => void handleSaveData()}
                            style={{ minHeight: 44, fontSize: 13 }}
                        >
                            {savingData ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                ) : null}

                {renderDangerZoneSection()}
            </div>

            <div
                style={{
                    padding: '12px 14px',
                    borderTop: '1px solid var(--border-light)',
                    flexShrink: 0,
                    display: 'flex',
                    justifyContent: timelineOpen ? 'stretch' : 'flex-end',
                }}
            >
                <button
                    type="button"
                    onClick={() => setTimelineOpen((o) => !o)}
                    style={{
                        width: timelineOpen ? '100%' : 'auto',
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: 'none',
                        background: 'var(--accent-light)',
                        color: 'var(--cosmos)',
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                    }}
                >
                    {timelineOpen ? <>← Voltar ao perfil</> : <>Abrir detalhes →</>}
                </button>
            </div>
        </div>
    );

    const tabBtn = (id, label) => (
        <button
            key={id}
            type="button"
            onClick={() => setProfileTab(id)}
            style={{
                flex: 1,
                padding: '10px 8px',
                borderRadius: 8,
                border: 'none',
                background: activeTab === id ? 'var(--surface)' : 'transparent',
                color: activeTab === id ? 'var(--text)' : 'var(--text-secondary)',
                fontWeight: activeTab === id ? 800 : 600,
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
                boxShadow: activeTab === id ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
            }}
        >
            {label}
        </button>
    );

    const rightColumn = (
        <div
            className="student-panel-right-col"
            style={{
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                minWidth: 0,
                flex: timelineOpen ? 1 : 0,
                flexBasis: timelineOpen ? undefined : 0,
                maxWidth: timelineOpen ? (stackedLayout ? '100%' : 560) : 0,
                opacity: timelineOpen ? 1 : 0,
                pointerEvents: timelineOpen ? 'auto' : 'none',
                width: stackedLayout && timelineOpen ? '100%' : undefined,
                transition: 'max-width 0.25s ease, flex 0.25s ease, opacity 0.25s ease',
                background: BG_SECONDARY,
            }}
        >
            {stackedLayout && timelineOpen ? (
                <div
                    className="student-panel-mobile-chrome"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 14px',
                        paddingTop: 'calc(10px + env(safe-area-inset-top, 0px))',
                        flexShrink: 0,
                        background: 'var(--surface)',
                        borderBottom: '1px solid var(--border-light)',
                    }}
                >
                    <button
                        type="button"
                        onClick={() => setTimelineOpen(false)}
                        aria-label="Voltar ao perfil do aluno"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            fontSize: 14,
                            fontWeight: 700,
                            color: 'var(--accent)',
                            fontFamily: 'inherit',
                            padding: '4px 0',
                            flexShrink: 0,
                        }}
                    >
                        <ArrowLeft size={18} aria-hidden />
                        Perfil
                    </button>
                    <span
                        style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 15,
                            fontWeight: 800,
                            color: 'var(--text)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            textAlign: 'center',
                        }}
                    >
                        {studentDisplayName}
                    </span>
                    <span style={{ width: 52, flexShrink: 0 }} aria-hidden />
                </div>
            ) : null}
            <div
                style={{
                    padding: '12px 14px',
                    flexShrink: 0,
                    display: 'flex',
                    gap: 6,
                    background: 'var(--surface)',
                    borderBottom: '1px solid var(--border-light)',
                    overflowX: 'auto',
                    WebkitOverflowScrolling: 'touch',
                }}
            >
                {tabBtn('frequency', 'Frequência')}
                {canViewFinance ? tabBtn('payments', 'Pagamentos') : null}
                {modules?.finance === true ? tabBtn('contracts', 'Contratos') : null}
                {tabBtn('timeline', 'Linha do tempo')}
                {showConversationTab ? tabBtn('conversation', 'Conversa') : null}
            </div>

            <div
                className={`student-profile-panel-body${activeTab === 'conversation' ? '' : ' student-profile-panel-body--scroll'}`}
            >
                {activeTab === 'frequency' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 120 }}>
                        {loadingFreq ? (
                            <div
                                style={{
                                    textAlign: 'center',
                                    color: 'var(--text-secondary)',
                                    padding: 32,
                                    fontSize: 14,
                                }}
                            >
                                Carregando...
                            </div>
                        ) : freqError ? (
                            <div
                                style={{
                                    textAlign: 'center',
                                    color: 'var(--text-secondary)',
                                    padding: 24,
                                    fontSize: 14,
                                    lineHeight: 1.5,
                                }}
                            >
                                {Number(freqErrorCode) === 401 ? (
                                    <>
                                        Sem permissão para ler a coleção de {terms.attendance.toLowerCase()} no Appwrite (401). Abra a coleção
                                        configurada em <code style={{ fontSize: 12 }}>VITE_APPWRITE_ATTENDANCE_COL_ID</code> e
                                        conceda <strong>Read</strong> ao papel adequado (usuários autenticados ou equipe da
                                        academia), como na coleção de leads.
                                    </>
                                ) : (
                                    <>Erro ao carregar {terms.attendance.toLowerCase()}.</>
                                )}{' '}
                                <button
                                    type="button"
                                    onClick={() => void loadFrequency()}
                                    style={{
                                        border: 'none',
                                        background: 'none',
                                        color: 'var(--accent)',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        textDecoration: 'underline',
                                        fontFamily: 'inherit',
                                        fontSize: 14,
                                        padding: 0,
                                    }}
                                >
                                    Tentar novamente
                                </button>
                            </div>
                        ) : (
                            <>
                                <div
                                    className="student-freq-stats-grid"
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                                        gap: 8,
                                    }}
                                >
                                    {[
                                        { label: 'Este mês', value: freqStats?.thisMonth ?? 0 },
                                        { label: 'Mês anterior', value: freqStats?.lastMonth ?? 0 },
                                        { label: 'Total', value: freqStats?.total ?? 0 },
                                        { label: 'Taxa', value: freqStats?.monthlyRate ?? '0%' },
                                    ].map((cell) => (
                                        <div
                                            key={cell.label}
                                            style={{
                                                background: 'var(--surface)',
                                                border: '0.5px solid var(--border-light)',
                                                borderRadius: 'var(--radius-sm)',
                                                padding: 8,
                                                textAlign: 'center',
                                            }}
                                        >
                                            <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--petroleo)' }}>{cell.value}</div>
                                            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>{cell.label}</div>
                                        </div>
                                    ))}
                                </div>
                                {checkins.length === 0 ? (
                                    <EmptyState
                                        variant="compact"
                                        tone="dashed"
                                        title={`Nenhuma ${terms.attendance.toLowerCase()} registrada ainda`}
                                        role="status"
                                    />
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {checkins.map((c) => (
                                            <div
                                                key={c.$id}
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    gap: 10,
                                                    padding: '7px 10px',
                                                    background: 'var(--surface)',
                                                    border: '0.5px solid var(--border-light)',
                                                    borderRadius: 'var(--radius-sm)',
                                                }}
                                            >
                                                <div style={{ minWidth: 0, textAlign: 'left' }}>
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                                                        {formatCheckinAt(c.checked_in_at)}
                                                    </div>
                                                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                                                        Registrado por {c.checked_in_by_name || '—'}
                                                    </div>
                                                </div>
                                                <span
                                                    className="badge-success"
                                                    style={{ fontSize: 10, flexShrink: 0, borderRadius: 6, padding: '2px 8px' }}
                                                >
                                                    Manual
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                ) : null}

                {activeTab === 'payments' && canViewFinance && student ? (
                    <StudentFinancialTimeline
                        student={student}
                        financeConfig={financeConfig}
                        payments={payments}
                        sales={sales}
                        paymentStatus={paymentStatus}
                        loading={loadingPayments}
                        error={paymentsError}
                        onRetry={() => void loadPayments()}
                        onRegisterPayment={(presetType) => openPaymentModal(presetType)}
                        onGoMensalidades={() => {
                            const search = String(student.name || '').trim() || undefined;
                            navigate(buildReceivablesPath({ section: 'mensalidades', search }));
                        }}
                        onGoSales={() => navigate('/loja?tab=vendas&subtab=history')}
                        onCancelCoverage={handleCancelCoverage}
                        cancellingCoverage={cancellingCoverage}
                        hasSales={sales.length > 0}
                        planFreezes={planFreezes}
                        onOpenFreeze={() => setFreezeModalOpen(true)}
                        freezeBusy={freezeBusy}
                        onEndFreeze={() => void handleEndFreezeEarly()}
                        endFreezeBusy={endFreezeBusy}
                        canManagePayments={canManagePayments}
                        onEditPayment={openEditPaymentModal}
                        onDeletePayment={setDeletePaymentTarget}
                        extratoUnificado={extratoUnificado}
                    />
                ) : null}

                {activeTab === 'contracts' && modules?.finance === true && student ? (
                    <StudentContractsSection leadId={student.id} />
                ) : null}

                {activeTab === 'conversation' && showConversationTab && student ? (
                    <div className="student-profile-conversation-panel">
                        <NaviChatWidgetPanel
                            academyId={academyId}
                            activePhone={student.phone}
                            leadId={student.id}
                            leadName={student.name}
                            embedded
                            hideProfileLink
                            isMobile={stackedLayout}
                            onClose={handleConversationClose}
                            onMinimize={handleConversationClose}
                            onRequestEditPhone={handleRequestEditPhone}
                        />
                    </div>
                ) : null}

                {activeTab === 'timeline' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 280 }}>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={() => setEventTypeFilter('all')}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: 999,
                                    border: eventTypeFilter === 'all' ? '1px solid var(--accent)' : '1px solid var(--border)',
                                    background: eventTypeFilter === 'all' ? 'var(--accent-light)' : 'var(--surface)',
                                    color: 'var(--text-secondary)',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                }}
                            >
                                Todos
                            </button>
                            <button
                                type="button"
                                onClick={() => setEventTypeFilter('note')}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: 999,
                                    border: eventTypeFilter === 'note' ? '1px solid var(--accent)' : '1px solid var(--border)',
                                    background: eventTypeFilter === 'note' ? 'var(--accent-light)' : 'var(--surface)',
                                    color: 'var(--text-secondary)',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                }}
                            >
                                Notas
                            </button>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                            <textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder={`Adicione uma observação sobre este ${terms.student.toLowerCase()}...`}
                                rows={3}
                                style={{
                                    ...inputStyle,
                                    resize: 'vertical',
                                    minHeight: 72,
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => void addNote()}
                                disabled={!note.trim() || addingNote}
                                style={{
                                    width: 48,
                                    flexShrink: 0,
                                    borderRadius: 10,
                                    border: 'none',
                                    background: 'var(--petroleo)',
                                    color: '#fff',
                                    cursor: !note.trim() || addingNote ? 'not-allowed' : 'pointer',
                                    opacity: !note.trim() || addingNote ? 0.5 : 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                                aria-label="Salvar nota"
                            >
                                <Send size={16} />
                            </button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {timelineError ? (
                                <div
                                    style={{
                                        padding: 12,
                                        borderRadius: 8,
                                        background: 'var(--danger-light)',
                                        color: 'var(--danger)',
                                        fontSize: 13,
                                        marginBottom: 8,
                                    }}
                                >
                                    Não foi possível carregar o histórico.{' '}
                                    <button type="button" onClick={() => void refreshTimeline()} style={{ fontWeight: 700, cursor: 'pointer' }}>
                                        Tentar novamente
                                    </button>
                                </div>
                            ) : null}
                            {!timelineError && filteredTimelineEvents.length === 0 ? (
                                <EmptyState variant="compact" tone="dashed" title="Nenhum evento registrado." role="status" />
                            ) : null}
                            {!timelineError && filteredTimelineEvents.length > 0 ? (
                                <div style={{ position: 'relative', paddingLeft: 18 }}>
                                    <div
                                        style={{
                                            position: 'absolute',
                                            left: 5,
                                            top: 8,
                                            bottom: 8,
                                            width: 2,
                                            background: 'var(--border)',
                                            borderRadius: 1,
                                        }}
                                    />
                                    {filteredTimelineEvents.map((n, i) => {
                                        const when = new Date(n.at || n.date).toLocaleString('pt-BR', {
                                            day: '2-digit',
                                            month: 'short',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        });
                                        const type = n.type || 'note';
                                        const tag =
                                            type === 'converted' ? terms.convertedStatusUi : TIMELINE_EVENT_LABELS[type] ?? type;
                                        let dotColor = '#8E8E8E';
                                        if (type === 'note' || type === 'inbox_note') dotColor = 'var(--petroleo)';
                                        else if (type === 'message') dotColor = '#25D366';
                                        else if (type === 'schedule') dotColor = '#0088CC';
                                        else if (['stage_change', 'attended', 'missed', 'converted', 'lost'].includes(type)) dotColor = '#888780';
                                        else if (type === 'pipeline_change') dotColor = '#F5A623';

                                        let label = n.text || '';
                                        if (type === 'schedule') {
                                            label = `Agendado para ${n.date} ${n.time || ''}`.trim();
                                        } else if (type === 'stage_change' || type === 'pipeline_change') {
                                            label = `De ${humanizeTimelineStage(n.from, pipelineStagesNl, terms)} para ${humanizeTimelineStage(n.to, pipelineStagesNl, terms)}`;
                                        } else if (type === 'inbox_note') {
                                            label = (
                                                <span>
                                                    {n.text}
                                                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> · Inbox</span>
                                                </span>
                                            );
                                        }

                                        return (
                                            <div key={n.$id || i} style={{ position: 'relative', marginBottom: 18, paddingLeft: 14 }}>
                                                <div
                                                    style={{
                                                        position: 'absolute',
                                                        left: -2,
                                                        top: 4,
                                                        width: 10,
                                                        height: 10,
                                                        borderRadius: '50%',
                                                        backgroundColor: dotColor,
                                                    }}
                                                />
                                                <div
                                                    style={{
                                                        borderRadius: 10,
                                                        padding: '10px 12px',
                                                        background: 'var(--surface)',
                                                        border: '1px solid var(--border)',
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                                                        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)' }}>{tag}</span>
                                                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{when}</span>
                                                    </div>
                                                    <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.45 }}>{label}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : null}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );

    return (
        <div
            className={`student-profile-page-root${timelineOpen ? ' student-profile--panel-open' : ''}`}
            style={{
                display: 'flex',
                flex: 1,
                minHeight: 0,
                overflow: timelineOpen ? 'hidden' : 'auto',
                width: '100%',
                background: 'var(--surface)',
            }}
        >
            {leftColumn}
            {rightColumn}

            {confirmDeleteOpen ? (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 80,
                        background: 'rgba(15, 23, 42, 0.45)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 20,
                        paddingTop: 'calc(20px + env(safe-area-inset-top, 0px))',
                    }}
                    onClick={() => (deleteBusy ? undefined : setConfirmDeleteOpen(false))}
                >
                    <div
                        style={{
                            maxWidth: 400,
                            width: '100%',
                            borderRadius: 14,
                            background: 'var(--surface)',
                            padding: 24,
                            boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                            <AlertTriangle size={28} color="var(--danger)" />
                        </div>
                        <h3 style={{ margin: 0, textAlign: 'center', fontSize: 18, fontWeight: 800 }}>Excluir {terms.student.toLowerCase()}?</h3>
                        <p style={{ margin: '12px 0 0', textAlign: 'center', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            Esta ação não pode ser desfeita. Todos os dados do {terms.student.toLowerCase()} serão removidos.
                        </p>
                        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                            <button
                                type="button"
                                disabled={deleteBusy}
                                onClick={() => setConfirmDeleteOpen(false)}
                                style={{
                                    flex: 1,
                                    padding: '10px 12px',
                                    borderRadius: 10,
                                    border: '1px solid var(--border)',
                                    background: 'var(--surface)',
                                    fontWeight: 700,
                                    cursor: deleteBusy ? 'not-allowed' : 'pointer',
                                    fontFamily: 'inherit',
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={deleteBusy}
                                onClick={() => void runDeleteStudent()}
                                style={{
                                    flex: 1,
                                    padding: '10px 12px',
                                    borderRadius: 10,
                                    border: 'none',
                                    background: 'var(--danger)',
                                    color: '#fff',
                                    fontWeight: 700,
                                    cursor: deleteBusy ? 'not-allowed' : 'pointer',
                                    fontFamily: 'inherit',
                                }}
                            >
                                {deleteBusy ? '…' : 'Excluir'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {deactivateOpen && student ? (
                <DeactivateStudentModal
                    studentName={student.name || terms.student}
                    exitReasons={exitReasons}
                    busy={deactivateBusy}
                    onCancel={() => !deactivateBusy && setDeactivateOpen(false)}
                    onConfirm={handleConfirmDeactivate}
                />
            ) : null}

            {student ? (
                <CreateContractModal
                    open={rescissionContractOpen}
                    leadId={leadId}
                    purpose="rescission"
                    allowInactiveStudent
                    leadOverrides={rescissionLeadOverrides || undefined}
                    onClose={() => {
                        setRescissionContractOpen(false);
                        setRescissionLeadOverrides(null);
                    }}
                    onSuccess={() => {
                        setRescissionContractOpen(false);
                        setRescissionLeadOverrides(null);
                    }}
                />
            ) : null}

            <PlanFreezeModal
                open={freezeModalOpen}
                student={student}
                freezeReasons={freezeReasons}
                busy={freezeBusy}
                onClose={() => !freezeBusy && setFreezeModalOpen(false)}
                onConfirm={handleConfirmFreeze}
            />

            <StudentPaymentModal
                open={showPaymentModal}
                student={student}
                academyId={academyId}
                financeConfig={financeConfig}
                payForm={payForm}
                setPayForm={setPayForm}
                saving={savingPayment}
                inputStyle={inputStyle}
                onClose={closePaymentModal}
                onSave={saveStudentPayment}
                salesEnabled={modules?.sales === true}
                onSaleComplete={() => void loadPayments()}
                editingPaymentId={editingPaymentId}
                formError={payFormError}
            />

            <ConfirmDialog
                open={Boolean(deletePaymentTarget)}
                title="Excluir lançamento"
                description="Tem certeza que deseja excluir este lançamento? Esta ação não pode ser desfeita."
                confirmLabel="Excluir"
                confirmVariant="danger"
                loading={deletePaymentBusy}
                onConfirm={() => void handleConfirmDeletePayment()}
                onClose={() => !deletePaymentBusy && setDeletePaymentTarget(null)}
            />

            <ConfirmDialog
                open={Boolean(futurePaidDateLabel)}
                title="Data de pagamento futura"
                description={`A data de pagamento (${futurePaidDateLabel}) é futura. Confirma o registro mesmo assim?`}
                confirmLabel="Confirmar registro"
                confirmVariant="primary"
                loading={savingPayment}
                onConfirm={() => {
                    setFuturePaidDateLabel(null);
                    skipFuturePaidDateRef.current = true;
                    void saveStudentPayment();
                }}
                onClose={() => !savingPayment && setFuturePaidDateLabel(null)}
            />
        </div>
    );
}
