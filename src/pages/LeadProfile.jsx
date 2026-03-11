import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLeadStore, LEAD_STATUS, LEAD_ORIGIN } from '../store/useLeadStore';
import { ArrowLeft, ArrowRight, MessageCircle, Calendar, UserCheck, Phone, Send, Clock, Copy, Check, Pencil, X, Save } from 'lucide-react';

const STATUS_CONFIG = {
    [LEAD_STATUS.NEW]: { bg: 'var(--accent-light)', color: 'var(--accent)' },
    [LEAD_STATUS.SCHEDULED]: { bg: 'var(--warning-light)', color: 'var(--warning)' },
    [LEAD_STATUS.COMPLETED]: { bg: 'var(--success-light)', color: 'var(--success)' },
    [LEAD_STATUS.MISSED]: { bg: 'var(--danger-light)', color: 'var(--danger)' },
    [LEAD_STATUS.CONVERTED]: { bg: 'var(--purple-light)', color: 'var(--purple)' },
    [LEAD_STATUS.LOST]: { bg: '#f1f5f9', color: '#64748b' },
};

const getTemplates = (lead) => {
    const name = lead.name?.split(' ')[0] || 'Aluno';
    const dateStr = lead.scheduledDate ? new Date(lead.scheduledDate + 'T00:00:00').toLocaleDateString('pt-BR') : '';
    const timeStr = lead.scheduledTime || '';

    return [
        {
            id: 'confirm',
            label: 'Confirmar Aula',
            text: `Olá ${name}! Confirmando sua aula experimental ${dateStr ? `no dia ${dateStr}` : ''}${timeStr ? ` às ${timeStr}` : ''}. Venha com roupa confortável! Qualquer dúvida, estamos à disposição.`,
        },
        {
            id: 'reminder',
            label: 'Lembrete',
            text: `Oi ${name}! Passando para lembrar da sua aula experimental ${dateStr ? `amanhã (${dateStr})` : 'amanhã'}${timeStr ? ` às ${timeStr}` : ''}. Estamos te esperando!`,
        },
        {
            id: 'post_class',
            label: 'Pós-Aula',
            text: `${name}, foi um prazer ter você na nossa academia! O que achou da aula? Temos condições especiais para matrícula essa semana. Posso te passar mais informações?`,
        },
        {
            id: 'missed',
            label: 'Não Compareceu',
            text: `Oi ${name}! Sentimos sua falta na aula experimental. Sei que imprevistos acontecem! Quer remarcar para outro dia? Estamos com horários disponíveis essa semana.`,
        },
        {
            id: 'recovery',
            label: 'Recuperação',
            text: `Olá ${name}! Tudo bem? Vi que você visitou nossa academia recentemente. Ainda tem interesse em começar no Jiu-Jitsu? Temos turmas nos horários da manhã e noite. Vou adorar ajudar!`,
        },
    ];
};

const LeadProfile = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { getLeadById, updateLead } = useLeadStore();
    const lead = getLeadById(id);

    const [note, setNote] = useState('');
    const [eventTypeFilter, setEventTypeFilter] = useState('all');
    const [showTemplates, setShowTemplates] = useState(false);
    const [copiedId, setCopiedId] = useState(null);
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({
        name: '',
        phone: '',
        type: 'Adulto',
        origin: '',
        parentName: '',
        age: '',
        isFirstExperience: 'Sim',
        belt: '',
        borrowedKimono: '',
        borrowedShirt: '',
        scheduledDate: '',
        scheduledTime: ''
    });

    if (!lead) return (
        <div className="container" style={{ paddingTop: 40, textAlign: 'center' }}>
            <p className="text-light">Lead não encontrado.</p>
            <button className="btn-primary mt-4" onClick={() => navigate('/')}>Voltar</button>
        </div>
    );

    const startEdit = () => {
        setForm({
            name: lead.name || '',
            phone: lead.phone || '',
            type: lead.type || 'Adulto',
            origin: lead.origin || '',
            parentName: lead.parentName || '',
            age: lead.age || '',
            isFirstExperience: lead.isFirstExperience || 'Sim',
            belt: lead.belt || '',
            borrowedKimono: lead.borrowedKimono || '',
            borrowedShirt: lead.borrowedShirt || '',
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

    const handleSave = async () => {
        const payload = { ...form };
        await updateLead(id, payload);
        setEditing(false);
    };

    const handleUpdateStatus = (newStatus) => {
        const existing = Array.isArray(lead.notes) ? lead.notes : [];
        const event = { type: 'stage_change', from: lead.status || '', to: newStatus, at: new Date().toISOString(), by: 'user' };
        const newNotes = [...existing, event];
        updateLead(id, { status: newStatus, notes: newNotes });
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

    const handleCall = () => {
        window.open(`tel:${lead.phone.replace(/\D/g, '')}`, '_self');
        try {
            const existing = Array.isArray(lead.notes) ? lead.notes : [];
            const event = { type: 'call', text: 'Ligação iniciada', at: new Date().toISOString(), by: 'user' };
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

    const handleCopyTemplate = (template) => {
        navigator.clipboard.writeText(template.text).then(() => {
            setCopiedId(template.id);
            setTimeout(() => setCopiedId(null), 2000);
        });
    };

    const statusStyle = STATUS_CONFIG[lead.status] || STATUS_CONFIG[LEAD_STATUS.NEW];
    const templates = getTemplates(lead);

    return (
        <div className="container" style={{ paddingTop: 20, paddingBottom: 30 }}>
            <div className="flex items-center gap-4">
                <button className="icon-btn" onClick={() => navigate(-1)}><ArrowLeft size={22} /></button>
                <h2>Perfil</h2>
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

            {/* Header Card */}
            <div className="card mt-4 animate-in profile-header">
                <div className="flex justify-between items-start">
                    <div>
                        {!editing ? (
                            <>
                                <h2 style={{ fontSize: '1.3rem', color: 'var(--text)' }}>{lead.name}</h2>
                                <p className="text-small mt-1">
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
                                    {form.isFirstExperience === 'Não' && (
                                        <div className="form-group" style={{ flex: 1 }}>
                                            <label>Faixa</label>
                                            <select name="belt" value={form.belt} onChange={onChange} className="form-input">
                                                <option value="">Selecione</option>
                                                <option value="Branca">Branca</option>
                                                <option value="Cinza">Cinza</option>
                                                <option value="Amarela">Amarela</option>
                                                <option value="Laranja">Laranja</option>
                                                <option value="Verde">Verde</option>
                                                <option value="Azul">Azul</option>
                                                <option value="Roxa">Roxa</option>
                                                <option value="Marrom">Marrom</option>
                                                <option value="Preta">Preta</option>
                                            </select>
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-2 mt-2">
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label>Tam. Kimono</label>
                                        <input name="borrowedKimono" value={form.borrowedKimono} onChange={onChange} className="form-input" />
                                    </div>
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label>Tam. Camiseta</label>
                                        <input name="borrowedShirt" value={form.borrowedShirt} onChange={onChange} className="form-input" />
                                    </div>
                                </div>
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
                                    {lead.isFirstExperience === 'Sim' ? 'Iniciante' : `Já treina (${lead.belt})`}
                                </span>
                                {lead.borrowedKimono && (
                                    <span className="info-badge" style={{ background: 'var(--warning-light)', color: 'var(--warning)' }}>
                                        Kimono: {lead.borrowedKimono}
                                    </span>
                                )}
                                {lead.borrowedShirt && (
                                    <span className="info-badge" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                                        Camiseta: {lead.borrowedShirt}
                                    </span>
                                )}
                            </div>
                        ) : null}

                        {!editing ? (
                            lead.scheduledDate && (
                                <div className="flex items-center gap-2 mt-3">
                                    <Clock size={14} color="var(--accent)" />
                                    <span className="text-small" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                                        {lead.scheduledTime || '--:--'} — {new Date(lead.scheduledDate + 'T00:00:00').toLocaleDateString('pt-BR')}
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

                {/* Contact Actions */}
                <div className="flex gap-2 mt-4">
                    <button className="contact-btn whatsapp" onClick={() => handleWhatsApp()}>
                        <MessageCircle size={18} /> WhatsApp
                    </button>
                    <button className="contact-btn call" onClick={handleCall}>
                        <Phone size={18} /> Ligar
                    </button>
                </div>
            </div>

            {/* WhatsApp Templates */}
            <div className="mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
                <button
                    className={`templates-toggle ${showTemplates ? 'active' : ''}`}
                    onClick={() => setShowTemplates(!showTemplates)}
                >
                    <MessageCircle size={16} color="#25D366" />
                    <span>Mensagens Prontas</span>
                    <span className="toggle-arrow">{showTemplates ? '▲' : '▼'}</span>
                </button>

                {showTemplates && (
                    <div className="templates-list mt-2 flex-col gap-2 animate-in">
                        {templates.map(t => (
                            <div key={t.id} className="card template-card">
                                <div className="flex justify-between items-center mb-2">
                                    <strong className="template-label">{t.label}</strong>
                                    <div className="flex gap-2">
                                        <button className="tpl-btn" onClick={() => handleCopyTemplate(t)} title="Copiar">
                                            {copiedId === t.id ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
                                        </button>
                                        <button className="tpl-btn tpl-send" onClick={() => handleWhatsApp(t.text)} title="Enviar">
                                            <Send size={14} />
                                        </button>
                                    </div>
                                </div>
                                <p className="template-text">{t.text}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Action Buttons */}
            <div className="mt-4 animate-in" style={{ animationDelay: '0.1s' }}>
                <h3 className="mb-2">Próximos Passos</h3>
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

            {/* Timeline */}
            <div className="mt-6 animate-in" style={{ animationDelay: '0.2s' }}>
                <h3 className="mb-2">Linha do tempo</h3>
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
                    <button className="tpl-chip" onClick={() => addNoteQuick('Ligação realizada')}>Ligação realizada</button>
                    <button className="tpl-chip" onClick={() => addNoteQuick('Proposta enviada')}>Proposta enviada</button>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                    <button className={`filter-chip${eventTypeFilter === 'all' ? ' active' : ''}`} onClick={() => setEventTypeFilter('all')}>Todos</button>
                    <button className={`filter-chip${eventTypeFilter === 'message' ? ' active' : ''}`} onClick={() => setEventTypeFilter('message')}>Mensagens</button>
                    <button className={`filter-chip${eventTypeFilter === 'call' ? ' active' : ''}`} onClick={() => setEventTypeFilter('call')}>Ligações</button>
                    <button className={`filter-chip${eventTypeFilter === 'schedule' ? ' active' : ''}`} onClick={() => setEventTypeFilter('schedule')}>Agendamentos</button>
                    <button className={`filter-chip${eventTypeFilter === 'stage_change' ? ' active' : ''}`} onClick={() => setEventTypeFilter('stage_change')}>Mudanças</button>
                    <button className={`filter-chip${eventTypeFilter === 'note' ? ' active' : ''}`} onClick={() => setEventTypeFilter('note')}>Notas</button>
                    <button className={`filter-chip${eventTypeFilter === 'import' ? ' active' : ''}`} onClick={() => setEventTypeFilter('import')}>Importações</button>
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
                        else if (n.type === 'import') { icon = <Copy size={16} color="var(--text-secondary)" />; tag = 'Importação'; label = `Importado (${n.source || 'Import'})`; }
                        else { icon = <Check size={16} color="var(--text-secondary)" />; tag = 'Nota'; }
                        return (
                            <div key={i} className="card note-item event-row">
                                <div className="event-icon">{icon}</div>
                                <div className="event-content">
                                    <div className="event-head">
                                        <span className="event-tag">{tag}</span>
                                        <span className="event-time">{when}</span>
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
        .contact-btn.call { background: var(--border-light); color: var(--text); }
        .contact-btn.call:hover { background: var(--border); }
        
        .templates-toggle {
          width: 100%; background: var(--surface); border: 1.5px solid var(--border);
          border-radius: var(--radius-sm); padding: 12px 16px; min-height: auto;
          font-size: 0.9rem; font-weight: 600; color: var(--text);
          display: flex; align-items: center; gap: 10px; justify-content: flex-start;
        }
        .templates-toggle.active { border-color: #25D366; background: rgba(37, 211, 102, 0.05); }
        .toggle-arrow { margin-left: auto; font-size: 0.7rem; color: var(--text-muted); }
        .template-card { padding: 14px; border-left: 3px solid #25D366; }
        .template-label { font-size: 0.82rem; }
        .template-text { font-size: 0.82rem; color: var(--text-secondary); line-height: 1.5; }
        .tpl-btn {
          width: 32px; height: 32px; border-radius: 50%; background: var(--border-light);
          padding: 0; min-height: auto; color: var(--text-muted);
          display: flex; align-items: center; justify-content: center;
        }
        .tpl-btn:hover { background: var(--border); }
        .tpl-send { background: #25D366; color: white; }
        .tpl-send:hover { filter: brightness(1.1); background: #25D366; }

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
        .filter-chip {
          min-height: 28px; padding: 6px 12px; border-radius: var(--radius-full);
          background: var(--surface); border: 1px solid var(--border);
          font-size: 0.78rem; font-weight: 700; color: var(--text-secondary);
        }
        .filter-chip.active { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
        .event-row { display: flex; gap: 10px; align-items: flex-start; }
        .event-icon { width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; }
        .event-content { flex: 1; }
        .event-head { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
        .event-tag { font-size: 0.7rem; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.03em; }
        .event-time { font-size: 0.72rem; color: var(--text-muted); }
        .event-text { font-size: 0.9rem; color: var(--text); margin-top: 2px; }
      `}} />
        </div>
    );
};

export default LeadProfile;
