import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Pencil, User, ChevronDown, MessageCircle, Send, Trash2, AlertTriangle } from 'lucide-react';
import { databases, DB_ID, ACADEMIES_COL, account } from '../lib/appwrite';
import { getStudentPayments, createPayment, getPaymentStatus } from '../lib/studentPayments.js';
import { getAttendance, getAttendanceStats, createCheckin, isAttendanceConfigured } from '../lib/attendance.js';
import { addLeadEvent, getLeadEvents } from '../lib/leadEvents.js';
import { DEFAULT_WHATSAPP_TEMPLATES, WHATSAPP_TEMPLATE_LABELS } from '../../lib/whatsappTemplateDefaults.js';
import { sendWhatsappTemplateOutbound } from '../lib/outboundWhatsappTemplate.js';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { friendlyError } from '../lib/errorMessages.js';
import { PIPELINE_STAGES } from '../constants/pipeline.js';

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

function calcTempoDeCasa(dateStr) {
    if (!dateStr) return null;
    const start = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(start.getTime())) return null;
    const now = new Date();
    const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    const years = Math.floor(months / 12);
    const rem = months % 12;
    if (years === 0) return `${rem} ${rem === 1 ? 'mês' : 'meses'}`;
    if (rem === 0) return `${years} ${years === 1 ? 'ano' : 'anos'}`;
    return `${years} ${years === 1 ? 'ano' : 'anos'} e ${rem} ${rem === 1 ? 'mês' : 'meses'}`;
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

function humanizeTimelineStage(s) {
    const t = String(s || '').trim();
    if (!t) return '—';
    if (STATUS_CONFIG[t]) return t;
    if (PIPELINE_STAGES.includes(t)) return t;
    const upper = t.toUpperCase().replace(/\s+/g, '_');
    if (ENGLISH_STATUS_TOKEN_LABELS[upper]) return ENGLISH_STATUS_TOKEN_LABELS[upper];
    return t.replace(/_/g, ' ');
}

const STUDENT_DATA_FIELDS = [
    { key: 'plan', label: 'Plano contratado', type: 'text', placeholder: 'Ex.: Mensal, Anual, Semestral' },
    { key: 'enrollmentDate', label: 'Data de ingresso', type: 'date', placeholder: '' },
    { key: 'birthDate', label: 'Data de nascimento', type: 'date', placeholder: '' },
];

const EMERGENCY_FIELDS = [
    { key: 'emergencyContact', label: 'Contato de emergência', type: 'text', placeholder: 'Nome do contato' },
    { key: 'emergencyPhone', label: 'Telefone de emergência', type: 'tel', placeholder: 'Celular' },
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
    const student = useLeadStore((s) => s.leads.find((l) => l.id === id));
    const loading = useLeadStore((s) => s.loading);
    const academyId = useLeadStore((s) => s.academyId);
    const userId = useLeadStore((s) => s.userId);
    const academyList = useLeadStore((s) => s.academyList);
    const deleteLead = useLeadStore((s) => s.deleteLead);
    const updateLead = useLeadStore((s) => s.updateLead);
    const uiLabels = useLeadStore((s) => s.labels);
    const addToast = useUiStore((s) => s.addToast);

    const permCtx = useMemo(() => {
        const acad = (academyList || []).find((a) => a.id === academyId) || {};
        return { ownerId: acad.ownerId, teamId: acad.teamId, userId: userId || '' };
    }, [academyList, academyId, userId]);

    const [form, setForm] = useState({
        plan: '',
        enrollmentDate: '',
        emergencyContact: '',
        emergencyPhone: '',
        birthDate: '',
    });
    const [editingKey, setEditingKey] = useState(null);
    const [draft, setDraft] = useState('');
    const [savingKey, setSavingKey] = useState(null);
    const [listEditMode, setListEditMode] = useState(false);
    const [timelineOpen, setTimelineOpen] = useState(true);
    const [activeTab, setActiveTab] = useState('frequency');
    const [waCtx, setWaCtx] = useState({
        name: '',
        zapster: '',
        templates: DEFAULT_WHATSAPP_TEMPLATES,
    });
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
    const [loadingPayments, setLoadingPayments] = useState(true);
    const [paymentsError, setPaymentsError] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentStatus, setPaymentStatus] = useState(null);
    const [payForm, setPayForm] = useState({
        reference_month: new Date().toISOString().slice(0, 7),
        amount: '',
        method: 'pix',
        account: '',
        status: 'paid',
        paid_at: new Date().toISOString().slice(0, 10),
        due_date: '',
        plan_name: '',
        note: '',
    });
    const [savingPayment, setSavingPayment] = useState(false);
    const [viewportStacked, setViewportStacked] = useState(
        () => typeof window !== 'undefined' && window.innerWidth < 1024
    );
    const stackedLayout = viewportStacked;

    const leadId = id || '';

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 1023px)');
        const onChange = () => setViewportStacked(mq.matches);
        mq.addEventListener('change', onChange);
        setViewportStacked(mq.matches);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    useEffect(() => {
        if (!student) return;
        setForm({
            plan: student.plan || '',
            enrollmentDate: student.enrollmentDate || '',
            emergencyContact: student.emergencyContact || '',
            emergencyPhone: student.emergencyPhone || '',
            birthDate: student.birthDate || '',
        });
        setEditingKey(null);
        setDraft('');
    }, [student]);

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
            setPaymentStatus({ status: 'none', payment: null });
            setLoadingPayments(false);
            setPaymentsError(false);
            return;
        }
        setLoadingPayments(true);
        setPaymentsError(false);
        try {
            const [docs, status] = await Promise.all([
                getStudentPayments(leadId, academyId),
                getPaymentStatus(leadId, academyId),
            ]);
            setPayments(docs);
            setPaymentStatus(status);
        } catch (e) {
            console.error(e);
            setPaymentsError(true);
            setPayments([]);
            setPaymentStatus({ status: 'none', payment: null });
        } finally {
            setLoadingPayments(false);
        }
    }, [leadId, academyId]);

    useEffect(() => {
        void loadPayments();
    }, [loadPayments]);

    useEffect(() => {
        if (!academyId) return;
        databases
            .getDocument(DB_ID, ACADEMIES_COL, academyId)
            .then((doc) => {
                let tplParsed = {};
                try {
                    const w = doc.whatsappTemplates;
                    const p = typeof w === 'string' ? JSON.parse(w) : w;
                    if (p && typeof p === 'object' && !Array.isArray(p)) tplParsed = p;
                } catch {
                    tplParsed = {};
                }
                setWaCtx({
                    name: String(doc?.name || '').trim(),
                    zapster: String(doc?.zapster_instance_id || '').trim(),
                    templates: { ...DEFAULT_WHATSAPP_TEMPLATES, ...tplParsed },
                });
            })
            .catch(() => {
                setWaCtx({ name: '', zapster: '', templates: DEFAULT_WHATSAPP_TEMPLATES });
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
        if (t === 'lead_criado') return { type: 'lead_created', at, text: d.text || 'Lead cadastrado no CRM', $id: d.$id, is_pinned: d.is_pinned };
        return { type: t, ...base };
    }, []);

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

    const startEdit = (key) => {
        if (!listEditMode || savingKey) return;
        setEditingKey(key);
        setDraft(String(form[key] ?? ''));
    };

    const cancelEdit = useCallback(() => {
        setEditingKey(null);
        setDraft('');
    }, []);

    const commitRow = async (key) => {
        if (savingKey || !student) return;
        const next = { ...form, [key]: draft };
        setSavingKey(key);
        try {
            await updateLead(leadId, next);
            setForm(next);
            setEditingKey(null);
            setDraft('');
            addToast({ type: 'success', message: 'Salvo com sucesso.' });
        } catch {
            addToast({ type: 'error', message: 'Erro ao salvar. Tente novamente.' });
        } finally {
            setSavingKey(null);
        }
    };

    const displayForRow = (key) => {
        const raw = form[key];
        if (key === 'enrollmentDate' || key === 'birthDate') {
            const br = formatDateBR(raw);
            return br || '';
        }
        return raw != null && String(raw).trim() ? String(raw).trim() : '';
    };

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
                await updateLead(leadId, { lastWhatsappActivityAt: new Date().toISOString() });
                await refreshTimeline();
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
            await updateLead(leadId, { lastNoteAt: new Date().toISOString() });
            setNote('');
            addToast({ type: 'success', message: 'Nota adicionada.' });
            await refreshTimeline();
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
            await deleteLead(leadId);
            addToast({ type: 'success', message: 'Aluno excluído com sucesso.' });
            setConfirmDeleteOpen(false);
            navigate('/students');
        } catch (e) {
            addToast({ type: 'error', message: friendlyError(e, 'delete') });
        } finally {
            setDeleteBusy(false);
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
            addToast({ type: 'success', message: 'Presença registrada!' });
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
        } catch (e) {
            addToast({ type: 'error', message: friendlyError(e, 'save') || 'Não foi possível registrar a presença.' });
        } finally {
            setCheckingIn(false);
        }
    };

    const openPaymentModal = useCallback(() => {
        if (!student) return;
        setPayForm({
            reference_month: new Date().toISOString().slice(0, 7),
            amount: student.plan_price != null && student.plan_price !== '' ? String(student.plan_price) : '',
            method: 'pix',
            account: '',
            status: 'paid',
            paid_at: new Date().toISOString().slice(0, 10),
            due_date: '',
            plan_name: student.plan || '',
            note: '',
        });
        setShowPaymentModal(true);
    }, [student]);

    const saveStudentPayment = useCallback(async () => {
        if (!student || !academyId || savingPayment) return;
        const amountNum = parseFloat(String(payForm.amount || '').replace(',', '.'));
        if (!Number.isFinite(amountNum) || amountNum <= 0) {
            addToast({ type: 'error', message: 'Informe um valor maior que zero.' });
            return;
        }
        const data = {
            lead_id: student.id,
            academy_id: academyId,
            amount: amountNum,
            method: payForm.method,
            account: payForm.account || '',
            plan_name: payForm.plan_name || student.plan || '',
            status: payForm.status,
            reference_month: payForm.reference_month,
            due_date: payForm.status === 'pending' && payForm.due_date ? new Date(payForm.due_date).toISOString() : null,
            paid_at: payForm.status === 'paid' && payForm.paid_at ? new Date(payForm.paid_at).toISOString() : null,
            registered_by: userId || '',
            registered_by_name: sessionUserName,
            note: payForm.note || '',
        };
        setSavingPayment(true);
        try {
            const doc = await createPayment(data);
            setPayments((prev) => [doc, ...prev]);
            const localYm = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
            if (doc.reference_month === localYm) {
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
    }, [student, academyId, savingPayment, payForm, userId, sessionUserName, addToast]);

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

    const rowBase = {
        borderRadius: 10,
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        padding: '12px 14px',
        marginBottom: 8,
    };

    if (loading && !student) {
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
                <p className="text-light">Aluno não encontrado.</p>
                <button type="button" className="btn-primary mt-4" onClick={() => navigate('/students')}>
                    Voltar aos alunos
                </button>
            </div>
        );
    }

    const phoneHasDigits = Boolean(String(student.phone || '').replace(/\D/g, '').length);
    const attendanceReady = isAttendanceConfigured();
    const enrollmentYmd = student.enrollmentDate || form.enrollmentDate;
    const tempoCasa = enrollmentYmd ? calcTempoDeCasa(enrollmentYmd) : null;
    const showRightPanel = timelineOpen;
    const studentsPlural = uiLabels.students || 'Alunos';
    const currentYm = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const currentMonthExtended = formatReferenceMonthLong(currentYm);

    const renderFieldRows = (fields) =>
        fields.map((field) => {
            const isEditing = editingKey === field.key;
            const isSaving = savingKey === field.key;
            const shown = displayForRow(field.key);

            return (
                <div
                    key={field.key}
                    style={{
                        ...rowBase,
                        borderColor: isEditing ? 'var(--accent)' : 'var(--border)',
                        boxShadow: isEditing ? '0 0 0 2px var(--accent-light)' : 'none',
                    }}
                >
                    <div
                        style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: 'var(--text-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            marginBottom: isEditing ? 8 : 6,
                        }}
                    >
                        {field.label}
                    </div>

                    {isEditing ? (
                        <>
                            <input
                                type={field.type}
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                placeholder={field.placeholder}
                                disabled={Boolean(savingKey)}
                                style={inputStyle}
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') cancelEdit();
                                }}
                            />
                            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                <button
                                    type="button"
                                    disabled={Boolean(savingKey)}
                                    onClick={() => commitRow(field.key)}
                                    style={{
                                        flex: 1,
                                        padding: '8px 12px',
                                        borderRadius: 8,
                                        border: 'none',
                                        background: 'var(--purple)',
                                        color: '#fff',
                                        fontWeight: 700,
                                        fontSize: 13,
                                        cursor: savingKey ? 'not-allowed' : 'pointer',
                                        opacity: savingKey ? 0.7 : 1,
                                    }}
                                >
                                    {isSaving ? 'Salvando…' : 'Salvar'}
                                </button>
                                <button
                                    type="button"
                                    disabled={Boolean(savingKey)}
                                    onClick={cancelEdit}
                                    style={{
                                        padding: '8px 14px',
                                        borderRadius: 8,
                                        border: '1px solid var(--border)',
                                        background: 'transparent',
                                        color: 'var(--text-secondary)',
                                        fontWeight: 600,
                                        fontSize: 13,
                                        cursor: savingKey ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    Cancelar
                                </button>
                            </div>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={() => startEdit(field.key)}
                            disabled={!listEditMode || Boolean(editingKey) || Boolean(savingKey)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 10,
                                width: '100%',
                                textAlign: 'left',
                                border: 'none',
                                background: 'none',
                                padding: 0,
                                cursor: listEditMode && !editingKey && !savingKey ? 'pointer' : 'default',
                                fontFamily: 'inherit',
                                opacity: listEditMode ? 1 : 0.85,
                            }}
                        >
                            <span
                                style={{
                                    fontSize: 14,
                                    fontWeight: 500,
                                    color: shown ? 'var(--text)' : 'var(--text-muted)',
                                    fontStyle: shown ? 'normal' : 'italic',
                                }}
                            >
                                {shown || (listEditMode ? 'Toque para preencher' : '—')}
                            </span>
                            {listEditMode ? <Pencil size={16} color="var(--text-muted)" aria-hidden /> : null}
                        </button>
                    )}
                </div>
            );
        });

    const leftColumn = (
        <div
            className="student-panel-left-col"
            style={{
                width: stackedLayout && showRightPanel ? '100%' : 360,
                flexShrink: 0,
                overflowY: 'auto',
                display: stackedLayout && showRightPanel ? 'none' : 'flex',
                flexDirection: 'column',
                borderRight: stackedLayout ? 'none' : '1px solid var(--border)',
                background: 'var(--surface)',
                minHeight: 0,
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
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
                <button
                    type="button"
                    onClick={() => {
                        setListEditMode((v) => !v);
                        setEditingKey(null);
                        setDraft('');
                    }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: listEditMode ? 'var(--v50)' : 'var(--surface)',
                        color: 'var(--text-secondary)',
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                    }}
                >
                    <Pencil size={14} /> {listEditMode ? 'Concluir' : 'Editar'}
                </button>
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
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{student.name || 'Sem nome'}</h2>
                    <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>{formatPhone(student.phone) || '—'}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 10 }}>
                        <span className="badge-success" style={{ fontSize: 11, borderRadius: 6, padding: '2px 8px' }}>
                            Matriculado
                        </span>
                        {student.type && String(student.type).trim() ? (
                            <span className="badge-purple" style={{ fontSize: 11, borderRadius: 6, padding: '2px 8px' }}>
                                {student.type}
                            </span>
                        ) : null}
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
                    {checkingIn ? 'Registrando...' : '+ Registrar presença'}
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
                        Dados do aluno
                    </p>
                    {!listEditMode ? (
                        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                            Toque em &quot;Editar&quot; para alterar os campos.
                        </p>
                    ) : (
                        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                            Toque em uma linha para editar. Salve ou cancele antes de editar outro campo.
                        </p>
                    )}
                    {renderFieldRows(STUDENT_DATA_FIELDS)}
                </div>

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
                        Contato de emergência
                    </p>
                    {renderFieldRows(EMERGENCY_FIELDS)}
                </div>

                <div style={{ marginBottom: 8 }}>
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
                        <Trash2 size={16} /> Excluir aluno
                    </button>
                </div>
            </div>

            <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border-light)', flexShrink: 0 }}>
                <button
                    type="button"
                    onClick={() => setTimelineOpen((o) => !o)}
                    style={{
                        width: '100%',
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
                    {timelineOpen ? <>← Fechar painel</> : <>Ver frequência e histórico →</>}
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
                flex: 1,
                maxWidth: stackedLayout ? 'none' : 560,
                minWidth: 0,
                background: BG_SECONDARY,
                display: stackedLayout && !showRightPanel ? 'none' : 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                width: stackedLayout ? '100%' : undefined,
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
                {tabBtn('payments', 'Pagamentos')}
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
                                        Sem permissão para ler a coleção de presenças no Appwrite (401). Abra a coleção
                                        configurada em <code style={{ fontSize: 12 }}>VITE_APPWRITE_ATTENDANCE_COL_ID</code> e
                                        conceda <strong>Read</strong> ao papel adequado (usuários autenticados ou equipe da
                                        academia), como na coleção de leads.
                                    </>
                                ) : (
                                    <>Erro ao carregar presenças.</>
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
                                    <div
                                        style={{
                                            textAlign: 'center',
                                            color: 'var(--text-secondary)',
                                            fontSize: 14,
                                            padding: '16px 8px',
                                        }}
                                    >
                                        Nenhuma presença registrada ainda
                                    </div>
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

                {activeTab === 'payments' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 120 }}>
                        <button
                            type="button"
                            onClick={() => openPaymentModal()}
                            style={{
                                width: '100%',
                                marginBottom: 12,
                                padding: '12px 14px',
                                borderRadius: 10,
                                border: 'none',
                                background: '#5B3FBF',
                                color: '#fff',
                                fontSize: 13,
                                fontWeight: 700,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >
                            + Registrar pagamento
                        </button>
                        {loadingPayments ? (
                            <div
                                style={{
                                    textAlign: 'center',
                                    color: 'var(--text-secondary)',
                                    padding: 24,
                                    fontSize: 14,
                                }}
                            >
                                Carregando pagamentos...
                            </div>
                        ) : paymentsError ? (
                            <div
                                style={{
                                    textAlign: 'center',
                                    color: 'var(--text-secondary)',
                                    padding: 24,
                                    fontSize: 14,
                                    lineHeight: 1.5,
                                }}
                            >
                                Erro ao carregar ·{' '}
                                <button
                                    type="button"
                                    onClick={() => void loadPayments()}
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
                        ) : payments.length === 0 ? (
                            <div
                                style={{
                                    textAlign: 'center',
                                    color: 'var(--text-secondary)',
                                    fontSize: 14,
                                    padding: '16px 8px',
                                }}
                            >
                                Nenhum pagamento registrado
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {payments.map((payment) => {
                                    const st = String(payment.status || '');
                                    const leftBorder =
                                        st === 'pending'
                                            ? '2px solid var(--danger)'
                                            : st === 'paid'
                                              ? '2px solid var(--success)'
                                              : '2px solid var(--border)';
                                    const amountColor =
                                        st === 'paid'
                                            ? 'var(--success)'
                                            : st === 'pending'
                                              ? 'var(--danger)'
                                              : 'var(--text-muted)';
                                    const monthTitle = formatReferenceMonthLong(payment.reference_month);
                                    const subLine =
                                        st === 'paid'
                                            ? `${METHOD_PAYMENT_LABELS[payment.method] || payment.method} · pago em ${formatDdMmYyyyFromIso(payment.paid_at)}`
                                            : st === 'pending'
                                              ? `Pendente · ${
                                                    payment.due_date
                                                        ? `vence ${formatDdMmYyyyFromIso(payment.due_date)}`
                                                        : 'sem vencimento'
                                                }`
                                              : '';
                                    return (
                                        <div
                                            key={payment.$id}
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                gap: 12,
                                                padding: '8px 12px',
                                                background: 'var(--surface)',
                                                border: '0.5px solid var(--border-light)',
                                                borderRadius: 'var(--radius-sm)',
                                                borderLeft: leftBorder,
                                            }}
                                        >
                                            <div style={{ minWidth: 0, textAlign: 'left' }}>
                                                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{monthTitle}</div>
                                                {subLine ? (
                                                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                                                        {subLine}
                                                    </div>
                                                ) : null}
                                                {payment.account ? (
                                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                                                        {payment.account}
                                                    </div>
                                                ) : null}
                                            </div>
                                            <div
                                                style={{
                                                    fontSize: 14,
                                                    fontWeight: 800,
                                                    color: amountColor,
                                                    flexShrink: 0,
                                                }}
                                            >
                                                R${' '}
                                                {Number(payment.amount || 0).toLocaleString('pt-BR', {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
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
                                placeholder="Adicione uma observação sobre este aluno..."
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
                                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24, fontSize: 14 }}>
                                    Nenhum evento registrado.
                                </div>
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
                                        const tag = TIMELINE_EVENT_LABELS[type] ?? type;
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
                                            label = `De ${humanizeTimelineStage(n.from)} para ${humanizeTimelineStage(n.to)}`;
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
            style={{
                display: 'flex',
                minHeight: '100vh',
                height: '100%',
                overflow: 'hidden',
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
                        <h3 style={{ margin: 0, textAlign: 'center', fontSize: 18, fontWeight: 800 }}>Excluir aluno?</h3>
                        <p style={{ margin: '12px 0 0', textAlign: 'center', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            Esta ação não pode ser desfeita. Todos os dados do aluno serão removidos.
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

            {showPaymentModal && student ? (
                <div
                    className="navi-modal-overlay"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="student-payment-modal-title"
                    onClick={() => (savingPayment ? undefined : setShowPaymentModal(false))}
                >
                    <div
                        className="card"
                        onClick={(e) => e.stopPropagation()}
                        style={{ maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 20 }}
                    >
                        <h3 id="student-payment-modal-title" style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>
                            Registrar pagamento
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div>
                                <label
                                    style={{
                                        display: 'block',
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: 'var(--text-muted)',
                                        marginBottom: 6,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.06em',
                                    }}
                                >
                                    Mês de referência
                                </label>
                                <input
                                    type="month"
                                    className="form-input"
                                    style={{ ...inputStyle, width: '100%' }}
                                    value={payForm.reference_month}
                                    onChange={(e) => setPayForm((p) => ({ ...p, reference_month: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label
                                    style={{
                                        display: 'block',
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: 'var(--text-muted)',
                                        marginBottom: 6,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.06em',
                                    }}
                                >
                                    Status
                                </label>
                                <select
                                    className="form-input"
                                    style={{ ...inputStyle, width: '100%' }}
                                    value={payForm.status}
                                    onChange={(e) => setPayForm((p) => ({ ...p, status: e.target.value }))}
                                >
                                    <option value="paid">Pago</option>
                                    <option value="pending">Pendente</option>
                                </select>
                            </div>
                            <div>
                                <label
                                    style={{
                                        display: 'block',
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: 'var(--text-muted)',
                                        marginBottom: 6,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.06em',
                                    }}
                                >
                                    Valor (R$)
                                </label>
                                <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    placeholder="0,00"
                                    className="form-input"
                                    style={{ ...inputStyle, width: '100%' }}
                                    value={payForm.amount}
                                    onChange={(e) => setPayForm((p) => ({ ...p, amount: e.target.value }))}
                                />
                            </div>
                            {payForm.status === 'paid' ? (
                                <div>
                                    <label
                                        style={{
                                            display: 'block',
                                            fontSize: 11,
                                            fontWeight: 700,
                                            color: 'var(--text-muted)',
                                            marginBottom: 6,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.06em',
                                        }}
                                    >
                                        Data do pagamento
                                    </label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        style={{ ...inputStyle, width: '100%' }}
                                        value={payForm.paid_at}
                                        onChange={(e) => setPayForm((p) => ({ ...p, paid_at: e.target.value }))}
                                    />
                                </div>
                            ) : null}
                            {payForm.status === 'pending' ? (
                                <div>
                                    <label
                                        style={{
                                            display: 'block',
                                            fontSize: 11,
                                            fontWeight: 700,
                                            color: 'var(--text-muted)',
                                            marginBottom: 6,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.06em',
                                        }}
                                    >
                                        Data de vencimento
                                    </label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        style={{ ...inputStyle, width: '100%' }}
                                        value={payForm.due_date}
                                        onChange={(e) => setPayForm((p) => ({ ...p, due_date: e.target.value }))}
                                    />
                                </div>
                            ) : null}
                            <div>
                                <label
                                    style={{
                                        display: 'block',
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: 'var(--text-muted)',
                                        marginBottom: 6,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.06em',
                                    }}
                                >
                                    Forma de pagamento
                                </label>
                                <select
                                    className="form-input"
                                    style={{ ...inputStyle, width: '100%' }}
                                    value={payForm.method}
                                    onChange={(e) => setPayForm((p) => ({ ...p, method: e.target.value }))}
                                >
                                    <option value="pix">PIX</option>
                                    <option value="dinheiro">Dinheiro</option>
                                    <option value="cartão_débito">Cartão débito</option>
                                    <option value="cartão_crédito">Cartão crédito</option>
                                    <option value="transferência">Transferência</option>
                                </select>
                            </div>
                            <div>
                                <label
                                    style={{
                                        display: 'block',
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: 'var(--text-muted)',
                                        marginBottom: 6,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.06em',
                                    }}
                                >
                                    Conta (opcional)
                                </label>
                                <input
                                    type="text"
                                    className="form-input"
                                    style={{ ...inputStyle, width: '100%' }}
                                    placeholder="Ex: Caixa físico, Banco Inter"
                                    value={payForm.account}
                                    onChange={(e) => setPayForm((p) => ({ ...p, account: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label
                                    style={{
                                        display: 'block',
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: 'var(--text-muted)',
                                        marginBottom: 6,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.06em',
                                    }}
                                >
                                    Plano
                                </label>
                                <input
                                    type="text"
                                    className="form-input"
                                    style={{ ...inputStyle, width: '100%' }}
                                    value={payForm.plan_name}
                                    onChange={(e) => setPayForm((p) => ({ ...p, plan_name: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label
                                    style={{
                                        display: 'block',
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: 'var(--text-muted)',
                                        marginBottom: 6,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.06em',
                                    }}
                                >
                                    Observação
                                </label>
                                <textarea
                                    rows={2}
                                    className="form-input"
                                    style={{ ...inputStyle, width: '100%', resize: 'vertical', minHeight: 64 }}
                                    value={payForm.note}
                                    onChange={(e) => setPayForm((p) => ({ ...p, note: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                            <button
                                type="button"
                                disabled={savingPayment}
                                onClick={() => setShowPaymentModal(false)}
                                style={{
                                    flex: 1,
                                    padding: '10px 12px',
                                    borderRadius: 10,
                                    border: '1px solid var(--border)',
                                    background: 'var(--surface)',
                                    fontWeight: 700,
                                    cursor: savingPayment ? 'not-allowed' : 'pointer',
                                    fontFamily: 'inherit',
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={savingPayment}
                                onClick={() => void saveStudentPayment()}
                                style={{
                                    flex: 1,
                                    padding: '10px 12px',
                                    borderRadius: 10,
                                    border: 'none',
                                    background: '#5B3FBF',
                                    color: '#fff',
                                    fontWeight: 700,
                                    cursor: savingPayment ? 'not-allowed' : 'pointer',
                                    fontFamily: 'inherit',
                                }}
                            >
                                {savingPayment ? 'Salvando...' : 'Registrar'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
