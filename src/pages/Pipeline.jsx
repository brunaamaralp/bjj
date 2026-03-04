import React, { useState, useEffect } from 'react';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import { useNavigate } from 'react-router-dom';
import { Calendar, Phone, Upload, MessageCircle } from 'lucide-react';
import ImportSheet from '../components/ImportSheet';
import ExportButton from '../components/ExportButton';
import { databases, DB_ID, ACADEMIES_COL } from '../lib/appwrite';

const WEEK = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const normalizeDayToken = (t) => t.toLowerCase().trim().replace(/á/g, 'a').slice(0, 3);
const dayTokenToIndex = (tok) => {
    const n = normalizeDayToken(tok);
    return WEEK.findIndex(x => x === n);
};
const parseQuickItems = (arr) => {
    return arr.map(entry => {
        const raw = String(entry).trim();
        if (!raw) return { days: null, label: '', value: '' };
        const firstSpace = raw.indexOf(' ');
        let days = null;
        let timePart = raw;
        if (firstSpace > 0) {
            const possibleDays = raw.slice(0, firstSpace);
            const rest = raw.slice(firstSpace + 1).trim();
            const looksLikeDays = /^[A-Za-zçÇáÁéÉíÍóÓúÚãÃõÕêÊôÔàÀ,\s]+$/.test(possibleDays);
            if (looksLikeDays && rest) {
                const tokens = possibleDays.split(',').map(t => t.trim()).filter(Boolean);
                const idxs = tokens.map(dayTokenToIndex).filter(i => i >= 0);
                if (idxs.length > 0) {
                    days = Array.from(new Set(idxs));
                    timePart = rest;
                }
            }
        }
        const label = timePart;
        return { days, label, value: timePart };
    }).filter(it => it.label);
};
const parseTimeToMinutes = (t) => {
    const parts = t.split(':');
    const hh = parseInt(parts[0], 10);
    const mm = parseInt(parts[1], 10) || 0;
    if (Number.isFinite(hh) && Number.isFinite(mm)) return hh * 60 + mm;
    return Number.MAX_SAFE_INTEGER;
};
const timeStartMinutes = (timePart) => {
    const norm = timePart.replace('–', '-');
    const start = norm.split('-')[0].trim();
    return parseTimeToMinutes(start);
};

const COLUMN_CONFIG = [
    { title: 'Novo', status: LEAD_STATUS.NEW, color: 'var(--accent)', bg: 'var(--accent-light)' },
    { title: 'Agendado', status: LEAD_STATUS.SCHEDULED, color: 'var(--warning)', bg: 'var(--warning-light)' },
    { title: 'Não Compareceu', status: LEAD_STATUS.MISSED, color: 'var(--danger)', bg: 'var(--danger-light)' },
    { title: 'Compareceu', status: LEAD_STATUS.COMPLETED, color: 'var(--success)', bg: 'var(--success-light)' },
    { title: 'Matriculou', status: LEAD_STATUS.CONVERTED, color: 'var(--purple)', bg: 'var(--purple-light)' },
];

const Pipeline = () => {
    const navigate = useNavigate();
    const { leads, importLeads, updateLead } = useLeadStore();
    const academyId = useLeadStore((s) => s.academyId);
    const [showImport, setShowImport] = useState(false);
    const [quickItems, setQuickItems] = useState([]);
    const [toast, setToast] = useState('');
    const [expanded, setExpanded] = useState({});
    const [dragOver, setDragOver] = useState(null);
    const [noteOpen, setNoteOpen] = useState(false);
    const [noteLead, setNoteLead] = useState(null);
    const [noteText, setNoteText] = useState('');

    const handleImport = (rows) => {
        importLeads(rows);
    };

    useEffect(() => {
        if (!academyId) return;
        databases.getDocument(DB_ID, ACADEMIES_COL, academyId)
            .then(doc => {
                let raw = [];
                if (Array.isArray(doc.quickTimes)) raw = doc.quickTimes;
                else if (typeof doc.quickTimes === 'string' && doc.quickTimes.trim()) raw = doc.quickTimes.split(',').map(s => s.trim()).filter(Boolean);
                const parsed = parseQuickItems(raw);
                if (parsed.length > 0) setQuickItems(parsed);
                else setQuickItems(parseQuickItems(['18:00', '19:00']));
            })
            .catch(() => {});
    }, [academyId]);

    const getDayIndex = (date) => date.getDay();
    const itemsForDay = (key) => {
        const base = new Date();
        if (key === 'tomorrow') base.setDate(base.getDate() + 1);
        const idx = getDayIndex(base);
        const list = quickItems.filter(it => !it.days || it.days.includes(idx));
        list.sort((a, b) => timeStartMinutes(a.value) - timeStartMinutes(b.value));
        return list;
    };

    const toYMD = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const handleWhatsApp = (e, lead) => {
        e.stopPropagation();
        const clean = (lead.phone || '').replace(/\D/g, '');
        const sugArr = itemsForDay('today').slice(0, 2).map(it => it.label);
        const sug = sugArr.join('/');
        const msg = `Olá ${lead.name.split(' ')[0]}, sentimos sua ausência na aula combinada. Quer reagendar? Tenho hoje às ${sug} ou amanhã nos mesmos horários.`;
        const url = `https://wa.me/55${clean}?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
    };

    const handleReschedule = async (e, lead, day, time) => {
        e.stopPropagation();
        const base = new Date();
        if (day === 'tomorrow') base.setDate(base.getDate() + 1);
        const ymd = toYMD(base);
        await updateLead(lead.id, { status: LEAD_STATUS.SCHEDULED, scheduledDate: ymd, scheduledTime: time });
        const label = day === 'tomorrow' ? 'amanhã' : 'hoje';
        setToast(`Reagendado para ${label} ${time}`);
        setTimeout(() => setToast(''), 2500);
    };
    const MAX_CHIPS = 4;
    const isExpanded = (leadId) => !!expanded[leadId];
    const toggleExpanded = (e, leadId) => {
        e.stopPropagation();
        setExpanded(prev => ({ ...prev, [leadId]: !prev[leadId] }));
    };
    const onDragStart = (e, leadId) => {
        e.dataTransfer.setData('text/plain', leadId);
    };
    const onDragOver = (e) => {
        e.preventDefault();
    };
    const onDragEnter = (status) => {
        setDragOver(status);
    };
    const onDragLeave = () => {
        setDragOver(null);
    };
    const onDrop = async (e, status) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain');
        if (!id) return;
        await updateLead(id, { status });
        setDragOver(null);
        setToast('Movido no pipeline');
        setTimeout(() => setToast(''), 2000);
    };
    const openNote = (e, lead) => {
        e.stopPropagation();
        setNoteLead(lead);
        setNoteText('');
        setNoteOpen(true);
    };
    const saveNote = async () => {
        if (!noteLead || !noteText.trim()) {
            setNoteOpen(false);
            return;
        }
        const existing = Array.isArray(noteLead.notes) ? noteLead.notes : [];
        const newNotes = [...existing, { text: noteText, date: new Date().toISOString() }];
        await updateLead(noteLead.id, { notes: newNotes });
        setNoteOpen(false);
        setToast('Observação salva');
        setTimeout(() => setToast(''), 2000);
    };

    return (
        <div className="pipeline-container">
            <div className="pipeline-header">
                <div className="container flex justify-between items-center">
                    <h2>Fluxo de Matrícula</h2>
                    <div className="flex gap-2">
                        <ExportButton leads={leads} fileName="leads-pipeline" label="Exportar" />
                        <button className="import-btn-pipe" onClick={() => setShowImport(true)}>
                            <Upload size={16} /> Importar Leads
                        </button>
                    </div>
                </div>
            </div>

            <div className="kanban-wrapper">
                {COLUMN_CONFIG.map(col => {
                    const colLeads = leads
                      .filter(l => l.status === col.status)
                      .sort((a, b) => {
                        if (col.status !== LEAD_STATUS.SCHEDULED) return 0;
                        const toDateTime = (lead) => {
                          const base = lead.scheduledDate || lead.createdAt || '';
                          if (!base) return new Date(8640000000000000);
                          const [y, m, d] = base.split('T')[0].split('-').map(Number);
                          let hh = 23, mm = 59;
                          if (lead.scheduledTime && /^\d{2}:\d{2}$/.test(lead.scheduledTime)) {
                            const [h, mi] = lead.scheduledTime.split(':').map(Number);
                            if (Number.isFinite(h) && Number.isFinite(mi)) {
                              hh = h; mm = mi;
                            }
                          }
                          return new Date(y, (m || 1) - 1, d || 1, hh, mm, 0, 0);
                        };
                        return toDateTime(a) - toDateTime(b);
                      });
                    return (
                        <div
                            key={col.status}
                            className={`kanban-column ${dragOver === col.status ? 'drop-target' : ''}`}
                            onDragOver={onDragOver}
                            onDragEnter={() => onDragEnter(col.status)}
                            onDragLeave={onDragLeave}
                            onDrop={(e) => onDrop(e, col.status)}
                        >
                            <div className="col-header">
                                <div className="flex items-center gap-2">
                                    <span className="col-dot" style={{ background: col.color }}></span>
                                    <h3>{col.title}</h3>
                                </div>
                                <span className="col-count" style={{ background: col.bg, color: col.color }}>
                                    {colLeads.length}
                                </span>
                            </div>

                            <div className="col-content">
                                {colLeads.map((lead, i) => (
                                    <div
                                        key={lead.id}
                                        className="card lead-card animate-in"
                                        style={{ animationDelay: `${0.03 * i}s` }}
                                        onClick={() => navigate(`/lead/${lead.id}`)}
                                        draggable
                                        onDragStart={(e) => onDragStart(e, lead.id)}
                                    >
                                        <div className="flex justify-between items-center">
                                            <strong style={{ fontSize: '0.92rem' }}>{lead.name}</strong>
                                            <span className="type-pill">{lead.type}</span>
                                        </div>
                                        <div className="lead-meta mt-2 flex items-center gap-2">
                                            <Phone size={12} /> {lead.phone}
                                        </div>
                                        {lead.scheduledDate && (
                                            <div className="lead-meta mt-1 flex items-center gap-2">
                                                <Calendar size={12} /> {new Date(lead.scheduledDate + 'T00:00:00').toLocaleDateString('pt-BR')} {lead.scheduledTime && `às ${lead.scheduledTime}`}
                                            </div>
                                        )}
                                        {(col.status === LEAD_STATUS.SCHEDULED || col.status === LEAD_STATUS.COMPLETED || col.status === LEAD_STATUS.MISSED) && (
                                            <div className="quick-actions mt-2">
                                                <button className="quick-btn" onClick={(e) => openNote(e, lead)}>
                                                    <MessageCircle size={14} /> Obs.
                                                </button>
                                            </div>
                                        )}
                                        {col.status === LEAD_STATUS.MISSED && (
                                            <div className="quick-actions mt-2">
                                                <button className="quick-btn whatsapp-btn" onClick={(e) => handleWhatsApp(e, lead)}>
                                                    WhatsApp
                                                </button>
                                                <div className="quick-block">
                                                    <div className="quick-label">Hoje</div>
                                                    <div className="quick-times">
                                                        {(isExpanded(lead.id) ? itemsForDay('today') : itemsForDay('today').slice(0, MAX_CHIPS)).map((it, idx) => (
                                                            <button key={`t-${lead.id}-${idx}`} className="time-chip-mini" onClick={(e) => handleReschedule(e, lead, 'today', it.value)}>Hoje {it.label}</button>
                                                        ))}
                                                        {itemsForDay('today').length > MAX_CHIPS && (
                                                            <button className="more-btn" onClick={(e) => toggleExpanded(e, lead.id)}>
                                                                {isExpanded(lead.id) ? 'Menos' : `+${itemsForDay('today').length - MAX_CHIPS}`}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="quick-block">
                                                    <div className="quick-label">Amanhã</div>
                                                    <div className="quick-times">
                                                        {(isExpanded(lead.id) ? itemsForDay('tomorrow') : itemsForDay('tomorrow').slice(0, MAX_CHIPS)).map((it, idx) => (
                                                            <button key={`m-${lead.id}-${idx}`} className="time-chip-mini" onClick={(e) => handleReschedule(e, lead, 'tomorrow', it.value)}>Amanhã {it.label}</button>
                                                        ))}
                                                        {itemsForDay('tomorrow').length > MAX_CHIPS && (
                                                            <button className="more-btn" onClick={(e) => toggleExpanded(e, lead.id)}>
                                                                {isExpanded(lead.id) ? 'Menos' : `+${itemsForDay('tomorrow').length - MAX_CHIPS}`}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {colLeads.length === 0 && (
                                    <div className="col-empty">
                                        <p>Nenhum lead</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <ImportSheet
                isOpen={showImport}
                onClose={() => setShowImport(false)}
                onImport={handleImport}
                defaultStatus={LEAD_STATUS.NEW}
                title="Importar Leads"
            />

            <style dangerouslySetInnerHTML={{
                __html: `
        .pipeline-container { height: calc(100vh - 140px); display: flex; flex-direction: column; }
        .pipeline-header { padding: 16px 0; background: var(--surface); border-bottom: 1px solid var(--border-light); }
        .kanban-wrapper { 
          display: flex; gap: 16px; overflow-x: auto; padding: 16px; flex: 1;
          scrollbar-width: none; scroll-snap-type: x mandatory;
        }
        .kanban-wrapper::-webkit-scrollbar { display: none; }
        .kanban-column { 
          min-width: 280px; display: flex; flex-direction: column; 
          gap: 10px; scroll-snap-align: start;
        }
        .col-header { 
          display: flex; justify-content: space-between; align-items: center; 
          padding-bottom: 10px; margin-bottom: 4px;
        }
        .drop-target .col-header { outline: 2px dashed var(--accent); outline-offset: 4px; border-radius: var(--radius-sm); }
        .col-header h3 { font-size: 0.9rem; font-weight: 700; }
        .col-dot { width: 8px; height: 8px; border-radius: 50%; }
        .col-count { 
          padding: 2px 10px; border-radius: var(--radius-full); 
          font-size: 0.75rem; font-weight: 800; 
        }
        .lead-card { 
          cursor: pointer; padding: 14px; 
          border-left: 3px solid var(--border); 
          transition: var(--transition);
        }
        .lead-card:hover { border-left-color: var(--accent); box-shadow: var(--shadow); }
        .type-pill { 
          font-size: 0.6rem; background: var(--border-light); 
          padding: 2px 8px; border-radius: var(--radius-full); 
          color: var(--text-secondary); font-weight: 700; text-transform: uppercase; 
        }
        .lead-meta { font-size: 0.78rem; color: var(--text-secondary); }
        .col-empty { 
          padding: 20px; text-align: center; color: var(--text-muted); 
          font-size: 0.82rem; border: 1.5px dashed var(--border); 
          border-radius: var(--radius-sm); 
        }
        .import-btn-pipe {
          background: var(--accent); color: white; padding: 0 14px; min-height: 38px;
          border-radius: var(--radius-sm); font-size: 0.8rem; font-weight: 600;
          gap: 6px; white-space: nowrap;
        }
        .import-btn-pipe:hover { filter: brightness(1.1); }
        .quick-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .quick-btn {
          min-height: 30px; padding: 4px 10px; border-radius: var(--radius-full);
          font-size: 0.78rem; font-weight: 700; border: 1px solid var(--border);
          background: var(--surface-hover); color: var(--text-secondary);
        }
        .quick-btn:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
        .whatsapp-btn { border-color: var(--success); color: var(--success); background: var(--success-light); }
        .whatsapp-btn:hover { filter: brightness(0.98); }
        .quick-block { display: flex; flex-direction: column; gap: 4px; }
        .quick-label { font-size: 0.72rem; font-weight: 800; color: var(--text-muted); letter-spacing: 0.03em; text-transform: uppercase; }
        .quick-times { display: flex; gap: 6px; flex-wrap: wrap; }
        .time-chip-mini {
          min-height: 28px; padding: 4px 8px; border-radius: var(--radius-full);
          background: var(--surface-hover); border: 1px solid var(--border);
          font-size: 0.72rem; font-weight: 700; color: var(--text-secondary);
        }
        .time-chip-mini:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
        .more-btn {
          min-height: 28px; padding: 4px 10px; border-radius: var(--radius-full);
          font-size: 0.72rem; font-weight: 800; border: 1px dashed var(--border);
          background: var(--surface); color: var(--text-muted);
        }
        .more-btn:hover { border-color: var(--accent); color: var(--accent); }
        .toast {
          position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%);
          background: var(--success); color: white; padding: 10px 14px; border-radius: var(--radius-full);
          font-size: 0.85rem; font-weight: 700; box-shadow: var(--shadow);
          z-index: 300; animation: fadeInUp 0.2s ease;
        }
        .note-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5);
          display: flex; align-items: center; justify-content: center;
          z-index: 300; animation: fadeIn 0.2s ease;
        }
        .note-modal {
          background: var(--surface); border-radius: var(--radius);
          width: 100%; max-width: 460px; padding: 16px;
          box-shadow: var(--shadow-lg); animation: fadeInUp 0.25s ease;
        }
        .note-textarea {
          width: 100%; min-height: 100px; border: 1px solid var(--border);
          border-radius: var(--radius-sm); padding: 12px; font-family: inherit; font-size: 0.95rem;
          outline: none; background: var(--surface); color: var(--text);
        }
        .note-footer { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }
      `}} />
            {toast && <div className="toast">{toast}</div>}
            {noteOpen && (
                <div className="note-overlay" onClick={() => setNoteOpen(false)}>
                    <div className="note-modal" onClick={(e) => e.stopPropagation()}>
                        <h3 style={{ marginBottom: 8 }}>Adicionar observação</h3>
                        <textarea
                            className="note-textarea"
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="Ex.: Ligação realizada, reagendado para quinta às 19:00"
                        />
                        <div className="note-footer">
                            <button className="btn-outline" onClick={() => setNoteOpen(false)}>Cancelar</button>
                            <button className="btn-secondary" onClick={saveNote}>Salvar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Pipeline;
