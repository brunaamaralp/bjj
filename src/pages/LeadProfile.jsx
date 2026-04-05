import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLeadStore, LEAD_STATUS, LEAD_ORIGIN } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { ArrowLeft, ArrowRight, ChevronRight, MessageCircle, Calendar, UserCheck, Phone, Send, Clock, Copy, Check, Pencil, X, Save, AlertTriangle, Trash2 } from 'lucide-react';
import { databases, DB_ID, ACADEMIES_COL } from '../lib/appwrite';

function expectedPipelineStageForStatus(status) {
    switch (status) {
        case LEAD_STATUS.SCHEDULED:
            return 'Aula experimental';
        case LEAD_STATUS.COMPLETED:
            return 'Matriculado';
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
    const { getLeadById, updateLead, deleteLead } = useLeadStore();
    const addToast = useUiStore((s) => s.addToast);
    const academyId = useLeadStore((s) => s.academyId);
    const lead = getLeadById(id);

    const [note, setNote] = useState('');
    const [eventTypeFilter, setEventTypeFilter] = useState('all');
    const [editing, setEditing] = useState(false);
    const [customQuestions, setCustomQuestions] = useState([]);
    const [deletingLead, setDeletingLead] = useState(false);
    const [form, setForm] = useState({
        name: '',
        phone: '',
        type: 'Adulto',
        origin: '',
        parentName: '',
        age: '',
        isFirstExperience: 'Sim',
        borrowedKimono: '',
        borrowedShirt: '',
        customAnswers: {},
        scheduledDate: '',
        scheduledTime: ''
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
            .then(doc => {
                try {
                    const normalized = normalizeQuestions(doc.customLeadQuestions);
                    setCustomQuestions(normalized.questions);
                    if (normalized.migrated) {
                        databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
                            customLeadQuestions: JSON.stringify(normalized.questions)
                        }).catch(() => void 0);
                    }
                } catch { setCustomQuestions([]); }
            })
            .catch(() => setCustomQuestions([]));
    }, [academyId]);

    if (!lead) return (
        <div className="container" style={{ paddingTop: 40, textAlign: 'center' }}>
            <p className="text-light">Lead não encontrado.</p>
            <button className="btn-primary mt-4" onClick={() => navigate('/')}>Voltar</button>
        </div>
    );

    const startEdit = () => {
        const existing = (lead.customAnswers && typeof lead.customAnswers === 'object') ? lead.customAnswers : {};
        const preserved = Object.fromEntries(Object.entries(existing).filter(([k]) => isUuidLike(k)));
        const migratedAnswers = { ...preserved };
        for (const q of (customQuestions || [])) {
            const id = String(q?.id || '').trim();
            const label = String(q?.label || '').trim();
            if (!id || !label) continue;
            const value = (existing[id] ?? existing[label] ?? migratedAnswers[id] ?? '');
            migratedAnswers[id] = value;
        }
        setForm({
            name: lead.name || '',
            phone: lead.phone || '',
            type: lead.type || 'Adulto',
            origin: lead.origin || '',
            parentName: lead.parentName || '',
            age: lead.age || '',
            isFirstExperience: lead.isFirstExperience || 'Sim',
            borrowedKimono: lead.borrowedKimono || '',
            borrowedShirt: lead.borrowedShirt || '',
            customAnswers: migratedAnswers,
            scheduledDate: lead.scheduledDate || '',
            scheduledTime: lead.scheduledTime || ''
        });
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

    const statusPipelineMismatch = useMemo(() => {
        const exp = expectedPipelineStageForStatus(lead.status);
        if (exp == null) return null;
        const cur = String(lead.pipelineStage || '').trim();
        if (!cur || cur === exp) return null;
        return { expected: exp, current: cur };
    }, [lead.status, lead.pipelineStage]);

    const handleSave = async () => {
        const payload = { ...form };
        const hasDate = String(payload.scheduledDate || '').trim().length > 0;
        if (hasDate && lead.status !== LEAD_STATUS.CONVERTED) {
            payload.status = LEAD_STATUS.SCHEDULED;
            payload.pipelineStage = 'Aula experimental';
        }
        const afterExp = expectedPipelineStageForStatus(payload.status ?? lead.status);
        const stageAfter = String(payload.pipelineStage ?? lead.pipelineStage ?? '').trim();
        if (afterExp && stageAfter && stageAfter !== afterExp) {
            const ok = window.confirm(
                `O status (${payload.status ?? lead.status}) costuma ir com a etapa “${afterExp}”, mas a etapa atual é “${stageAfter}”. Isso pode deixar o card na coluna errada no funil. Deseja salvar mesmo assim?`
            );
            if (!ok) return;
        }
        await updateLead(id, payload);
        setEditing(false);
    };

    const handleUpdateStatus = (newStatus) => {
        const existing = Array.isArray(lead.notes) ? lead.notes : [];
        const event = { type: 'stage_change', from: lead.status || '', to: newStatus, at: new Date().toISOString(), by: 'user' };
        const newNotes = [...existing, event];
        const pipelineStage =
            newStatus === LEAD_STATUS.SCHEDULED ? 'Aula experimental'
                : newStatus === LEAD_STATUS.COMPLETED ? 'Matriculado'
                    : newStatus === LEAD_STATUS.CONVERTED ? 'Matriculado'
                        : newStatus === LEAD_STATUS.MISSED ? LEAD_STATUS.MISSED
                            : newStatus === LEAD_STATUS.LOST ? LEAD_STATUS.LOST
                                : undefined;

        updateLead(id, {
            status: newStatus,
            ...(pipelineStage ? { pipelineStage } : {}),
            notes: newNotes
        });
    };
    const handleMarkLost = () => {
        const ok = window.confirm(`Marcar "${lead?.name || 'Sem nome'}" como Não fechou?`);
        if (!ok) return;
        const existing = Array.isArray(lead.notes) ? lead.notes : [];
        const event = { type: 'stage_change', from: lead.status || '', to: LEAD_STATUS.LOST, at: new Date().toISOString(), by: 'user' };
        const newNotes = [...existing, event];
        updateLead(id, { status: LEAD_STATUS.LOST, scheduledDate: '', scheduledTime: '', pipelineStage: LEAD_STATUS.LOST, notes: newNotes });
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

    const handleWhatsApp = (customMsg) => {
        const cleanPhone = lead.phone.replace(/\D/g, '');
        const url = customMsg
            ? `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(customMsg)}`
            : `https://wa.me/55${cleanPhone}`;
        window.open(url, '_blank');
        try {
            const existing = Array.isArray(lead.notes) ? lead.notes : [];
            const event = { type: 'message', channel: 'whatsapp', text: customMsg ? 'Mensagem WhatsApp enviada (template)' : 'Mensagem WhatsApp iniciada', at: new Date().toISOString(), by: 'user' };
            const newNotes = [...existing, event];
            updateLead(id, { notes: newNotes });
        } catch { /* noop */ }
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

    return (
        <div className="container" style={{ paddingTop: 20, paddingBottom: 30 }}>
            <div className="flex items-center gap-4">
                <button className="icon-btn" onClick={() => navigate(-1)}><ArrowLeft size={22} /></button>
                <h2 className="navi-page-title" style={{ fontSize: 'clamp(1.15rem, 2.2vw, 1.35rem)', margin: 0 }}>Perfil</h2>
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
                    className="card mt-4 animate-in"
                    style={{
                        padding: '12px 14px',
                        background: 'var(--warning-light)',
                        border: '1px solid var(--warning)',
                        fontSize: '0.85rem',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.45,
                    }}
                >
                    <strong style={{ color: 'var(--warning)' }}>Status e etapa do funil</strong>
                    {' — '}
                    O sistema espera a etapa <strong>{statusPipelineMismatch.expected}</strong> para o status atual, mas este lead está em{' '}
                    <strong>{statusPipelineMismatch.current}</strong>. No funil, o card pode aparecer na coluna errada. Ajuste com os botões de status abaixo ou use{' '}
                    <strong>Mover de etapa</strong> no Pipeline.
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
                                    {lead.type} • {lead.origin}
                                    {lead.age && ` • ${lead.age} anos`}
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
                                <div className="flex gap-2 mt-2">
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label>Tam. Camiseta</label>
                                        <input name="borrowedShirt" value={form.borrowedShirt} onChange={onChange} className="form-input" />
                                    </div>
                                </div>
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
                                {lead.borrowedShirt && (
                                    <span className="info-badge" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                                        Camiseta: {lead.borrowedShirt}
                                    </span>
                                )}
                            </div>
                        ) : null}
                        {!editing && customQuestions.length > 0 && (
                            <div className="flex-col gap-2 mt-2">
                                {customQuestions.map((q) => {
                                    const ans = (lead.customAnswers || {})[q?.id] ?? (lead.customAnswers || {})[q?.label];
                                    return (
                                        <div key={q?.id || q?.label} className="info-row">
                                            <span className="info-row-label">{q?.label || '-'}</span>
                                            <span className="info-row-value">{ans || '-'}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {!editing ? (
                            lead.scheduledDate && (
                                <div className="flex items-center gap-2 mt-3">
                                    <Clock size={14} color="var(--v500)" />
                                    <span>
                                        <span className="navi-mono-time" style={{ fontWeight: 600 }}>{lead.scheduledTime || '--:--'}</span>
                                        <span className="navi-mono-date" style={{ marginLeft: 6 }}>
                                            {new Date(lead.scheduledDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                                        </span>
                                    </span>
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
                    <span className="status-tag" style={{ background: statusStyle.bg, color: statusStyle.color }}>
                        {lead.status}
                    </span>
                </div>

                {/* Contact */}
                <div className="flex gap-2 mt-4">
                    <button type="button" className="contact-btn whatsapp contact-btn-full" onClick={() => handleWhatsApp()}>
                        <MessageCircle size={18} /> WhatsApp
                    </button>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-4 animate-in" style={{ animationDelay: '0.1s' }}>
                <h3 className="navi-section-heading mb-2">Próximos Passos</h3>
                <div className="action-grid">
                    <button className="action-btn" onClick={() => handleUpdateStatus(LEAD_STATUS.SCHEDULED)}>
                        <Calendar size={22} color="var(--warning)" />
                        <span>Agendar</span>
                    </button>
                    <button className="action-btn" onClick={() => handleUpdateStatus(LEAD_STATUS.COMPLETED)}>
                        <UserCheck size={22} color="var(--success)" />
                        <span>Presença</span>
                    </button>
                    <button className="action-btn action-highlight" onClick={() => handleUpdateStatus(LEAD_STATUS.CONVERTED)}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                        </svg>
                        <span>Matricular</span>
                    </button>
                </div>
            </div>

            {!editing && (
                <div className="mt-4 animate-in" style={{ animationDelay: '0.12s' }}>
                    <h3 className="navi-section-heading mb-2">Mais Ações</h3>
                    <div className="more-actions">
                        <button className="btn-outline danger-btn" onClick={handleMarkLost}>
                            <AlertTriangle size={16} /> Não fechou
                        </button>
                        <button className="btn-outline danger-btn" onClick={handleDeleteLead} disabled={deletingLead}>
                            <Trash2 size={16} /> {deletingLead ? 'Excluindo...' : 'Excluir lead'}
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

            <style dangerouslySetInnerHTML={{
                __html: `
        .profile-header { border-top: 4px solid var(--accent); }
        .status-tag { 
          padding: 5px 12px; border-radius: var(--radius-full); 
          font-size: 0.72rem; font-weight: 700; text-transform: uppercase; 
          letter-spacing: 0.03em; white-space: nowrap;
        }
        .info-badge {
          font-size: 0.7rem; font-weight: 700; background: var(--border-light);
          padding: 3px 10px; border-radius: var(--radius-full); color: var(--text-secondary);
        }
        .contact-btn { 
          flex: 1; height: 48px; border-radius: var(--radius-sm); 
          font-weight: 700; font-size: 0.85rem; gap: 6px;
        }
        .contact-btn.whatsapp { background: #25D366; color: white; }
        .contact-btn.whatsapp:hover { filter: brightness(1.05); }
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

        .more-actions { display: flex; gap: 10px; }
        .more-actions button { flex: 1; }
        .danger-btn { border-color: var(--danger); color: var(--danger); }
        .danger-btn:hover { background: var(--danger-light); border-color: var(--danger); color: var(--danger); }
        
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
