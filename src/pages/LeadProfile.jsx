import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import { ArrowLeft, MessageCircle, Calendar, UserCheck, Phone, Send, Clock, Copy, Check } from 'lucide-react';

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
            label: '✅ Confirmar Aula',
            text: `Olá ${name}! 😊 Confirmando sua aula experimental ${dateStr ? `no dia ${dateStr}` : ''}${timeStr ? ` às ${timeStr}` : ''}. Venha com roupa confortável! Qualquer dúvida, estamos à disposição. 🥋`,
        },
        {
            id: 'reminder',
            label: '⏰ Lembrete',
            text: `Oi ${name}! Passando para lembrar da sua aula experimental ${dateStr ? `amanhã (${dateStr})` : 'amanhã'}${timeStr ? ` às ${timeStr}` : ''}. Estamos te esperando! 💪`,
        },
        {
            id: 'post_class',
            label: '🎉 Pós-Aula',
            text: `${name}, foi um prazer ter você na nossa academia! 🥋 O que achou da aula? Temos condições especiais para matrícula essa semana. Posso te passar mais informações?`,
        },
        {
            id: 'missed',
            label: '😢 Não Compareceu',
            text: `Oi ${name}! Sentimos sua falta na aula experimental. 😕 Sei que imprevistos acontecem! Quer remarcar para outro dia? Estamos com horários disponíveis essa semana. 🥋`,
        },
        {
            id: 'recovery',
            label: '🔄 Recuperação',
            text: `Olá ${name}! Tudo bem? 😊 Vi que você visitou nossa academia recentemente. Ainda tem interesse em começar no Jiu-Jitsu? Temos turmas nos horários da manhã e noite. Vou adorar ajudar! 💪`,
        },
    ];
};

const LeadProfile = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { getLeadById, updateLead } = useLeadStore();
    const lead = getLeadById(id);

    const [note, setNote] = useState('');
    const [showTemplates, setShowTemplates] = useState(false);
    const [copiedId, setCopiedId] = useState(null);

    if (!lead) return (
        <div className="container" style={{ paddingTop: 40, textAlign: 'center' }}>
            <p className="text-light">Lead não encontrado.</p>
            <button className="btn-primary mt-4" onClick={() => navigate('/')}>Voltar</button>
        </div>
    );

    const handleUpdateStatus = (newStatus) => {
        updateLead(id, { status: newStatus });
    };

    const handleWhatsApp = (customMsg) => {
        const cleanPhone = lead.phone.replace(/\D/g, '');
        const url = customMsg
            ? `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(customMsg)}`
            : `https://wa.me/55${cleanPhone}`;
        window.open(url, '_blank');
    };

    const handleCall = () => {
        window.open(`tel:${lead.phone.replace(/\D/g, '')}`, '_self');
    };

    const addNote = () => {
        if (!note.trim()) return;
        const newNotes = [...(lead.notes || []), { text: note, date: new Date().toISOString() }];
        updateLead(id, { notes: newNotes });
        setNote('');
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
            </div>

            {/* Header Card */}
            <div className="card mt-4 animate-in profile-header">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 style={{ fontSize: '1.3rem', color: 'var(--text)' }}>{lead.name}</h2>
                        <p className="text-small mt-1">
                            {lead.type} • {lead.origin}
                            {lead.age && ` • ${lead.age} anos`}
                        </p>

                        {(lead.parentName) && (
                            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                                👤 Responsável: <strong>{lead.parentName}</strong>
                            </p>
                        )}

                        <div className="flex flex-wrap gap-2 mt-2">
                            <span className="info-badge">
                                {lead.isFirstExperience === 'Sim' ? '🔰 Iniciante' : `🥋 Já treina (${lead.belt})`}
                            </span>
                            {lead.borrowedKimono && (
                                <span className="info-badge" style={{ background: 'var(--warning-light)', color: 'var(--warning)' }}>
                                    👘 Kimono: {lead.borrowedKimono}
                                </span>
                            )}
                            {lead.borrowedShirt && (
                                <span className="info-badge" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                                    👕 Camiseta: {lead.borrowedShirt}
                                </span>
                            )}
                        </div>

                        {lead.scheduledDate && (
                            <div className="flex items-center gap-2 mt-3">
                                <Clock size={14} color="var(--accent)" />
                                <span className="text-small" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                                    {lead.scheduledTime || '--:--'} — {new Date(lead.scheduledDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                                </span>
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

            {/* Notes */}
            <div className="mt-6 animate-in" style={{ animationDelay: '0.2s' }}>
                <h3 className="mb-2">Observações</h3>
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

                <div className="flex-col gap-2 mt-3">
                    {lead.notes?.map((n, i) => (
                        <div key={i} className="card note-item">
                            <p style={{ fontSize: '0.9rem' }}>{n.text}</p>
                            <span className="text-xs text-light mt-1" style={{ display: 'block' }}>
                                {new Date(n.date).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    ))}
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
      `}} />
        </div>
    );
};

export default LeadProfile;
