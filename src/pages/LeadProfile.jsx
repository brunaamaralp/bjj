import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { addLeadEvent, getLeadEvents, updateLeadEvent } from '../lib/leadEvents.js';
import { useParams, useNavigate } from 'react-router-dom';
import { useLeadStore, LEAD_STATUS, LEAD_ORIGIN } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { ArrowLeft, ArrowRight, ChevronRight, ChevronDown, MessageCircle, Calendar, UserCheck, Phone, Send, Clock, Copy, Check, Pencil, X, Save, AlertTriangle, Trash2, StickyNote, Pin, Baby, Users, Dumbbell } from 'lucide-react';
import { databases, DB_ID, ACADEMIES_COL, account } from '../lib/appwrite';
import LabelPill from '../components/shared/LabelPill';
import LabelSelector from '../components/shared/LabelSelector';
import { DEFAULT_WHATSAPP_TEMPLATES, WHATSAPP_TEMPLATE_LABELS } from '../../lib/whatsappTemplateDefaults.js';
import { sendWhatsappTemplateOutbound } from '../lib/outboundWhatsappTemplate.js';
import { LostReasonModal } from '../components/LostReasonModal';
import MatriculaModal from '../components/MatriculaModal';
import { PIPELINE_WAITING_DECISION_STAGE, PIPELINE_STAGES } from '../constants/pipeline.js';
import { friendlyError } from '../lib/errorMessages.js';
import { maskPhone } from '../lib/masks.js';

function hasLeadDisplayValue(val) {
    const s = String(val ?? '').trim();
    return Boolean(s) && s !== '-';
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
    [LEAD_STATUS.CONVERTED]: { bg: 'var(--purple-light)', color: 'var(--purple)' },
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
    const updateLead = useLeadStore((s) => s.updateLead);
    const deleteLead = useLeadStore((s) => s.deleteLead);
    const addToast = useUiStore((s) => s.addToast);
    const academyId = useLeadStore((s) => s.academyId);
    const userId = useLeadStore((s) => s.userId);
    const academyList = useLeadStore((s) => s.academyList);
    const uiLabels = useLeadStore((s) => s.labels);

    const permCtx = useMemo(() => {
        const acad = (academyList || []).find((a) => a.id === academyId) || {};
        return { ownerId: acad.ownerId, teamId: acad.teamId, userId: userId || '' };
    }, [academyList, academyId, userId]);

    const [timelineEvents, setTimelineEvents] = useState([]);
    const [timelineError, setTimelineError] = useState(false);
    const [confirmModal, setConfirmModal] = useState(null);
    const [confirmBusy, setConfirmBusy] = useState(false);
    const [updatingStatus, setUpdatingStatus] = useState(false);
    const [saving, setSaving] = useState(false);
    const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
    const [addingNote, setAddingNote] = useState(false);
    const [timelineOpen, setTimelineOpen] = useState(true);

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
        if (t === 'lead_criado') return { type: 'lead_created', at, text: d.text || 'Lead cadastrado no CRM' };
        return { type: t, ...base };
    }, []);

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

    // Academy-level labels list (for the selector dropdown)
    const [allLabels, setAllLabels] = useState([]);

    const [note, setNote] = useState('');
    const [editing, setEditing] = useState(false);
    const [customQuestions, setCustomQuestions] = useState([]);
    const [deletingLead, setDeletingLead] = useState(false);
    const [lostModalOpen, setLostModalOpen] = useState(false);
    const [matriculaModalOpen, setMatriculaModalOpen] = useState(false);
    const [waCtx, setWaCtx] = useState({
        name: '',
        zapster: '',
        templates: DEFAULT_WHATSAPP_TEMPLATES
    });
    const [templateMenuOpen, setTemplateMenuOpen] = useState(false);

    useEffect(() => {
        setTemplateMenuOpen(false);
    }, [id]);

    useEffect(() => {
        if (!academyId) return;
        (async () => {
            try {
                const jwt = await account.createJWT();
                const token = String(jwt?.jwt || '').trim();
                const res = await fetch('/api/labels', {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'x-academy-id': academyId,
                    },
                });
                const data = await res.json();
                if (data?.sucesso) setAllLabels(data.labels || []);
            } catch {
                addToast({ type: 'error', message: 'Não foi possível carregar etiquetas.' });
            }
        })();
    }, [academyId, addToast]);
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
                    templates: { ...DEFAULT_WHATSAPP_TEMPLATES, ...tplParsed }
                });
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

    const statusPipelineMismatch = useMemo(() => {
        if (!lead) return null;
        const exp = expectedPipelineStageForStatus(lead.status);
        if (exp == null) return null;
        const cur = String(lead.pipelineStage || '').trim();
        if (!cur || cur === exp) return null;
        return { expected: exp, current: cur };
    }, [lead]);

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
            type: src.type || 'Adulto',
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
                <p className="text-light">Lead não encontrado.</p>
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
    const onChangeCustom = (q, value) => {
        const qid = String(q?.id || q || '').trim();
        if (!qid) return;
        setForm((f) => ({ ...f, customAnswers: { ...(f.customAnswers || {}), [qid]: value } }));
    };

    const executeSaveLead = async (payload) => {
        if (!String(payload.name || '').trim()) {
            addToast({ type: 'error', message: 'Nome é obrigatório' });
            return;
        }
        if (!String(payload.phone || '').trim()) {
            addToast({ type: 'error', message: 'Telefone é obrigatório' });
            return;
        }
        const digits = String(payload.phone || '').replace(/\D/g, '');
        if (digits.length < 10) {
            addToast({ type: 'error', message: 'Telefone inválido — mínimo 10 dígitos' });
            return;
        }
        setSaving(true);
        try {
            const digitsPhone = String(payload.phone || '').replace(/\D/g, '');
            await updateLead(id, { ...payload, phone: digitsPhone });
            setEditing(false);
            addToast({ type: 'success', message: 'Dados salvos com sucesso.' });
            await refreshTimeline();
        } catch (e) {
            addToast({ type: 'error', message: friendlyError(e, 'save') });
        } finally {
            setSaving(false);
        }
    };

    const handleSave = async () => {
        if (saving) return;
        if (!form.name?.trim()) {
            addToast({ type: 'error', message: 'Nome é obrigatório' });
            return;
        }
        if (!form.phone?.trim()) {
            addToast({ type: 'error', message: 'Telefone é obrigatório' });
            return;
        }
        const digits = String(form.phone).replace(/\D/g, '');
        if (digits.length < 10) {
            addToast({ type: 'error', message: 'Telefone inválido — mínimo 10 dígitos' });
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
                description: `O status (${payload.status ?? lead.status}) costuma ir com a etapa “${afterExp}”, mas a etapa atual é “${stageAfter}”. Isso pode deixar o card na coluna errada no funil. Deseja salvar mesmo assim?`,
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
                ...(newStatus === LEAD_STATUS.CONVERTED ? { contact_type: 'student' } : {}),
                ...(pipelineStage ? { pipelineStage } : {})
            };
            if (newStatus === LEAD_STATUS.COMPLETED) patch.attendedAt = nowIso;
            if (newStatus === LEAD_STATUS.MISSED) patch.missedAt = nowIso;
            if (newStatus === LEAD_STATUS.CONVERTED) patch.convertedAt = nowIso;
            await updateLead(id, patch);
            await refreshTimeline();
            if (newStatus === LEAD_STATUS.SCHEDULED) {
                const fresh = useLeadStore.getState().leads.find((l) => l.id === id);
                if (fresh) {
                    fillFormFromLead(fresh);
                    setEditing(true);
                }
                addToast({
                    type: 'success',
                    message: 'Status: Agendado. Defina data e horário nos campos abaixo e toque em Salvar.',
                });
            } else if (newStatus === LEAD_STATUS.COMPLETED) {
                addToast({ type: 'success', message: 'Comparecimento registrado.' });
            } else if (newStatus === LEAD_STATUS.CONVERTED) {
                addToast({ type: 'success', message: 'Lead marcado como matriculado.' });
            }
            return true;
        } catch (e) {
            addToast({ type: 'error', message: friendlyError(e, 'save') });
            throw e;
        } finally {
            setUpdatingStatus(false);
        }
    };
    const handleMarkLost = () => {
        setLostModalOpen(true);
    };

    const handleMatricularClick = () => {
        setMatriculaModalOpen(true);
    };

    const handleConfirmSimple = () => {
        setMatriculaModalOpen(false);
        void handleUpdateStatus(LEAD_STATUS.CONVERTED);
    };

    const handleConfirmFull = async () => {
        setMatriculaModalOpen(false);
        try {
            await handleUpdateStatus(LEAD_STATUS.CONVERTED);
            const fresh = useLeadStore.getState().leads.find((l) => l.id === id);
            if (fresh) {
                fillFormFromLead(fresh);
            } else {
                fillFormFromLead({
                    ...lead,
                    status: LEAD_STATUS.CONVERTED,
                    contact_type: 'student',
                });
            }
            setEditing(true);
        } catch (e) {
            // erro já tratado com toast no handleUpdateStatus
        }
    };

    const confirmMarkLost = async (lostReason) => {
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
        await refreshTimeline();
    };
    const deleteLeadExecute = async () => {
        if (deletingLead) return;
        setDeletingLead(true);
        try {
            await deleteLead(id);
            addToast({ type: 'success', message: 'Lead excluído com sucesso.' });
            navigate(-1);
        } catch (e) {
            addToast({ type: 'error', message: friendlyError(e, 'delete') });
        } finally {
            setDeletingLead(false);
        }
    };

    const openDeleteLeadConfirm = () => {
        setConfirmModal({
            title: 'Excluir lead?',
            description: 'Esta ação não pode ser desfeita. Todos os dados do lead serão removidos.',
            confirmLabel: 'Excluir',
            danger: true,
            onConfirm: deleteLeadExecute,
        });
    };

    function formatWhatsAppNumber(phone) {
        const digits = String(phone || '').replace(/\D/g, '');
        if (digits.startsWith('55') && digits.length >= 12) return digits;
        if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
        return digits;
    }

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
                onToast: (t) => addToast(t)
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
                await refreshTimeline();
            } catch (err) {
                console.error('Erro ao registrar evento WhatsApp', err);
            }
        } finally {
            setSendingWhatsapp(false);
        }
    };

    const handleWhatsAppPrimary = () => void sendTemplateKey('dashboard_contact');

    const handleWhatsAppBlank = async () => {
        const cleanPhone = formatWhatsAppNumber(lead.phone);
        window.open(`https://wa.me/${cleanPhone}`, '_blank');
        try {
            await addLeadEvent({
                academyId,
                leadId: id,
                type: 'message',
                text: 'Mensagem WhatsApp iniciada (sem template)',
                createdBy: userId || 'user',
                permissionContext: permCtx
            });
            await updateLead(id, { lastWhatsappActivityAt: new Date().toISOString() });
            await refreshTimeline();
        } catch (err) {
            console.error('Erro ao registrar evento WhatsApp', err);
        }
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
            addToast({ type: 'success', message: 'Nota adicionada.' });
            await refreshTimeline();
        } catch (e) {
            addToast({ type: 'error', message: friendlyError(e, 'save') });
        } finally {
            setAddingNote(false);
        }
    };
    const addNoteQuick = async (text) => {
        if (!text) return;
        await addLeadEvent({
            academyId,
            leadId: id,
            type: 'note',
            text: String(text).slice(0, 1000),
            createdBy: userId || 'user',
            permissionContext: permCtx
        });
        await updateLead(id, { lastNoteAt: new Date().toISOString() });
        await refreshTimeline();
    };

    const handleTogglePin = async (ev) => {
        const isCurrentlyPinned = Boolean(ev.is_pinned);
        // Se for fixar, validar limite de 3
        if (!isCurrentlyPinned) {
            const pinnedCount = timelineEvents.filter(e => e.is_pinned).length;
            if (pinnedCount >= 3) {
                addToast({ type: 'warning', message: 'Limite de 3 notas fixadas atingido.' });
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
        } catch (e) {
            setTimelineEvents(oldEvents); // Rollback
            addToast({ type: 'error', message: 'Erro ao pinar nota.' });
        }
    };

    const handleLabelsChange = async (newIds) => {
        try {
            await updateLead(id, { label_ids: newIds });
            addToast({ type: 'success', message: 'Etiquetas atualizadas.' });
        } catch {
            addToast({ type: 'error', message: friendlyError(null, 'save') });
        }
    };

    const statusStyle = STATUS_CONFIG[lead.status] || STATUS_CONFIG[LEAD_STATUS.NEW];
    const contactType = String(lead.contact_type || '').trim() || (lead.status === LEAD_STATUS.CONVERTED ? 'student' : 'lead');

    const studentsPlural = uiLabels.students || 'Alunos';
    const studentSingularLabel =
        studentsPlural.toLowerCase().endsWith('s') && studentsPlural.length > 1
            ? studentsPlural.slice(0, -1)
            : studentsPlural;
    const profilePageTitle = lead.status === LEAD_STATUS.CONVERTED ? studentSingularLabel : 'Perfil';

    const formatYmdLocal = (ymd) => {
        if (!ymd || String(ymd).length < 10) return null;
        try {
            return new Date(`${String(ymd).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
        } catch {
            return null;
        }
    };

    return (
        <div className={`lead-profile-container ${timelineOpen ? 'timeline-open' : 'timeline-closed'}`}>
            <div className="lead-profile-left-col">
                <div className="left-col-header">
                    <button type="button" className="icon-btn" onClick={() => navigate(-1)}>
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex gap-2" style={{ marginLeft: 'auto' }}>
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

                <div className="left-col-content">
                    {/* Lead Header */}
                    <div className="profile-main-header">
                        {!editing ? (
                            <div className="profile-id-info">
                                <h1 className="profile-name">{lead.name}</h1>
                                {lead.phone && (
                                    <div className="profile-phone">
                                        <Phone size={12} />
                                        <span>{lead.phone}</span>
                                    </div>
                                )}
                            </div>
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
                                                    <input
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
                                        <div className="flex-col gap-1">
                                            <span className="info-mini-label" style={{ alignSelf: 'flex-start' }}>Data de nascimento</span>
                                            <input
                                                className="form-input-sm"
                                                type="date"
                                                value={form.birthDate}
                                                onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
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
                        <div className="flex items-center gap-2 flex-wrap mb-3">
                            <span className={`contact-type-badge ${contactType === 'student' ? 'student' : 'lead'}`}>
                                {contactType === 'student' ? 'Aluno' : 'Lead'}
                            </span>
                            <span className="status-tag" style={{ background: statusStyle.bg, color: statusStyle.color }}>
                                {lead.status}
                            </span>
                        </div>
                        
                        {!editing && (
                            <div className="flex flex-col gap-2">
                                <div className="info-mini-row">
                                    <span className="info-mini-label">Etapa:</span>
                                    <span className="info-mini-value">{lead.pipelineStage || '—'}</span>
                                </div>
                                <div className="info-mini-row">
                                    <span className="info-mini-label">Origem:</span>
                                    <span className="info-mini-value">{lead.origin || '—'}</span>
                                </div>
                            </div>
                        )}

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
                        <div className="flex gap-2 items-center" style={{ position: 'relative' }}>
                            <button
                                type="button"
                                className="comm-btn-primary"
                                disabled={!String(lead.phone || '').replace(/\D/g, '').length || sendingWhatsapp}
                                onClick={() => handleWhatsAppPrimary()}
                            >
                                <MessageCircle size={16} /> {sendingWhatsapp ? 'Enviando…' : 'WhatsApp'}
                            </button>
                            <button
                                type="button"
                                className="comm-btn-dropdown"
                                disabled={!String(lead.phone || '').replace(/\D/g, '').length || sendingWhatsapp}
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setTemplateMenuOpen((o) => !o);
                                }}
                            >
                                <ChevronDown size={18} />
                            </button>

                            {templateMenuOpen && (
                                <div className="comm-dropdown-menu">
                                    {Object.entries(waCtx.templates)
                                        .filter(([, text]) => typeof text === 'string' && String(text).trim())
                                        .map(([key]) => (
                                            <button
                                                key={key}
                                                type="button"
                                                className="comm-dropdown-item"
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
                            </div>
                        ) : (
                            <p className="text-muted text-xs">Sem aula experimental agendada.</p>
                        )}
                    </div>

                    {/* Próximos Passos */}
                    <div className="profile-section">
                        <h3 className="section-title">Próximos Passos</h3>
                        <div className="flex-col gap-2">
                            <button 
                                type="button" 
                                className="btn-next-step" 
                                onClick={() => void handleUpdateStatus(LEAD_STATUS.SCHEDULED)}
                                disabled={updatingStatus}
                            >
                                <Calendar size={14} /> Agendar nova data
                            </button>
                            
                            {lead.status !== LEAD_STATUS.CONVERTED && (
                                <button
                                    type="button"
                                    className="btn-next-step highlight"
                                    onClick={handleMatricularClick}
                                    disabled={updatingStatus}
                                >
                                    <UserCheck size={14} /> Matricular
                                </button>
                            )}
                            {lead.status !== LEAD_STATUS.LOST && (
                                <button
                                    type="button"
                                    className="btn-next-step danger"
                                    onClick={handleMarkLost}
                                >
                                    <AlertTriangle size={14} /> Marcar como perdido
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Mais Ações */}
                    <div className="profile-section">
                        <h3 className="section-title">Mais Ações</h3>
                        <button 
                            type="button" 
                            className="btn-delete-lead" 
                            onClick={openDeleteLeadConfirm}
                            disabled={deletingLead}
                        >
                            <Trash2 size={14} /> Excluir lead
                        </button>
                    </div>

                    {/* Dados Adicionais (Preservados do original, mas agora em lista) */}
                    {!editing && (
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
                </div>

                <div className="left-col-footer">
                    <button type="button" className="btn-toggle-timeline" onClick={() => setTimelineOpen(prev => !prev)}>
                        {timelineOpen ? <ArrowLeft size={16} /> : <span style={{ order: 2 }}><ArrowRight size={16} /></span>}
                        {timelineOpen ? '← Fechar linha do tempo' : 'Ver linha do tempo →'}
                    </button>
                </div>
            </div>

            <div className={`lead-profile-right-panel ${timelineOpen ? 'open' : 'closed'}`}>
                <div className="timeline-header">
                    <h2 className="timeline-title">Linha do tempo</h2>
                    <div className="filter-strip">
                        <button type="button" className={`filter-pill${eventTypeFilter === 'all' ? ' active' : ''}`} onClick={() => setEventTypeFilter('all')}>Todos</button>
                        <button type="button" className={`filter-pill${eventTypeFilter === 'message' ? ' active' : ''}`} onClick={() => setEventTypeFilter('message')}>Mensagens</button>
                        <button type="button" className={`filter-pill${eventTypeFilter === 'schedule' ? ' active' : ''}`} onClick={() => setEventTypeFilter('schedule')}>Agendamentos</button>
                        <button type="button" className={`filter-pill${eventTypeFilter === 'stage_change' ? ' active' : ''}`} onClick={() => setEventTypeFilter('stage_change')}>Mudanças</button>
                        <button type="button" className={`filter-pill${eventTypeFilter === 'pipeline_change' ? ' active' : ''}`} onClick={() => setEventTypeFilter('pipeline_change')}>Pipeline</button>
                        <button type="button" className={`filter-pill${eventTypeFilter === 'note' ? ' active' : ''}`} onClick={() => setEventTypeFilter('note')}>Notas</button>
                        <button type="button" className={`filter-pill${eventTypeFilter === 'lead_created' ? ' active' : ''}`} onClick={() => setEventTypeFilter('lead_created')}>Cadastros</button>
                        <button type="button" className={`filter-pill${eventTypeFilter === 'import' ? ' active' : ''}`} onClick={() => setEventTypeFilter('import')}>Importações</button>
                    </div>
                </div>

                <div className="timeline-input-zone">
                    <div className="note-container">
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Adicione uma observação sobre este lead..."
                            className="timeline-textarea"
                            rows={3}
                        />
                        <button 
                            type="button" 
                            className="btn-send-note" 
                            onClick={() => void addNote()} 
                            disabled={!note.trim() || addingNote}
                        >
                            <Send size={16} />
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
                        <div className="timeline-empty">Nenhum evento registrado.</div>
                    )}

                    {!timelineError && filteredTimelineEvents.length > 0 && (
                        <div className="timeline-events-list">
                            <div className="timeline-vertical-line"></div>
                            {filteredTimelineEvents.map((n, i) => {
                                const when = new Date(n.at || n.date).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
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
                                            <span className="inbox-tag">· Inbox</span>
                                        </span>
                                    );
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
            </div>

            {confirmModal && (
                <div className="dashboard-confirm-overlay" onClick={() => (confirmBusy ? undefined : setConfirmModal(null))}>
                    <div className="dashboard-confirm-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="dashboard-confirm-icon-wrap">
                            <AlertTriangle size={24} color="var(--danger)" />
                        </div>
                        <h3 className="confirm-title">{confirmModal.title}</h3>
                        <p className="confirm-desc">{confirmModal.description}</p>
                        <div className="dashboard-confirm-actions">
                            <button type="button" className="btn-outline" onClick={() => (confirmBusy ? undefined : setConfirmModal(null))} disabled={confirmBusy}>Cancelar</button>
                            <button
                                type="button"
                                className={confirmModal.danger ? 'btn-danger' : 'btn-secondary'}
                                onClick={() => void runConfirmModalAction()}
                                disabled={confirmBusy}
                            >
                                {confirmBusy ? '...' : confirmModal.confirmLabel}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <MatriculaModal
                isOpen={matriculaModalOpen}
                onClose={() => setMatriculaModalOpen(false)}
                onConfirmSimple={handleConfirmSimple}
                onConfirmFull={handleConfirmFull}
            />
            {lostModalOpen && (
                <LostReasonModal
                    leadName={lead.name || 'Lead'}
                    onCancel={() => setLostModalOpen(false)}
                    onConfirm={async (reason) => {
                        try {
                            await confirmMarkLost(reason);
                            addToast({ type: 'success', message: 'Marcado como não fechou.' });
                        } catch (e) {
                            addToast({ type: 'error', message: friendlyError(e, 'save') });
                        } finally {
                            setLostModalOpen(false);
                        }
                    }}
                />
            )}

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
                }

                /* Coluna Esquerda */
                .lead-profile-left-col {
                    width: 340px;
                    flex-shrink: 0;
                    flex-grow: 0;
                    display: flex;
                    flex-direction: column;
                    background: var(--surface);
                    border-right: 1px solid var(--border);
                    height: 100%;
                    z-index: 10;
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

                /* Seções do Perfil */
                .profile-main-header {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                    gap: 12px;
                }


                .profile-name {
                    font-size: 1.25rem;
                    font-weight: 800;
                    color: var(--text);
                    margin: 0;
                }

                .profile-phone {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    font-size: 13px;
                    color: var(--text-secondary);
                }

                .section-title {
                    font-size: 11px;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--text-muted);
                    margin: 0 0 12px;
                }

                .profile-section {
                    padding-bottom: 4px;
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
                .comm-btn-primary {
                    flex: 1;
                    height: 40px;
                    background: #25D366;
                    color: white;
                    border: none;
                    border-radius: 10px 0 0 10px;
                    font-weight: 700;
                    font-size: 13px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    cursor: pointer;
                }

                .comm-btn-dropdown {
                    width: 36px;
                    height: 40px;
                    background: #25D366;
                    color: white;
                    border: none;
                    border-left: 1px solid rgba(255,255,255,0.2);
                    border-radius: 0 10px 10px 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                }

                .comm-dropdown-menu {
                    position: absolute;
                    top: 100%;
                    left: 0;
                    right: 0;
                    background: var(--surface);
                    border: 1px solid var(--border);
                    border-radius: 10px;
                    box-shadow: var(--shadow-lg);
                    margin-top: 8px;
                    z-index: 100;
                    max-height: 200px;
                    overflow-y: auto;
                }

                .comm-dropdown-item {
                    width: 100%;
                    padding: 10px 16px;
                    text-align: left;
                    border: none;
                    background: none;
                    font-size: 13px;
                    color: var(--text);
                    cursor: pointer;
                }
                .comm-dropdown-item:hover { background: var(--surface-hover); }

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
                    background: #22C55E;
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
                    background: #EF4444;
                    color: white;
                    border: none;
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

                .btn-next-step.highlight { border-color: var(--accent); background: var(--accent-light); color: var(--accent); }
                .btn-next-step.danger { border-color: #FEE2E2; background: #FFF5F5; color: #991B1B; }

                .btn-delete-lead {
                    width: 100%;
                    padding: 10px;
                    border-radius: 10px;
                    background: #FEE2E2;
                    color: #991B1B;
                    border: none;
                    font-size: 13px;
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    cursor: pointer;
                }

                .btn-toggle-timeline {
                    width: 100%;
                    padding: 12px;
                    border-radius: 12px;
                    background: #EEEDFE;
                    color: #534AB7;
                    border: none;
                    font-weight: 700;
                    font-size: 13px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    cursor: pointer;
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
                    max-width: 480px;
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
                    border-radius: 10px;
                    background: var(--accent);
                    color: white;
                    border: none;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    box-shadow: var(--shadow);
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
                    top: 12px;
                    bottom: 0;
                    left: 4px;
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

                /* Responsividade */
                @media (max-width: 1024px) {
                    .lead-profile-left-col {
                        width: 100%;
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
                    gap: 6px;
                    overflow-x: auto;
                    padding-bottom: 8px;
                    scrollbar-width: none;
                }
                .filter-strip::-webkit-scrollbar { display: none; }

                .filter-pill {
                    padding: 6px 12px;
                    border-radius: 100px;
                    border: 1px solid var(--border);
                    background: var(--surface);
                    color: var(--text-secondary);
                    font-size: 12px;
                    font-weight: 700;
                    white-space: nowrap;
                    cursor: pointer;
                    min-height: 44px;
                    display: inline-flex;
                    align-items: center;
                    box-sizing: border-box;
                }
                .filter-pill.active {
                    background: var(--accent);
                    color: white;
                    border-color: var(--accent);
                }

                /* Confirm Modal Tweaks */
                .dashboard-confirm-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 1000;
                    background: rgba(0,0,0,0.5);
                    backdrop-filter: blur(4px);
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
