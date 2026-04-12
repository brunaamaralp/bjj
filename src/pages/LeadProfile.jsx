import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLeadStore, LEAD_STATUS, LEAD_ORIGIN } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { ArrowLeft, ArrowRight, ChevronRight, MessageCircle, Calendar, UserCheck, Phone, Send, Clock, Copy, Check, Pencil, X, Save, AlertTriangle, Trash2 } from 'lucide-react';
import { databases, DB_ID, ACADEMIES_COL } from '../lib/appwrite';
import { DEFAULT_WHATSAPP_TEMPLATES, WHATSAPP_TEMPLATE_LABELS } from '../../lib/whatsappTemplateDefaults.js';
import { sendWhatsappTemplateOutbound } from '../lib/outboundWhatsappTemplate.js';
import { LostReasonModal } from '../components/LostReasonModal';
import MatriculaModal from '../components/MatriculaModal';
import { PIPELINE_WAITING_DECISION_STAGE } from '../constants/pipeline.js';

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

const LeadProfile = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const lead = useLeadStore((s) => s.leads.find((l) => l.id === id));
    const updateLead = useLeadStore((s) => s.updateLead);
    const deleteLead = useLeadStore((s) => s.deleteLead);
    const addToast = useUiStore((s) => s.addToast);
    const academyId = useLeadStore((s) => s.academyId);
    const uiLabels = useLeadStore((s) => s.labels);

    const [note, setNote] = useState('');
    const [eventTypeFilter, setEventTypeFilter] = useState('all');
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
    const [form, setForm] = useState({
        name: '',
        phone: '',
        type: 'Adulto',
        origin: '',
        parentName: '',
        age: '',
        birthDate: '',
        isFirstExperience: 'Sim',
        borrowedKimono: '',
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
            phone: src.phone || '',
            type: src.type || 'Adulto',
            origin: src.origin || '',
            parentName: src.parentName || '',
            age: src.age || '',
            birthDate: normalizeDateToISO(src.birthDate),
            isFirstExperience: src.isFirstExperience || 'Sim',
            borrowedKimono: src.borrowedKimono || '',
            customAnswers: migratedAnswers,
            scheduledDate: src.scheduledDate || '',
            scheduledTime: src.scheduledTime || '',
            plan: src.plan || '',
            enrollmentDate: normalizeDateToISO(src.enrollmentDate),
            emergencyContact: src.emergencyContact || '',
            emergencyPhone: src.emergencyPhone || '',
        });
    };

    if (!lead) return (
        <div className="container" style={{ paddingTop: 40, textAlign: 'center' }}>
            <p className="text-light">Lead não encontrado.</p>
            <button className="btn-primary mt-4" onClick={() => navigate('/')}>Voltar</button>
        </div>
    );

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
        const id = String(q?.id || q || '').trim();
        if (!id) return;
        setForm((f) => ({ ...f, customAnswers: { ...(f.customAnswers || {}), [id]: value } }));
    };

    const handleSave = async () => {
        const payload = { ...form };
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
            const ok = window.confirm(
                `O status (${payload.status ?? lead.status}) costuma ir com a etapa “${afterExp}”, mas a etapa atual é “${stageAfter}”. Isso pode deixar o card na coluna errada no funil. Deseja salvar mesmo assim?`
            );
            if (!ok) return;
        }
        try {
            await updateLead(id, payload);
            setEditing(false);
            addToast({ type: 'success', message: 'Dados salvos com sucesso.' });
        } catch (e) {
            addToast({ type: 'error', message: e?.message || 'Erro ao salvar os dados.' });
        }
    };

    const handleUpdateStatus = async (newStatus) => {
        const existing = Array.isArray(lead.notes) ? lead.notes : [];
        const event = { type: 'stage_change', from: lead.status || '', to: newStatus, at: new Date().toISOString(), by: 'user' };
        const newNotes = [...existing, event];
        const pipelineStage =
            newStatus === LEAD_STATUS.SCHEDULED ? 'Aula experimental'
                : newStatus === LEAD_STATUS.COMPLETED ? PIPELINE_WAITING_DECISION_STAGE
                    : newStatus === LEAD_STATUS.CONVERTED ? 'Matriculado'
                        : newStatus === LEAD_STATUS.MISSED ? LEAD_STATUS.MISSED
                            : newStatus === LEAD_STATUS.LOST ? LEAD_STATUS.LOST
                                : undefined;

        try {
            await updateLead(id, {
                status: newStatus,
                ...(newStatus === LEAD_STATUS.CONVERTED ? { contact_type: 'student' } : {}),
                ...(pipelineStage ? { pipelineStage } : {}),
                notes: newNotes
            });
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
            addToast({ type: 'error', message: e?.message || 'Não foi possível atualizar o status.' });
            throw e;
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
        handleUpdateStatus(LEAD_STATUS.CONVERTED);
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
        const existing = Array.isArray(lead.notes) ? lead.notes : [];
        const event = { type: 'stage_change', from: lead.status || '', to: LEAD_STATUS.LOST, at: new Date().toISOString(), by: 'user' };
        const newNotes = [...existing, event];
        await updateLead(id, {
            status: LEAD_STATUS.LOST,
            scheduledDate: '',
            scheduledTime: '',
            pipelineStage: LEAD_STATUS.LOST,
            lostReason,
            notes: newNotes,
        });
    };
    const handleDeleteLead = async () => {
        const ok = window.confirm(`Excluir o lead "${lead?.name || 'Sem nome'}"? Essa ação não pode ser desfeita.`);
        if (!ok) return;
        if (deletingLead) return;
        setDeletingLead(true);
        try {
            await deleteLead(id);
            addToast({ type: 'success', message: 'Lead excluído com sucesso.' });
            navigate(-1);
        } catch (e) {
            addToast({ type: 'error', message: e?.message || 'Não foi possível excluir o lead.' });
        } finally {
            setDeletingLead(false);
        }
    };

    function formatWhatsAppNumber(phone) {
        const digits = String(phone || '').replace(/\D/g, '');
        if (digits.startsWith('55') && digits.length >= 12) return digits;
        if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
        return digits;
    }

    const sendTemplateKey = async (key) => {
        setTemplateMenuOpen(false);
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
            const existing = Array.isArray(lead.notes) ? lead.notes : [];
            const label = WHATSAPP_TEMPLATE_LABELS[key] || key;
            const event = {
                type: 'message',
                channel: 'whatsapp',
                text: `WhatsApp: template “${label}”`,
                at: new Date().toISOString(),
                by: 'user'
            };
            updateLead(id, { notes: [...existing, event] });
        } catch {
            void 0;
        }
    };

    const handleWhatsAppPrimary = () => void sendTemplateKey('dashboard_contact');

    const handleWhatsAppBlank = () => {
        const cleanPhone = formatWhatsAppNumber(lead.phone);
        window.open(`https://wa.me/${cleanPhone}`, '_blank');
        try {
            const existing = Array.isArray(lead.notes) ? lead.notes : [];
            const event = {
                type: 'message',
                channel: 'whatsapp',
                text: 'Mensagem WhatsApp iniciada (sem template)',
                at: new Date().toISOString(),
                by: 'user'
            };
            updateLead(id, { notes: [...existing, event] });
        } catch {
            void 0;
        }
    };

    const addNote = () => {
        if (!note.trim()) return;
        const newNotes = [...(lead.notes || []), { type: 'note', text: note, at: new Date().toISOString(), by: 'user' }];
        updateLead(id, { notes: newNotes });
        setNote('');
    };
    const addNoteQuick = (text) => {
        if (!text) return;
        const newNotes = [...(lead.notes || []), { type: 'note', text, at: new Date().toISOString(), by: 'user' }];
        updateLead(id, { notes: newNotes });
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
        <div className="container" style={{ paddingTop: 20, paddingBottom: 30 }}>
            <div className="lead-profile-inner">
                <div className="flex items-center gap-4">
                <button className="icon-btn" onClick={() => navigate(-1)}><ArrowLeft size={22} /></button>
                <h2 className="navi-page-title" style={{ fontSize: 'clamp(1.15rem, 2.2vw, 1.35rem)', margin: 0 }}>{profilePageTitle}</h2>
                {!editing ? (
                    <button className="btn-outline" style={{ marginLeft: 'auto' }} onClick={startEdit}>
                        <Pencil size={16} color="var(--text-secondary)" /> Editar
                    </button>
                ) : (
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                        <button className="btn-outline" onClick={cancelEdit}><X size={16} /> Cancelar</button>
                        <button className="btn-secondary" onClick={handleSave}><Save size={16} /> Salvar</button>
                    </div>
                )}
                </div>

            {statusPipelineMismatch && !editing ? (
                <div
                    className="mt-4 animate-in"
                    style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'var(--surface)',
                        border: '1px solid #F59E0B33',
                        marginBottom: 12,
                    }}
                >
                    <span style={{ color: '#F59E0B', fontSize: 14 }} aria-hidden>⚠️</span>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                        Status e etapa inconsistentes. Ajuste com os botões abaixo ou use <strong>Mover de etapa</strong> no Pipeline.
                    </p>
                </div>
            ) : null}

            {/* Header Card */}
            <div className="card mt-4 animate-in profile-header">
                <div className="flex justify-between items-start">
                    <div>
                        {!editing ? (
                            <>
                                <h2 className="navi-page-title" style={{ fontSize: 'clamp(1.2rem, 2.6vw, 1.5rem)', margin: 0 }}>{lead.name}</h2>
                                <p className="navi-subtitle" style={{ marginTop: 4 }}>
                                    {[
                                        lead.type,
                                        lead.origin,
                                        lead.age ? `${lead.age} anos` : null,
                                        lead.birthDate ? `Nasc. ${lead.birthDate}` : null,
                                    ]
                                        .filter((p) => p != null && String(p).trim())
                                        .join(' • ') || '—'}
                                </p>
                            </>
                        ) : (
                            <div className="flex-col gap-3">
                                <div className="form-group">
                                    <label>Nome</label>
                                    <input name="name" value={form.name} onChange={onChange} className="form-input" />
                                </div>
                                <div className="form-group mt-2">
                                    <label>Telefone</label>
                                    <input name="phone" value={form.phone} onChange={onChange} className="form-input" type="tel" />
                                </div>
                                <div className="flex gap-2 mt-2">
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label>Perfil</label>
                                        <select name="type" value={form.type} onChange={onChange} className="form-input">
                                            <option value="Criança">Criança</option>
                                            <option value="Juniores">Juniores</option>
                                            <option value="Adulto">Adulto</option>
                                        </select>
                                    </div>
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label>Origem</label>
                                        <select name="origin" value={form.origin} onChange={onChange} className="form-input">
                                            {LEAD_ORIGIN.map(o => <option key={o} value={o}>{o}</option>)}
                                        </select>
                                    </div>
                                </div>
                                {(form.type === 'Criança' || form.type === 'Juniores') && (
                                    <div className="flex gap-2 mt-2">
                                        <div className="form-group" style={{ flex: 1 }}>
                                            <label>Responsável</label>
                                            <input name="parentName" value={form.parentName} onChange={onChange} className="form-input" />
                                        </div>
                                        <div className="form-group" style={{ flex: 1 }}>
                                            <label>Idade</label>
                                            <input name="age" value={form.age} onChange={onChange} type="number" className="form-input" />
                                        </div>
                                    </div>
                                )}
                                <div className="flex gap-4 mt-2">
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label>Primeira experiência?</label>
                                        <select name="isFirstExperience" value={form.isFirstExperience} onChange={onChange} className="form-input">
                                            <option value="Sim">Sim</option>
                                            <option value="Não">Não</option>
                                        </select>
                                    </div>
                                    {/* Campo de faixa removido; pode ser configurado como pergunta personalizada */}
                                </div>
                                <div className="form-group mt-2">
                                    <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>Data de nascimento</label>
                                    <input
                                        type="date"
                                        name="birthDate"
                                        value={form.birthDate || ''}
                                        onChange={onChange}
                                        className="form-input"
                                        style={{ padding: '8px 12px', borderRadius: 8 }}
                                    />
                                </div>
                                {lead.status === LEAD_STATUS.CONVERTED && (
                                    <div className="lead-student-fields mt-3">
                                        <p className="lead-student-fields-title">Dados do aluno</p>
                                        <div className="form-group">
                                            <label>Plano contratado</label>
                                            <input name="plan" value={form.plan} onChange={onChange} className="form-input" placeholder="Ex.: Mensal, Anual" />
                                        </div>
                                        <div className="form-group mt-2">
                                            <label>Data de ingresso</label>
                                            <input name="enrollmentDate" value={form.enrollmentDate} onChange={onChange} type="date" className="form-input" />
                                        </div>
                                        <div className="form-group mt-2">
                                            <label>Contato de emergência</label>
                                            <input name="emergencyContact" value={form.emergencyContact} onChange={onChange} className="form-input" placeholder="Nome do contato" />
                                        </div>
                                        <div className="form-group mt-2">
                                            <label>Telefone de emergência</label>
                                            <input name="emergencyPhone" value={form.emergencyPhone} onChange={onChange} type="tel" className="form-input" placeholder="Celular" />
                                        </div>
                                    </div>
                                )}
                                {customQuestions.length > 0 && (
                                    <div className="flex-col gap-2 mt-2">
                                        {customQuestions.map((q) => {
                                            const val = (form.customAnswers || {})[q?.id] ?? (form.customAnswers || {})[q?.label] ?? '';
                                            if ((q?.type || 'text') === 'boolean') {
                                                return (
                                                    <div key={q?.id || q?.label} className="form-group">
                                                        <label>{q?.label || '-'}</label>
                                                        <select
                                                            className="form-input"
                                                            value={String(val || '')}
                                                            onChange={(e) => onChangeCustom(q, e.target.value)}
                                                        >
                                                            <option value="">-</option>
                                                            <option value="Sim">Sim</option>
                                                            <option value="Não">Não</option>
                                                        </select>
                                                    </div>
                                                );
                                            }
                                            if ((q?.type || 'text') === 'number') {
                                                return (
                                                    <div key={q?.id || q?.label} className="form-group">
                                                        <label>{q?.label || '-'}</label>
                                                        <input
                                                            className="form-input"
                                                            type="number"
                                                            value={val || ''}
                                                            onChange={(e) => onChangeCustom(q, e.target.value)}
                                                        />
                                                    </div>
                                                );
                                            }
                                            if ((q?.type || 'text') === 'select') {
                                                const opts = Array.isArray(q?.options) ? q.options : [];
                                                return (
                                                    <div key={q?.id || q?.label} className="form-group">
                                                        <label>{q?.label || '-'}</label>
                                                        <select
                                                            className="form-input"
                                                            value={val || ''}
                                                            onChange={(e) => onChangeCustom(q, e.target.value)}
                                                        >
                                                            <option value="">-</option>
                                                            {opts.map((o, i) => <option key={`${q?.id || q?.label}-${i}`} value={o}>{o}</option>)}
                                                        </select>
                                                    </div>
                                                );
                                            }
                                            return (
                                                <div key={q?.id || q?.label} className="form-group">
                                                    <label>{q?.label || '-'}</label>
                                                    <input
                                                        className="form-input"
                                                        value={val || ''}
                                                        onChange={(e) => onChangeCustom(q, e.target.value)}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {(lead.parentName) && (
                            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                                Responsável: <strong>{lead.parentName}</strong>
                            </p>
                        )}

                        {!editing ? (
                            <div className="flex flex-wrap gap-2 mt-2">
                                <span className="info-badge">
                                    {lead.isFirstExperience === 'Sim' ? 'Iniciante' : 'Já treina'}
                                </span>
                            </div>
                        ) : null}
                        {!editing && customQuestions.length > 0 && (
                            <div className="flex-col gap-2 mt-2">
                                {customQuestions.map((q) => {
                                    const ans = (lead.customAnswers || {})[q?.id] ?? (lead.customAnswers || {})[q?.label];
                                    if (!hasLeadDisplayValue(ans)) return null;
                                    return (
                                        <div key={q?.id || q?.label} className="info-row">
                                            <span className="info-row-label">{q?.label || '-'}</span>
                                            <span className="info-row-value">{String(ans).trim()}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {!editing && lead.status === LEAD_STATUS.CONVERTED && (
                            <div className="lead-student-view mt-3">
                                <p className="lead-student-fields-title">Dados do aluno</p>
                                <div className="flex-col gap-2">
                                    {hasLeadDisplayValue(lead.plan) ? (
                                        <div className="info-row">
                                            <span className="info-row-label">Plano</span>
                                            <span className="info-row-value">{lead.plan}</span>
                                        </div>
                                    ) : null}
                                    {formatYmdLocal(lead.enrollmentDate) ? (
                                        <div className="info-row">
                                            <span className="info-row-label">Ingresso</span>
                                            <span className="info-row-value">{formatYmdLocal(lead.enrollmentDate)}</span>
                                        </div>
                                    ) : null}
                                    {hasLeadDisplayValue(lead.emergencyContact) ? (
                                        <div className="info-row">
                                            <span className="info-row-label">Emergência</span>
                                            <span className="info-row-value">{lead.emergencyContact}</span>
                                        </div>
                                    ) : null}
                                    {hasLeadDisplayValue(lead.emergencyPhone) ? (
                                        <div className="info-row">
                                            <span className="info-row-label">Tel. emergência</span>
                                            <span className="info-row-value">{lead.emergencyPhone}</span>
                                        </div>
                                    ) : null}
                                    {!hasLeadDisplayValue(lead.plan) &&
                                    !formatYmdLocal(lead.enrollmentDate) &&
                                    !hasLeadDisplayValue(lead.emergencyContact) &&
                                    !hasLeadDisplayValue(lead.emergencyPhone) ? (
                                        <p className="text-small" style={{ color: 'var(--text-muted)', margin: 0 }}>
                                            Nenhum dado extra cadastrado. Toque em <strong>Editar</strong> para incluir plano, ingresso e contato de emergência.
                                        </p>
                                    ) : null}
                                </div>
                            </div>
                        )}

                        {!editing ? (
                            (lead.scheduledDate || lead.status === LEAD_STATUS.SCHEDULED) && (
                                <div className="flex flex-wrap items-center gap-2 mt-3">
                                    {lead.scheduledDate ? (
                                        <>
                                            <Clock size={14} color="var(--v500)" />
                                            <span>
                                                <span className="navi-mono-time" style={{ fontWeight: 600 }}>{lead.scheduledTime || '--:--'}</span>
                                                <span className="navi-mono-date" style={{ marginLeft: 6 }}>
                                                    {new Date(lead.scheduledDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                                                </span>
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <Calendar size={14} color="var(--warning)" />
                                            <span className="text-small" style={{ color: 'var(--text-secondary)', flex: '1 1 200px' }}>
                                                Experimental marcada no funil — defina <strong>data e horário</strong> (botão Editar ou abaixo).
                                            </span>
                                            <button type="button" className="btn-outline" style={{ fontSize: '0.75rem', padding: '6px 12px', minHeight: 34 }} onClick={startEdit}>
                                                Definir data
                                            </button>
                                        </>
                                    )}
                                </div>
                            )
                        ) : (
                            <div className="flex gap-2 mt-3">
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label>Data</label>
                                    <input name="scheduledDate" value={form.scheduledDate} onChange={onChange} type="date" className="form-input" />
                                </div>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label>Horário</label>
                                    <input name="scheduledTime" value={form.scheduledTime} onChange={onChange} type="time" className="form-input" />
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={`contact-type-badge ${contactType === 'student' ? 'student' : 'lead'}`}>
                            {contactType === 'student' ? 'Aluno' : 'Lead'}
                        </span>
                        <span className="status-tag" style={{ background: statusStyle.bg, color: statusStyle.color }}>
                            {lead.status}
                        </span>
                    </div>
                </div>
                {!editing && lead.status === LEAD_STATUS.LOST && lead.lostReason ? (
                    <p className="text-xs mt-2" style={{ color: 'var(--text-muted)', lineHeight: 1.45 }}>
                        <strong style={{ color: 'var(--text-secondary)' }}>Motivo da perda:</strong> {lead.lostReason}
                    </p>
                ) : null}

                {/* Contact */}
                <div className="flex flex-col gap-2 mt-4" style={{ position: 'relative' }}>
                    <div className="flex gap-0" style={{ alignItems: 'stretch' }}>
                        <button
                            type="button"
                            className="contact-btn whatsapp contact-btn-full"
                            style={{ borderRadius: '8px 0 0 8px', flex: 1 }}
                            disabled={!String(lead.phone || '').replace(/\D/g, '').length}
                            title={!lead.phone ? 'Cadastre um telefone' : 'Enviar template “Contato (Dashboard)” ou abrir no WhatsApp'}
                            onClick={() => handleWhatsAppPrimary()}
                        >
                            <MessageCircle size={18} color="currentColor" /> WhatsApp
                        </button>
                        <button
                            type="button"
                            className="contact-btn whatsapp"
                            style={{
                                borderRadius: '0 8px 8px 0',
                                minWidth: 44,
                                paddingLeft: 10,
                                paddingRight: 10,
                                borderLeft: '1px solid rgba(255,255,255,0.35)',
                                flexShrink: 0
                            }}
                            disabled={!String(lead.phone || '').replace(/\D/g, '').length}
                            aria-expanded={templateMenuOpen}
                            aria-label="Escolher outro template"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setTemplateMenuOpen((o) => !o);
                            }}
                        >
                            ▾
                        </button>
                    </div>
                    {templateMenuOpen && (
                        <div
                            style={{
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                                background: 'var(--surface)',
                                boxShadow: 'var(--shadow)',
                                maxHeight: 260,
                                overflowY: 'auto',
                                zIndex: 20
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {Object.entries(waCtx.templates)
                                .filter(([, text]) => typeof text === 'string' && String(text).trim())
                                .map(([key]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        style={{
                                            display: 'block',
                                            width: '100%',
                                            textAlign: 'left',
                                            padding: '10px 14px',
                                            border: 'none',
                                            background: 'none',
                                            font: 'inherit',
                                            cursor: 'pointer',
                                            color: 'var(--text)'
                                        }}
                                        onClick={() => void sendTemplateKey(key)}
                                    >
                                        {WHATSAPP_TEMPLATE_LABELS[key] || key}
                                    </button>
                                ))}
                        </div>
                    )}
                    <button
                        type="button"
                        className="btn-outline"
                        style={{ fontSize: '0.8rem', alignSelf: 'flex-start' }}
                        disabled={!String(lead.phone || '').replace(/\D/g, '').length}
                        onClick={() => handleWhatsAppBlank()}
                    >
                        Abrir WhatsApp em branco
                    </button>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-4 animate-in" style={{ animationDelay: '0.1s' }}>
                <h3 className="navi-section-heading mb-2">Próximos Passos</h3>
                <div className="action-grid">
                    {lead.status !== LEAD_STATUS.CONVERTED && (
                        <>
                            <button className="action-btn" onClick={() => handleUpdateStatus(LEAD_STATUS.SCHEDULED)}>
                                <Calendar size={22} color="var(--warning)" />
                                <span>Agendar</span>
                            </button>
                            <button className="action-btn" onClick={() => handleUpdateStatus(LEAD_STATUS.COMPLETED)}>
                                <UserCheck size={22} color="var(--success)" />
                                <span>Presença</span>
                            </button>
                            <button className="action-btn action-highlight" onClick={handleMatricularClick}>
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                                </svg>
                                <span>Matricular</span>
                            </button>
                        </>
                    )}
                </div>
            </div>

            {!editing && (
                <div className="mt-4 animate-in" style={{ animationDelay: '0.12s' }}>
                    <h3 className="navi-section-heading mb-2">Mais Ações</h3>
                    <div className="more-actions">
                        <button
                            type="button"
                            onClick={handleMarkLost}
                            style={{
                                padding: '8px 16px',
                                borderRadius: 8,
                                border: 'none',
                                background: '#FEE2E2',
                                color: '#991B1B',
                                fontSize: 13,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                flex: 1,
                                fontFamily: 'inherit',
                                fontWeight: 600,
                            }}
                        >
                            <AlertTriangle size={16} strokeWidth={2} /> Não fechou
                        </button>
                        <button
                            type="button"
                            onClick={handleDeleteLead}
                            disabled={deletingLead}
                            style={{
                                padding: '8px 16px',
                                borderRadius: 8,
                                border: 'none',
                                background: '#FEE2E2',
                                color: '#991B1B',
                                fontSize: 13,
                                cursor: deletingLead ? 'not-allowed' : 'pointer',
                                opacity: deletingLead ? 0.65 : 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                flex: 1,
                                fontFamily: 'inherit',
                                fontWeight: 600,
                            }}
                        >
                            <Trash2 size={16} strokeWidth={2} /> {deletingLead ? 'Excluindo...' : 'Excluir lead'}
                        </button>
                    </div>
                </div>
            )}

            {/* Timeline */}
            <div className="mt-6 animate-in" style={{ animationDelay: '0.2s' }}>
                <h3 className="navi-section-heading mb-2">Linha do tempo</h3>
                <div className="note-input-group">
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Ex: Pai liga depois das 18h..."
                        className="note-area"
                        rows={3}
                    />
                    <button className="btn-primary note-send-btn" onClick={addNote} disabled={!note.trim()}>
                        <Send size={16} /> Salvar
                    </button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                    <button className="tpl-chip" onClick={() => addNoteQuick('WhatsApp enviado')}>WhatsApp enviado</button>
                    <button className="tpl-chip" onClick={() => addNoteQuick('Proposta enviada')}>Proposta enviada</button>
                </div>
                <div className="filter-strip mt-3" style={{ maxWidth: '100%' }}>
                    <button type="button" className={`filter-pill${eventTypeFilter === 'all' ? ' active' : ''}`} onClick={() => setEventTypeFilter('all')}>Todos</button>
                    <button type="button" className={`filter-pill${eventTypeFilter === 'message' ? ' active' : ''}`} onClick={() => setEventTypeFilter('message')}>Mensagens</button>
                    <button type="button" className={`filter-pill${eventTypeFilter === 'call' ? ' active' : ''}`} onClick={() => setEventTypeFilter('call')}>Ligações</button>
                    <button type="button" className={`filter-pill${eventTypeFilter === 'schedule' ? ' active' : ''}`} onClick={() => setEventTypeFilter('schedule')}>Agendamentos</button>
                    <button type="button" className={`filter-pill${eventTypeFilter === 'stage_change' ? ' active' : ''}`} onClick={() => setEventTypeFilter('stage_change')}>Mudanças</button>
                    <button type="button" className={`filter-pill${eventTypeFilter === 'pipeline_change' ? ' active' : ''}`} onClick={() => setEventTypeFilter('pipeline_change')}>Pipeline</button>
                    <button type="button" className={`filter-pill${eventTypeFilter === 'note' ? ' active' : ''}`} onClick={() => setEventTypeFilter('note')}>Notas</button>
                    <button type="button" className={`filter-pill${eventTypeFilter === 'import' ? ' active' : ''}`} onClick={() => setEventTypeFilter('import')}>Importações</button>
                </div>

                <div className="flex-col gap-2 mt-3">
                    {([...((lead.notes || []))]
                      .filter(ev => eventTypeFilter === 'all' ? true : (ev.type || 'note') === eventTypeFilter)
                      .sort((a,b) => {
                        const ta = new Date(a.at || a.date || 0).getTime();
                        const tb = new Date(b.at || b.date || 0).getTime();
                        return tb - ta;
                      })).map((n, i) => {
                        const when = new Date(n.at || n.date).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
                        let icon = null;
                        let tag = '';
                        let label = n.text || '';
                        if ((n.type || 'note') === 'message') { icon = <MessageCircle size={16} color="#25D366" />; tag = 'Mensagem'; label = n.text || 'Mensagem WhatsApp'; }
                        else if (n.type === 'call') { icon = <Phone size={16} color="var(--accent)" />; tag = 'Ligação'; label = n.text || 'Ligação'; }
                        else if (n.type === 'schedule') { icon = <Calendar size={16} color="var(--warning)" />; tag = 'Agendamento'; label = `Agendado para ${n.date} ${n.time || ''}`.trim(); }
                        else if (n.type === 'stage_change') { icon = <ArrowRight size={16} color="var(--text-secondary)" />; tag = 'Mudança'; label = `Mudou de ${n.from} para ${n.to}`; }
                        else if (n.type === 'pipeline_change') { icon = <ChevronRight size={16} color="var(--text-secondary)" />; tag = 'Pipeline'; label = `Pipeline: de ${n.from} para ${n.to}`; }
                        else if (n.type === 'import') { icon = <Copy size={16} color="var(--text-secondary)" />; tag = 'Importação'; label = `Importado (${n.source || 'Import'})`; }
                        else { icon = <Check size={16} color="var(--text-secondary)" />; tag = 'Nota'; }
                        return (
                            <div key={i} className="card note-item event-row">
                                <div className="event-icon">{icon}</div>
                                <div className="event-content">
                                    <div className="event-head">
                                        <span className="event-tag">{tag}</span>
                                        <span className="event-time navi-mono-date">{when}</span>
                                    </div>
                                    <p className="event-text">{label}</p>
                                </div>
                            </div>
                        );
                      })}
                </div>
            </div>

            <MatriculaModal
                isOpen={matriculaModalOpen}
                onClose={() => setMatriculaModalOpen(false)}
                onConfirmSimple={handleConfirmSimple}
                onConfirmFull={handleConfirmFull}
            />
            {lostModalOpen ? (
                <LostReasonModal
                    leadName={lead.name || 'Lead'}
                    onCancel={() => setLostModalOpen(false)}
                    onConfirm={async (reason) => {
                        try {
                            await confirmMarkLost(reason);
                            addToast({ type: 'success', message: 'Marcado como não fechou.' });
                        } catch (e) {
                            addToast({ type: 'error', message: e?.message || 'Não foi possível atualizar.' });
                        } finally {
                            setLostModalOpen(false);
                        }
                    }}
                />
            ) : null}
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
        .lead-profile-inner {
          max-width: min(100%, 42rem);
          margin-left: auto;
          margin-right: auto;
        }
        .profile-header { border-top: 4px solid var(--accent); }
        .status-tag { 
          padding: 5px 12px; border-radius: var(--radius-full); 
          font-size: 0.72rem; font-weight: 700; text-transform: uppercase; 
          letter-spacing: 0.03em; white-space: nowrap;
        }
        .contact-type-badge {
          padding: 5px 12px; border-radius: var(--radius-full);
          font-size: 0.72rem; font-weight: 800; white-space: nowrap;
        }
        .contact-type-badge.lead {
          background: rgba(245, 158, 11, 0.16);
          color: #b45309;
        }
        .contact-type-badge.student {
          background: rgba(34, 197, 94, 0.14);
          color: #15803d;
        }
        .info-badge {
          font-size: 0.7rem; font-weight: 700; background: var(--border-light);
          padding: 3px 10px; border-radius: var(--radius-full); color: var(--text-secondary);
        }
        .lead-student-fields-title {
          font-size: 0.7rem; font-weight: 800; text-transform: uppercase;
          letter-spacing: 0.06em; color: var(--text-muted); margin: 0 0 10px;
        }
        .lead-student-fields {
          padding: 14px 16px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
          background: var(--purple-light);
          border-left: 3px solid var(--purple);
        }
        .lead-student-view {
          padding: 14px 16px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
          background: var(--surface-hover);
        }
        .profile-header .info-row {
          display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
          padding: 6px 0; border-bottom: 1px solid var(--border-light);
        }
        .profile-header .info-row:last-child { border-bottom: none; }
        .profile-header .info-row-label {
          font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;
          letter-spacing: 0.04em; flex-shrink: 0;
        }
        .profile-header .info-row-value {
          font-size: 0.9rem; color: var(--text); font-weight: 500; text-align: right;
        }
        .contact-btn { 
          flex: 1; height: 48px; border-radius: var(--radius-sm); 
          font-weight: 700; font-size: 0.85rem; gap: 6px;
        }
        .contact-btn.whatsapp { background: var(--purple); color: #fff; border-radius: 12px; }
        .contact-btn.whatsapp:hover { filter: brightness(1.06); }
        .contact-btn.whatsapp:disabled { opacity: 0.5; cursor: not-allowed; }
        .contact-btn-full { width: 100%; max-width: 100%; flex: 1 1 100%; justify-content: center; }

        .action-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
        .action-btn { 
          background: var(--surface); border: 2px solid var(--border-light);
          flex-direction: column; padding: 16px 8px; height: auto;
          min-height: 85px; gap: 8px; border-radius: var(--radius);
        }
        .action-btn span { font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); }
        .action-btn:active { transform: scale(0.95); }
        .action-highlight { border-color: var(--accent); background: var(--accent-light); }
        .action-highlight span { color: var(--accent); }

        .more-actions { display: flex; gap: 10px; flex-wrap: wrap; }
        .more-actions button { flex: 1; min-width: min(100%, 140px); }
        
        .note-input-group { display: flex; flex-direction: column; gap: 8px; }
        .note-area { 
          width: 100%; border-radius: var(--radius-sm); border: 1.5px solid var(--border); 
          padding: 14px; font-family: inherit; font-size: 0.9rem; resize: none;
          outline: none; transition: var(--transition); background: var(--surface); color: var(--text);
        }
        .note-area:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-light); }
        .note-send-btn { min-height: 42px; align-self: flex-end; padding: 0 20px; }
        .note-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .note-item { border-left: 3px solid var(--border); padding: 12px 16px; }
        .tpl-chip {
          min-height: 28px; padding: 6px 12px; border-radius: var(--radius-full);
          background: var(--surface); border: 1px solid var(--border);
          font-size: 0.78rem; font-weight: 700; color: var(--text-secondary);
        }
        .tpl-chip:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
        .event-row { display: flex; gap: 10px; align-items: flex-start; }
        .event-icon { width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; }
        .event-content { flex: 1; }
        .event-head { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
        .event-tag { font-size: 0.7rem; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.03em; }
        .event-time { font-size: 11px; color: var(--faint); }
        .event-text { font-size: 0.9rem; color: var(--text); margin-top: 2px; }
      `}} />
        </div>
    );
};

export default LeadProfile;
