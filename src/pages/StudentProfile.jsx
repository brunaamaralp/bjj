import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { User, ChevronDown, MessageCircle, Send, Trash2, AlertTriangle, PauseCircle } from 'lucide-react';
import { databases, DB_ID, ACADEMIES_COL, account } from '../lib/appwrite';
import {
    getStudentPayments,
    createPayment,
    getPaymentStatus,
    updatePayment as _updatePayment,
    cancelBundleCoverageFromMonth,
    PAYMENT_CATEGORY,
} from '../lib/studentPayments.js';
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
import StudentPaymentModal, { buildDefaultPayForm } from '../components/student/StudentPaymentModal.jsx';
import { getSalesByStudent } from '../lib/salesByStudent.js';
import { getAttendance, getAttendanceStats, createCheckin, isAttendanceConfigured } from '../lib/attendance.js';
import { addLeadEvent, getLeadEvents } from '../lib/leadEvents.js';
import { DEFAULT_WHATSAPP_TEMPLATES, WHATSAPP_TEMPLATE_LABELS } from '../../lib/whatsappTemplateDefaults.js';
import { useWhatsappTemplates } from '../lib/useWhatsappTemplates.js';
import { sendWhatsappTemplateOutbound } from '../lib/outboundWhatsappTemplate.js';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import { useStudentStore } from '../store/useStudentStore';
import { useUiStore } from '../store/useUiStore';
import { friendlyError } from '../lib/errorMessages.js';
import { maskCPF, maskPhone } from '../lib/masks.js';
import { centsToNumber, parseMaskToCents } from '../lib/moneyBr';
import { PIPELINE_STAGES } from '../constants/pipeline.js';
import { useTerms, contactLabelSingular, operationalStatusDisplayLabel, pipelineStageDisplayLabel } from '../lib/terminology.js';
import NlCommandBar, { NlCommandBarTrigger } from '../components/NlCommandBar';
import { NL_PAYMENT_PREFILL_EVENT } from '../lib/nlCorrect.js';
import { formatBRLFromCents } from '../lib/moneyBr';
import { DateInput } from '../components/DateInput';
import PlanSelect from '../components/shared/PlanSelect.jsx';
import { LEAD_TIMELINE_CHANGED, LEAD_ATTENDANCE_CHANGED, emitLeadAttendanceChanged } from '../lib/leadTimelineEvents.js';
import { formatCollectionResultLabel } from '../lib/collectionRules.js';
import EmptyState from '../components/shared/EmptyState.jsx';
import LabelPill from '../components/shared/LabelPill';
import LabelSelector from '../components/shared/LabelSelector';
import { useAcademyLabels } from '../hooks/useAcademyLabels.js';
import DeactivateStudentModal from '../components/DeactivateStudentModal.jsx';
import { isActiveStudent, isInactiveStudent } from '../lib/studentStatus.js';
import { deactivateStudent, reactivateStudent } from '../lib/deactivateStudent.js';
import { fetchStudentProfileBundle } from '../lib/studentsApi.js';
import { useCanViewStudentFinance } from '../lib/canViewStudentFinance.js';
import StudentStatusBadge from '../components/student/StudentStatusBadge.jsx';
import { resolveStudentListStatus } from '../lib/studentDisplayStatus.js';
import { readStudentExitReasonsFromAcademyDoc } from '../lib/studentExitConfig.js';
import { readStudentFreezeReasonsFromAcademyDoc } from '../lib/studentFreezeConfig.js';
import { prefetchFinanceConfig } from '../lib/prefetchFinanceConfig.js';
import { defaultEnrollmentDateIso } from '../lib/studentEnrollmentDate.js';
import {
    applyRegisteredEmergencyToForm,
    emergencyMatchesRegistered,
} from '../lib/studentEmergencyContact.js';
import { validateBankAccountForPayment, validatePreferredPaymentAccount } from '../lib/bankAccounts.js';
import BankAccountSelect from '../components/finance/BankAccountSelect.jsx';
import SexoSelect from '../components/shared/SexoSelect.jsx';
import TurmaSelect from '../components/shared/TurmaSelect.jsx';
import { useAcademyTurmas } from '../hooks/useAcademyTurmas.js';
import { useAcademyControlId } from '../hooks/useAcademyControlId.js';
import StudentControlIdPhoto from '../components/student/StudentControlIdPhoto.jsx';
import { resolveTurmaFormState, turmaValueFromForm } from '../lib/academyTurmas.js';
import { sexoDisplayLabel } from '../lib/leadSexo.js';

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
    [LEAD_STATUS.CONVERTED]: { bg: 'var(--purple-light)', color: 'var(--purple)' },
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

const PROFILE_TYPE_OPTIONS = [
    { value: 'Adulto', label: 'Adulto' },
    { value: 'Criança', label: 'Criança' },
    { value: 'Juniores', label: 'Juniores' },
];

const STUDENT_DATA_FIELDS = [
    { key: 'name', label: 'Nome', type: 'text', placeholder: 'Nome completo' },
    {
        key: 'type',
        label: 'Perfil',
        type: 'select',
        options: PROFILE_TYPE_OPTIONS,
    },
    { key: 'plan', label: 'Plano', type: 'plan' },
    { key: 'enrollmentDate', label: 'Ingresso', type: 'date', placeholder: '' },
    { key: 'birthDate', label: 'Nascimento', type: 'date', placeholder: '' },
    { key: 'sexo', label: 'Sexo', type: 'sexo' },
    { key: 'turma', label: 'Turma', type: 'turma' },
    { key: 'phone', label: 'Telefone (WhatsApp)', type: 'tel', placeholder: '(00) 00000-0000' },
    { key: 'cpf', label: 'CPF', type: 'text', placeholder: '000.000.000-00' },
    { key: 'responsavel', label: 'Responsável', type: 'text', placeholder: 'Nome do responsável' },
    { key: 'cpfResponsavel', label: 'CPF do responsável', type: 'text', placeholder: '000.000.000-00' },
];

const EMERGENCY_FIELDS = [
    { key: 'emergencyContact', label: 'Contato de emergência', type: 'text', placeholder: 'Nome do contato' },
    { key: 'emergencyPhone', label: 'Telefone de emergência', type: 'tel', placeholder: 'Celular' },
];

const PREFERRED_PAYMENT_SELECT_OPTIONS = [
    { value: 'pix', label: 'PIX' },
    { value: 'dinheiro', label: 'Dinheiro' },
    { value: 'cartão_débito', label: 'Cartão débito' },
    { value: 'cartão_crédito', label: 'Cartão crédito' },
    { value: 'transferência', label: 'Transferência' },
];

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

function formatDdMmYyyyFromIso(iso) {
    if (!iso) return '';
    try {
        return new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
    } catch {
        return '';
    }
}

const METHOD_PAYMENT_LABELS = {
    pix: 'PIX',
    dinheiro: 'Dinheiro',
    cartão_débito: 'Cartão débito',
    cartão_crédito: 'Cartão crédito',
    transferência: 'Transferência',
};

export default function StudentProfile() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const student = useStudentStore((s) => s.students.find((l) => l.id === id));
    const loading = useStudentStore((s) => s.loading);
    const fetchStudentById = useStudentStore((s) => s.fetchStudentById);
    const mergeStudent = useStudentStore((s) => s.mergeStudent);
    const refreshStudentPaymentStatus = useStudentStore((s) => s.refreshStudentPaymentStatus);
    const canViewFinance = useCanViewStudentFinance();
    const [profileResolving, setProfileResolving] = useState(() => !useStudentStore.getState().students.some((l) => l.id === id));
    const academyId = useLeadStore((s) => s.academyId);
    const modules = useLeadStore((s) => s.modules);
    const financeConfig = useLeadStore((s) => s.financeConfig);
    const { turmas: academyTurmas } = useAcademyTurmas(academyId);
    const userId = useLeadStore((s) => s.userId);
    const academyList = useLeadStore((s) => s.academyList);
    const deleteStudent = useStudentStore((s) => s.deleteStudent);
    const updateStudent = useStudentStore((s) => s.updateStudent);
    const controlIdCfg = useAcademyControlId(academyId);
    const uiLabels = useLeadStore((s) => s.labels);
    const addToast = useUiStore((s) => s.addToast);
    const terms = useTerms();
    const contactLabel = useMemo(() => contactLabelSingular(uiLabels), [uiLabels]);

    const { allLabels } = useAcademyLabels(academyId, {
        onLoadError: () => addToast({ type: 'error', message: 'Não foi possível carregar etiquetas.' }),
    });

    const handleLabelsChange = async (newIds) => {
        if (!id) return;
        try {
            await updateStudent(id, { label_ids: newIds });
            addToast({ type: 'success', message: 'Etiquetas atualizadas.' });
        } catch (e) {
            addToast({ type: 'error', message: friendlyError(e, 'save') });
        }
    };

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
    const [timelineOpen, setTimelineOpen] = useState(true);
    const [activeTab, setActiveTab] = useState('frequency');
    const [waCtx, setWaCtx] = useState({
        name: '',
        zapster: '',
        templates: DEFAULT_WHATSAPP_TEMPLATES,
    });
    const { templates: waTemplatesHook, academyName: waNameHook, zapsterInstanceId: waZapHook } =
        useWhatsappTemplates(academyId);
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
    const [loadingPayments, setLoadingPayments] = useState(true);
    const [paymentsError, setPaymentsError] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentStatus, setPaymentStatus] = useState(null);
    const [payForm, setPayForm] = useState(() => buildDefaultPayForm(null));
    const [savingPayment, setSavingPayment] = useState(false);
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

    useEffect(() => {
        if (academyId) void prefetchFinanceConfig(academyId);
    }, [academyId]);

    useEffect(() => {
        if (!id) return undefined;
        let cancelled = false;
        if (useStudentStore.getState().students.some((l) => l.id === id)) {
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
        void fetchStudentProfileBundle(id)
            .then((bundle) => {
                if (bundle?.student) mergeStudent(id, bundle.student);
                if (bundle?.paymentStatus && bundle.paymentStatus.key) {
                    setPaymentStatus({
                        status: bundle.paymentStatus.key === 'none' ? 'none' : bundle.paymentStatus.key,
                        payment: null,
                    });
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
            const base = buildDefaultPayForm(student);
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
            setNlOpen(false);
        };
        window.addEventListener(NL_PAYMENT_PREFILL_EVENT, onNlPaymentPrefill);
        return () => window.removeEventListener(NL_PAYMENT_PREFILL_EVENT, onNlPaymentPrefill);
    }, [student]);

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
        setTemplateMenuOpen(false);
    }, [leadId]);

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
        void loadFrequency();
    }, [loadFrequency]);

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
            const [docs, status, salesList, freezes] = await Promise.all([
                canViewFinance ? getStudentPayments(leadId, academyId) : Promise.resolve([]),
                canViewFinance ? getPaymentStatus(leadId, academyId) : Promise.resolve({ status: 'none', payment: null }),
                salesPromise,
                listPlanFreezes(leadId, academyId).catch(() => []),
            ]);
            setPayments(docs);
            setPaymentStatus(status);
            setSales(salesList);
            setPlanFreezes(freezes);
        } catch (e) {
            console.error(e);
            setPaymentsError(true);
            setPayments([]);
            setSales([]);
            setPaymentStatus({ status: 'none', payment: null });
        } finally {
            setLoadingPayments(false);
        }
    }, [leadId, academyId, canViewFinance]);

    useEffect(() => {
        void loadPayments();
    }, [loadPayments]);

    const handleConfirmFreeze = useCallback(
        async ({ startYmd, endYmd, durationDays, reason }) => {
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
                    userId,
                    teamId: acad.teamId,
                    mergeStudent,
                    onAfterFreeze: () => refreshStudentPaymentStatus(leadId, academyId),
                    academySettingsRaw: academySettingsDoc,
                    financeConfig,
                });
                setFreezeModalOpen(false);
                addToast({
                    type: 'success',
                    message: `Matrícula trancada até ${formatFreezeDateBr(endYmd)}. Acesso bloqueado quando possível.`,
                });
                void loadPayments();
                void refreshStudentPaymentStatus(leadId, academyId);
            } catch (e) {
                addToast({ type: 'error', message: friendlyError(e, 'save') });
                throw e;
            } finally {
                setFreezeBusy(false);
            }
        },
        [student, leadId, academyId, academyList, userId, mergeStudent, academySettingsDoc, financeConfig, addToast, loadPayments, refreshStudentPaymentStatus]
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
            addToast({ type: 'success', message: 'Trancamento encerrado. Acesso reativado na catraca quando possível.' });
            void loadPayments();
            void refreshStudentPaymentStatus(leadId, academyId);
        } catch (e) {
            addToast({ type: 'error', message: friendlyError(e, 'save') });
        } finally {
            setEndFreezeBusy(false);
        }
    }, [student, leadId, academyId, academyList, userId, mergeStudent, academySettingsDoc, payments, addToast, loadPayments, refreshStudentPaymentStatus]);

    const academyNameDisplay = useMemo(() => {
        const cur = (academyList || []).find((a) => a.id === academyId);
        return String(cur?.name || '').trim();
    }, [academyList, academyId]);

    const [nlOpen, setNlOpen] = useState(false);

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
        databases
            .getDocument(DB_ID, ACADEMIES_COL, academyId)
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
    }, [student]);

    const handleSaveData = useCallback(async () => {
        if (!student || savingData) return;
        const name = String(dataForm.name || '').trim();
        if (!name) {
            addToast({ type: 'error', message: 'Informe o nome do aluno.' });
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
                addToast({ type: 'error', message: accountCheck.message });
                setSavingData(false);
                return;
            }

            await updateStudent(leadId, {
                name,
                type: dataForm.type || 'Adulto',
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
            });
            setEditingData(false);
            addToast({ type: 'success', message: 'Dados salvos com sucesso.' });
        } catch (e) {
            addToast({ type: 'error', message: friendlyError(e, 'save') });
        } finally {
            setSavingData(false);
        }
    }, [student, savingData, leadId, dataForm, updateStudent, addToast, financeConfig]);

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
                onToast: (t) => addToast(t),
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
            addToast({ type: 'success', message: 'Nota adicionada.' });
        } catch (e) {
            addToast({ type: 'error', message: friendlyError(e, 'save') });
        } finally {
            setAddingNote(false);
        }
    };

    const runDeleteStudent = async () => {
        if (deleteBusy) return;
        setDeleteBusy(true);
        try {
            await deleteStudent(leadId);
            addToast({ type: 'success', message: `${terms.student} excluído com sucesso.` });
            setConfirmDeleteOpen(false);
            navigate('/students');
        } catch (e) {
            addToast({ type: 'error', message: friendlyError(e, 'delete') });
        } finally {
            setDeleteBusy(false);
        }
    };

    const handleConfirmDeactivate = async ({ exitReason, exitDate, exitNotes, cancelFuturePayments }) => {
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
            let msg = `${terms.student} desligado com sucesso.`;
            if (paymentsCancelled > 0) {
                msg += ` ${paymentsCancelled} cobrança(s) futura(s) cancelada(s).`;
            }
            if (tasksCreated > 0) {
                msg += ` ${tasksCreated} tarefa${tasksCreated === 1 ? '' : 's'} de desligamento foram criadas.`;
            }
            addToast({ type: 'success', message: msg });
            void refreshTimeline();
            void loadPayments();
        } catch (e) {
            addToast({ type: 'error', message: friendlyError(e, 'save') });
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
                academyId,
                userId,
                permCtx,
                mergeStudent,
                refreshPaymentStatus: refreshStudentPaymentStatus,
            });
            addToast({ type: 'success', message: `${terms.student} reativado com sucesso.` });
            void refreshTimeline();
        } catch (e) {
            addToast({ type: 'error', message: friendlyError(e, 'save') });
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
            addToast({ type: 'success', message: `${terms.attendance} registrada!` });
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
            addToast({ type: 'error', message: friendlyError(e, 'save') || `Não foi possível registrar a ${terms.attendance.toLowerCase()}.` });
        } finally {
            setCheckingIn(false);
        }
    };

    const openPaymentModal = useCallback((presetType = PAYMENT_CATEGORY.PLAN) => {
        if (!student) return;
        setPayForm({ ...buildDefaultPayForm(student), payment_type: presetType });
        setShowPaymentModal(true);
    }, [student]);

    const saveStudentPayment = useCallback(async () => {
        if (!student || !academyId || savingPayment) return;
        const paymentType = payForm.payment_type || PAYMENT_CATEGORY.PLAN;
        const desc = String(payForm.note || '').trim();

        if (paymentType === PAYMENT_CATEGORY.FEE && !desc) {
            addToast({ type: 'error', message: 'Informe a descrição da taxa (ex.: taxa de competição).' });
            return;
        }

        const amountNum = centsToNumber(parseMaskToCents(payForm.amount));
        if (!Number.isFinite(amountNum) || amountNum <= 0) {
            addToast({ type: 'error', message: 'Informe um valor maior que zero.' });
            return;
        }

        const accountCheck = validateBankAccountForPayment(payForm.account, financeConfig);
        if (!accountCheck.ok) {
            addToast({ type: 'error', message: accountCheck.message });
            return;
        }

        const paidAtIso =
            payForm.status === 'paid' && payForm.paid_at
                ? new Date(payForm.paid_at).toISOString()
                : null;

        const data = {
            lead_id: student.id,
            academy_id: academyId,
            amount: amountNum,
            method: payForm.method,
            account: payForm.account || '',
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
            const doc = await createPayment(data);
            if (paymentType === PAYMENT_CATEGORY.BUNDLE) {
                await loadPayments();
            } else {
                setPayments((prev) => {
                    const ref = doc.reference_month;
                    const filtered = prev.filter((p) => {
                        if (p.$id === doc.$id) return false;
                        if (
                            ref &&
                            p.reference_month === ref &&
                            (p.payment_category === PAYMENT_CATEGORY.PLAN ||
                                p.payment_category === PAYMENT_CATEGORY.BUNDLE ||
                                !p.payment_category)
                        ) {
                            return false;
                        }
                        return true;
                    });
                    return [doc, ...filtered];
                });
            }
            const localYm = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
            if (
                doc.reference_month === localYm &&
                (paymentType === PAYMENT_CATEGORY.PLAN || paymentType === PAYMENT_CATEGORY.BUNDLE)
            ) {
                if (doc.status === 'paid') setPaymentStatus({ status: 'paid', payment: doc });
                else setPaymentStatus({ status: 'pending', payment: doc });
            }
            setShowPaymentModal(false);
            addToast({ type: 'success', message: 'Pagamento registrado.' });
        } catch (e) {
            addToast({ type: 'error', message: friendlyError(e, 'save') });
        } finally {
            setSavingPayment(false);
        }
    }, [
        student,
        academyId,
        savingPayment,
        payForm,
        userId,
        sessionUserName,
        addToast,
        financeConfig,
        loadPayments,
    ]);

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
                addToast({ type: 'success', message: 'Cobertura cancelada.' });
            } catch (e) {
                addToast({ type: 'error', message: friendlyError(e, 'save') });
            } finally {
                setCancellingCoverage(false);
            }
        },
        [student, academyId, cancellingCoverage, payments, userId, sessionUserName, loadPayments, addToast]
    );

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
        const isTurma = field.key === 'turma';
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
                        if (field.key === 'cpf' || field.key === 'cpfResponsavel') v = maskCPF(e.target.value);
                        else if (field.key === 'phone') v = maskPhone(e.target.value);
                        setDataForm((p) => ({ ...p, [field.key]: v }));
                    }}
                    style={dataFormInputStyle}
                />
            )}
            {field.key === 'enrollmentDate' ? (
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    Padrão: data do cadastro. Altere se a matrícula for retroativa.
                </p>
            ) : null}
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
                overflowY: 'auto',
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
                <NlCommandBarTrigger onClick={() => setNlOpen(true)} />
            </div>

            <div style={{ padding: '16px 14px', flex: 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 20 }}>
                    <div
                        style={{
                            width: 44,
                            height: 44,
                            borderRadius: '50%',
                            background: BG_SECONDARY,
                            border: '0.5px solid var(--border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: 10,
                        }}
                    >
                        <User size={22} style={{ opacity: 0.4, color: 'var(--text-muted)' }} strokeWidth={1.75} />
                    </div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>
                        {editingData ? (String(dataForm.name || '').trim() || 'Sem nome') : student.name || 'Sem nome'}
                    </h2>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 8 }}>
                        <StudentStatusBadge
                            status={resolveStudentListStatus(student, paymentStatus)}
                        />
                        {modules?.finance === true && student?.id ? (
                            <StudentContractHeaderChip
                                leadId={student.id}
                                onOpenContractsTab={() => setActiveTab('contracts')}
                            />
                        ) : null}
                    </div>
                    {String(student.plan || '').trim() ? (
                        <p style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                            {terms.plan}: {student.plan}
                        </p>
                    ) : null}
                    {student.dueDay ? (
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                            Próximo vencimento: dia {student.dueDay}
                        </p>
                    ) : null}

                    <div style={{ marginTop: 14, marginBottom: 14, width: '100%', textAlign: 'left' }}>
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
                            Mais ações
                        </p>
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
                                    <p
                                        style={{
                                            margin: '0 0 8px',
                                            fontSize: 11,
                                            color: 'var(--text-muted)',
                                            lineHeight: 1.4,
                                        }}
                                    >
                                        Trancamento disponível para planos anuais (até 90 dias por ano do plano).
                                    </p>
                                ) : null}
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
                                        color: 'var(--text)',
                                        fontWeight: 700,
                                        fontSize: 13,
                                        cursor: 'pointer',
                                        fontFamily: 'inherit',
                                    }}
                                >
                                    <AlertTriangle size={16} /> Desligar {terms.student.toLowerCase()}
                                </button>
                            </>
                        ) : isInactiveStudent(student) ? (
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
                                border: '1px solid var(--border)',
                                background: 'var(--surface)',
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

                    <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>{formatPhone(student.phone) || '—'}</p>
                    {String(student.turma || student.className || '').trim() ? (
                        <span
                            style={{
                                display: 'inline-block',
                                marginTop: 8,
                                fontSize: 12,
                                fontWeight: 700,
                                padding: '4px 10px',
                                borderRadius: 8,
                                background: 'var(--v50, #f3f0ff)',
                                color: 'var(--v700, #5B3FBF)',
                                border: '1px solid var(--v200, #ddd6fe)',
                            }}
                        >
                            Turma: {String(student.turma || student.className).trim()}
                        </span>
                    ) : null}
                    {isInactiveStudent(student) && (student.exitReason || student.exitDate) ? (
                        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                            {student.exitReason ? <>Motivo: {student.exitReason}</> : null}
                            {student.exitReason && student.exitDate ? ' · ' : null}
                            {student.exitDate ? <>Saída: {formatDateBR(student.exitDate)}</> : null}
                        </p>
                    ) : null}
                    {isActiveStudent(student) && isFreezeActive(student) ? (
                        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#b45309', lineHeight: 1.45 }}>
                            Matrícula trancada
                            {String(student.freeze_end || '').slice(0, 10)
                                ? ` até ${formatFreezeDateBr(String(student.freeze_end).slice(0, 10))}`
                                : ''}
                            {activeFreezeReasonFromHistory(planFreezes, student)
                                ? ` · ${activeFreezeReasonFromHistory(planFreezes, student)}`
                                : ''}
                        </p>
                    ) : null}
                    {student.type && String(student.type).trim() ? (
                        <span className="badge-purple" style={{ fontSize: 11, borderRadius: 6, padding: '2px 8px', marginTop: 8 }}>
                            {student.type}
                        </span>
                    ) : null}
                    <div
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 6,
                            justifyContent: 'center',
                            marginTop: 12,
                            width: '100%',
                        }}
                    >
                        {(student.labelIds || []).map((labelId) => {
                            const label = allLabels.find((l) => l.$id === labelId);
                            if (!label) return null;
                            return (
                                <LabelPill
                                    key={labelId}
                                    label={label}
                                    onRemove={() =>
                                        handleLabelsChange((student.labelIds || []).filter((x) => x !== labelId))
                                    }
                                />
                            );
                        })}
                        <LabelSelector
                            allLabels={allLabels}
                            selectedIds={student.labelIds || []}
                            onChange={handleLabelsChange}
                        />
                    </div>
                </div>

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
                            Inadimplente
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
                        background: '#5B3FBF',
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
                    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', position: 'relative' }}>
                        <button
                            type="button"
                            disabled={!phoneHasDigits || sendingWhatsapp}
                            onClick={() => void handleWhatsAppPrimary()}
                            style={{
                                flex: 1,
                                height: 40,
                                borderRadius: 10,
                                border: 'none',
                                background: 'var(--purple)',
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
                        background: '#EEEDFE',
                        color: '#534AB7',
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
                    {timelineOpen ? <>← Fechar painel</> : <>Abrir histórico →</>}
                </button>
            </div>
        </div>
    );

    const tabBtn = (id, label) => (
        <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
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
            <div
                style={{
                    padding: '12px 14px',
                    flexShrink: 0,
                    display: 'flex',
                    gap: 6,
                    background: 'var(--surface)',
                    borderBottom: '1px solid var(--border-light)',
                }}
            >
                {tabBtn('frequency', 'Frequência')}
                {canViewFinance ? tabBtn('payments', 'Pagamentos') : null}
                {modules?.finance === true ? tabBtn('contracts', 'Contratos') : null}
                {tabBtn('timeline', 'Linha do tempo')}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 16, minHeight: 0 }}>
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
                                            <div style={{ fontSize: 18, fontWeight: 500, color: '#5B3FBF' }}>{cell.value}</div>
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
                            const q = encodeURIComponent(String(student.name || '').trim());
                            navigate(q ? `/mensalidades?search=${q}` : '/mensalidades');
                        }}
                        onGoSales={() => navigate('/vendas?tab=history')}
                        onCancelCoverage={handleCancelCoverage}
                        cancellingCoverage={cancellingCoverage}
                        hasSales={sales.length > 0}
                        planFreezes={planFreezes}
                        onOpenFreeze={() => setFreezeModalOpen(true)}
                        freezeBusy={freezeBusy}
                        onEndFreeze={() => void handleEndFreezeEarly()}
                        endFreezeBusy={endFreezeBusy}
                    />
                ) : null}

                {activeTab === 'contracts' && modules?.finance === true && student ? (
                    <StudentContractsSection leadId={student.id} />
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
                                    background: 'var(--purple)',
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
                                        if (type === 'note' || type === 'inbox_note') dotColor = '#5B3FBF';
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
            className="student-profile-page-root"
            style={{
                display: 'flex',
                height: '100%',
                overflow: 'auto',
                width: '100%',
                background: 'var(--surface)',
            }}
        >
            <style
                dangerouslySetInnerHTML={{
                    __html: `
            .student-profile-page-root {
              min-height: calc(100vh - env(safe-area-inset-bottom, 0px));
            }
            @supports (min-height: 100dvh) {
              .student-profile-page-root {
                min-height: 100dvh;
              }
            }
            .student-profile-data-input:focus {
              outline: none;
              border: 1px solid #5B3FBF !important;
            }
          `,
                }}
            />
            {leftColumn}
            {rightColumn}

            <NlCommandBar
                open={nlOpen}
                onOpenChange={setNlOpen}
                academyName={academyNameDisplay}
                context="perfil"
                pipelineStages={pipelineStagesNl}
                recentPayments={recentPaymentsForNl}
            />

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
                onClose={() => setShowPaymentModal(false)}
                onSave={saveStudentPayment}
                salesEnabled={modules?.sales === true}
                onSaleComplete={() => void loadPayments()}
            />
        </div>
    );
}
