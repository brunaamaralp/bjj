import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Pencil, User, ChevronDown, MessageCircle, Send, Trash2, AlertTriangle } from 'lucide-react';
import { databases, DB_ID, ACADEMIES_COL } from '../lib/appwrite';
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

export function StudentPanel({ student, onClose, onSave, isNarrow = false }) {
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
        plan: student.plan || '',
        enrollmentDate: student.enrollmentDate || '',
        emergencyContact: student.emergencyContact || '',
        emergencyPhone: student.emergencyPhone || '',
        birthDate: student.birthDate || '',
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
    const [viewportStacked, setViewportStacked] = useState(
        () => typeof window !== 'undefined' && window.innerWidth < 1024
    );
    const stackedLayout = viewportStacked || isNarrow;

    const leadId = student.id || student.$id;

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 1023px)');
        const onChange = () => setViewportStacked(mq.matches);
        mq.addEventListener('change', onChange);
        setViewportStacked(mq.matches);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    useEffect(() => {
        setForm({
            plan: student.plan || '',
            enrollmentDate: student.enrollmentDate || '',
            emergencyContact: student.emergencyContact || '',
            emergencyPhone: student.emergencyPhone || '',
            birthDate: student.birthDate || '',
        });
        setEditingKey(null);
        setDraft('');
    }, [
        student.id,
        student.plan,
        student.enrollmentDate,
        student.emergencyContact,
        student.emergencyPhone,
        student.birthDate,
    ]);

    useEffect(() => {
        setTemplateMenuOpen(false);
    }, [leadId]);

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
        if (savingKey) return;
        const next = { ...form, [key]: draft };
        setSavingKey(key);
        try {
            await onSave(student.id, next);
            setForm(next);
            setEditingKey(null);
            setDraft('');
        } catch {
            // Feedback de erro fica a cargo do pai (ex.: toast em Students).
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
        if (sendingWhatsapp) return;
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
            onClose();
        } catch (e) {
            addToast({ type: 'error', message: friendlyError(e, 'delete') });
        } finally {
            setDeleteBusy(false);
        }
    };

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

    const phoneHasDigits = Boolean(String(student.phone || '').replace(/\D/g, '').length);
    const enrollmentYmd = student.enrollmentDate || form.enrollmentDate;
    const tempoCasa = enrollmentYmd ? calcTempoDeCasa(enrollmentYmd) : null;
    const showRightPanel = timelineOpen;
    const studentsPlural = uiLabels.students || 'Alunos';

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
                width: stackedLayout && showRightPanel ? '100%' : 320,
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
                    onClick={onClose}
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
                        background: BG_SECONDARY,
                        marginBottom: tempoCasa ? 6 : 8,
                        textAlign: 'left',
                    }}
                >
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                        Plano: {student.plan || form.plan || 'Não informado'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                        ingresso desde {formatDateBR(student.enrollmentDate || form.enrollmentDate) || '—'}
                    </div>
                </div>
                {tempoCasa ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textAlign: 'center' }}>
                        Tempo de casa: {tempoCasa}
                    </div>
                ) : null}

                <button
                    type="button"
                    disabled
                    style={{
                        width: '100%',
                        marginBottom: 22,
                        padding: '12px 14px',
                        borderRadius: 10,
                        background: BG_SECONDARY,
                        border: '0.5px dashed var(--border)',
                        color: 'var(--text-secondary)',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'not-allowed',
                        fontFamily: 'inherit',
                    }}
                >
                    + Registrar presença (em breve)
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
                maxWidth: stackedLayout ? 'none' : 480,
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
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minHeight: 200,
                            color: 'var(--text-secondary)',
                            textAlign: 'center',
                            gap: 16,
                        }}
                    >
                        <div style={{ display: 'flex', gap: 12, width: '100%', maxWidth: 320 }}>
                            <div
                                style={{
                                    flex: 1,
                                    borderRadius: 10,
                                    padding: 14,
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                }}
                            >
                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Este mês</div>
                                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>0</div>
                            </div>
                            <div
                                style={{
                                    flex: 1,
                                    borderRadius: 10,
                                    padding: 14,
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                }}
                            >
                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Total</div>
                                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>0</div>
                            </div>
                        </div>
                        <p style={{ margin: 0, fontSize: 14 }}>Registro de presença disponível em breve</p>
                    </div>
                ) : null}

                {activeTab === 'payments' ? (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minHeight: 200,
                            color: 'var(--text-secondary)',
                            fontSize: 14,
                            textAlign: 'center',
                        }}
                    >
                        Histórico de pagamentos disponível em breve
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
                height: '100%',
                minHeight: 0,
                overflow: 'hidden',
                width: '100%',
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
        </div>
    );
}
