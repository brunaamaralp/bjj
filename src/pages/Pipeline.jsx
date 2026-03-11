import React, { useState, useEffect } from 'react';
import { useLeadStore, LEAD_STATUS, LEAD_ORIGIN } from '../store/useLeadStore';
import { useNavigate } from 'react-router-dom';
import { Calendar, Phone, Upload, MessageCircle, ChevronDown, ChevronRight, SlidersHorizontal, PlusCircle } from 'lucide-react';
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

const DEFAULT_STAGE_LABELS = [
    { id: 'Novo', label: 'Novo' },
    { id: 'Contato feito', label: 'Contato feito' },
    { id: 'Aula experimental', label: 'Aula experimental' },
    { id: 'Negociação', label: 'Negociação' },
    { id: 'Matriculado', label: 'Matrícula' },
];
const STAGE_COLORS = [
    { color: 'var(--accent)', bg: 'var(--accent-light)' },
    { color: 'var(--warning)', bg: 'var(--warning-light)' },
    { color: 'var(--danger)', bg: 'var(--danger-light)' },
    { color: 'var(--success)', bg: 'var(--success-light)' },
    { color: 'var(--purple)', bg: 'var(--purple-light)' },
    { color: 'var(--cyan)', bg: 'rgba(0, 188, 212, 0.15)' },
];
const DEFAULT_STAGE_SLA_DAYS = 3;

const Pipeline = () => {
    const navigate = useNavigate();
    const { leads, importLeads, updateLead } = useLeadStore();
    const labels = useLeadStore((s) => s.labels);
    const academyId = useLeadStore((s) => s.academyId);
    const getLeadById = useLeadStore((s) => s.getLeadById);
    const [showImport, setShowImport] = useState(false);
    const [quickItems, setQuickItems] = useState([]);
    const [toast, setToast] = useState('');
    const [expanded, setExpanded] = useState({});
    const [dragOver, setDragOver] = useState(null);
    const [noteOpen, setNoteOpen] = useState(false);
    const [noteLead, setNoteLead] = useState(null);
    const [noteText, setNoteText] = useState('');
    const [schedulerOpenId, setSchedulerOpenId] = useState(null);
    const [moverOpenId, setMoverOpenId] = useState(null);
    const [stages, setStages] = useState(DEFAULT_STAGE_LABELS);
    const [editStages, setEditStages] = useState(false);
    const [tempStages, setTempStages] = useState(DEFAULT_STAGE_LABELS);
    const [dayFilter, setDayFilter] = useState('all'); // all | today | tomorrow
    const [originFilter, setOriginFilter] = useState('all'); // all | origin

    const handleImport = (rows) => {
        importLeads(rows);
    };
    const singular = (plural) => {
        if (!plural) return 'Lead';
        const p = String(plural).trim();
        if (p.toLowerCase().endsWith('s') && p.length > 1) return p.slice(0, -1);
        return p;
    };
    const slug = (txt) => String(txt || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');

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
                try {
                    if (doc.stagesConfig) {
                        const conf = typeof doc.stagesConfig === 'string' ? JSON.parse(doc.stagesConfig) : doc.stagesConfig;
                        if (Array.isArray(conf) && conf.length > 0) {
                            setStages(conf);
                            setTempStages(conf);
                        } else {
                            setStages(DEFAULT_STAGE_LABELS);
                            setTempStages(DEFAULT_STAGE_LABELS);
                        }
                    } else {
                        setStages(DEFAULT_STAGE_LABELS);
                        setTempStages(DEFAULT_STAGE_LABELS);
                    }
                } catch {
                    setStages(DEFAULT_STAGE_LABELS);
                    setTempStages(DEFAULT_STAGE_LABELS);
                }
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
        try {
            const existing = Array.isArray(lead.notes) ? lead.notes : [];
            const event = { type: 'schedule', date: ymd, time, at: new Date().toISOString(), by: 'user' };
            const newNotes = [...existing, event];
            await updateLead(lead.id, { status: LEAD_STATUS.SCHEDULED, scheduledDate: ymd, scheduledTime: time, notes: newNotes });
        } catch {
            await updateLead(lead.id, { status: LEAD_STATUS.SCHEDULED, scheduledDate: ymd, scheduledTime: time });
        }
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
    const openScheduler = (e, leadId) => {
        e.stopPropagation();
        setSchedulerOpenId(prev => prev === leadId ? null : leadId);
        setMoverOpenId(null);
    };
    const openMover = (e, leadId) => {
        e.stopPropagation();
        setMoverOpenId(prev => prev === leadId ? null : leadId);
        setSchedulerOpenId(null);
    };
    const moveToStatus = async (e, leadId, status) => {
        e.stopPropagation();
        try {
            const lead = getLeadById(leadId);
            const existing = Array.isArray(lead?.notes) ? lead.notes : [];
            const event = { type: 'stage_change', from: lead?.status || '', to: status, at: new Date().toISOString(), by: 'user' };
            const newNotes = [...existing, event];
            await updateLead(leadId, { status, notes: newNotes });
        } catch {
            await updateLead(leadId, { status });
        }
        setMoverOpenId(null);
        setToast('Movido no pipeline');
        setTimeout(() => setToast(''), 2000);
    };
    const saveStages = async () => {
        try {
            const cleaned = tempStages.filter(s => s && String(s.id).trim()).map((s) => ({
                id: String(s.id).trim(),
                label: String(s.label || s.id).trim(),
                slaDays: Number.isFinite(s.slaDays) ? s.slaDays : DEFAULT_STAGE_SLA_DAYS,
            }));
            await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
                stagesConfig: JSON.stringify(cleaned),
            });
            setStages(cleaned);
            setEditStages(false);
        } catch (e) {
            console.error('saveStages error', e);
        }
    };
    const addStage = () => {
        const id = `custom-${Date.now()}`;
        setTempStages(prev => [...prev, { id, label: 'Nova etapa', slaDays: DEFAULT_STAGE_SLA_DAYS }]);
    };
    const mapLeadToStageId = (lead) => {
        const hasDirect = stages.find(s => s.id === lead.status);
        if (hasDirect) return lead.status;
        const s = (lead.status || '').toLowerCase();
        if (s === (LEAD_STATUS.NEW || '').toLowerCase() || s === 'novo') return 'Novo';
        if (s.includes('agendado')) return 'Aula experimental';
        if (s.includes('compareceu')) return 'Negociação';
        if (s.includes('não compareceu') || s.includes('nao compareceu')) return 'Contato feito';
        if (s.includes('matricul')) return 'Matriculado';
        return 'Novo';
    };
    const renderNow = new Date();
    const daysInStage = (lead) => {
        const start = lead.statusChangedAt ? new Date(lead.statusChangedAt) : (lead.createdAt ? new Date(lead.createdAt) : renderNow);
        const diff = Math.floor((renderNow.getTime() - start.getTime()) / 86400000);
        return diff < 0 ? 0 : diff;
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
                    <div className="flex gap-2 header-actions">
                        <div className="filters">
                            <button className={`filter-chip ${dayFilter === 'all' ? 'active' : ''}`} onClick={() => setDayFilter('all')}>Todos</button>
                            <button className={`filter-chip ${dayFilter === 'today' ? 'active' : ''}`} onClick={() => setDayFilter('today')}>Hoje</button>
                            <button className={`filter-chip ${dayFilter === 'tomorrow' ? 'active' : ''}`} onClick={() => setDayFilter('tomorrow')}>Amanhã</button>
                            <div className="origin-group">
                                <SlidersHorizontal size={14} />
                                <select className="origin-select" value={originFilter} onChange={(e) => setOriginFilter(e.target.value)}>
                                    <option value="all">Todas origens</option>
                                    {LEAD_ORIGIN.map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                            </div>
                        </div>
                        <ExportButton leads={leads} fileName={`${slug(labels.leads)}-pipeline`} label="Exportar" />
                        <button className="import-btn-pipe" onClick={() => setShowImport(true)}>
                            <Upload size={16} /> {`Importar ${labels.leads}`}
                        </button>
                        <button className="import-btn-pipe" onClick={() => { setEditStages(prev => !prev); setTempStages(stages); }}>
                            <SlidersHorizontal size={16} /> Etapas
                        </button>
                    </div>
                </div>
                {editStages && (
                    <div className="container stage-editor">
                        {tempStages.map((st, idx) => (
                            <div className="stage-row" key={st.id}>
                                <input
                                    className="stage-input"
                                    value={st.label}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setTempStages(prev => prev.map((s, i) => i === idx ? { ...s, label: v } : s));
                                    }}
                                />
                                <input
                                    className="stage-sla"
                                    type="number"
                                    min="1"
                                    value={st.slaDays ?? DEFAULT_STAGE_SLA_DAYS}
                                    onChange={(e) => {
                                        const v = parseInt(e.target.value, 10);
                                        setTempStages(prev => prev.map((s, i) => i === idx ? { ...s, slaDays: v } : s));
                                    }}
                                    title="SLA (dias)"
                                />
                            </div>
                        ))}
                        <div className="stage-actions">
                            <button className="btn-secondary" onClick={addStage}><PlusCircle size={14} /> Adicionar etapa</button>
                            <div className="grow"></div>
                            <button className="btn-outline" onClick={() => setEditStages(false)}>Cancelar</button>
                            <button className="btn-primary" onClick={saveStages}>Salvar</button>
                        </div>
                    </div>
                )}
            </div>

            <div className="kanban-wrapper">
                {stages.map((col, idx) => {
                    const color = STAGE_COLORS[idx % STAGE_COLORS.length];
                    const todayYMD = toYMD(new Date());
                    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
                    const tomorrowYMD = toYMD(tomorrow);
                    const colLeads = leads
                      .filter(l => mapLeadToStageId(l) === col.id)
                      .filter(l => {
                          if (dayFilter === 'today') return (l.scheduledDate || '') === todayYMD;
                          if (dayFilter === 'tomorrow') return (l.scheduledDate || '') === tomorrowYMD;
                          return true;
                      })
                      .filter(l => originFilter === 'all' ? true : (l.origin || '') === originFilter)
                      .sort((a, b) => {
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
                            key={col.id}
                            className={`kanban-column ${dragOver === col.id ? 'drop-target' : ''}`}
                            onDragOver={onDragOver}
                            onDragEnter={() => onDragEnter(col.id)}
                            onDragLeave={onDragLeave}
                            onDrop={(e) => onDrop(e, col.id)}
                        >
                            <div className="col-header">
                                <div className="flex items-center gap-2">
                                    <span className="col-dot" style={{ background: color.color }}></span>
                                    <h3>{col.label}</h3>
                                </div>
                                <span className="col-count" style={{ background: color.bg, color: color.color }}>
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
                                        <div className="lead-meta mt-1 flex items-center gap-2">
                                            <span className={`stage-age ${daysInStage(lead) >= (col.slaDays ?? DEFAULT_STAGE_SLA_DAYS) ? 'over-sla' : ''}`}>
                                                {daysInStage(lead)}d no estágio
                                            </span>
                                        </div>
                                        <div className="action-bar mt-2">
                                            <button className="action-btn" onClick={(e) => handleWhatsApp(e, lead)}>
                                                <MessageCircle size={14} /> WhatsApp
                                            </button>
                                            <button className="action-btn" onClick={(e) => openScheduler(e, lead.id)}>
                                                <Calendar size={14} /> Agendar <ChevronDown size={14} />
                                            </button>
                                            <button className="action-btn" onClick={(e) => openMover(e, lead.id)}>
                                                <ChevronRight size={14} /> Mover
                                            </button>
                                            <button className="action-btn" onClick={(e) => openNote(e, lead)}>
                                                <MessageCircle size={14} /> Obs.
                                            </button>
                                        </div>
                                        {schedulerOpenId === lead.id && (
                                            <div className="dropdown-panel" onClick={(e) => e.stopPropagation()}>
                                                <div className="dropdown-section">
                                                    <div className="dropdown-label">Hoje</div>
                                                    <div className="dropdown-times">
                                                        {(isExpanded(lead.id) ? itemsForDay('today') : itemsForDay('today').slice(0, MAX_CHIPS)).map((it, idx) => (
                                                            <button key={`t-${lead.id}-${idx}`} className="time-chip-mini" onClick={(e) => handleReschedule(e, lead, 'today', it.value)}>{it.label}</button>
                                                        ))}
                                                        {itemsForDay('today').length > MAX_CHIPS && (
                                                            <button className="more-btn" onClick={(e) => toggleExpanded(e, lead.id)}>
                                                                {isExpanded(lead.id) ? 'Menos' : `+${itemsForDay('today').length - MAX_CHIPS}`}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="dropdown-section">
                                                    <div className="dropdown-label">Amanhã</div>
                                                    <div className="dropdown-times">
                                                        {(isExpanded(lead.id) ? itemsForDay('tomorrow') : itemsForDay('tomorrow').slice(0, MAX_CHIPS)).map((it, idx) => (
                                                            <button key={`m-${lead.id}-${idx}`} className="time-chip-mini" onClick={(e) => handleReschedule(e, lead, 'tomorrow', it.value)}>{it.label}</button>
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
                                        {moverOpenId === lead.id && (
                                            <div className="dropdown-panel" onClick={(e) => e.stopPropagation()}>
                                                {stages.map(s => {
                                                    const active = (mapLeadToStageId(lead) === s.id);
                                                    return (
                                                        <button
                                                            key={`${lead.id}-${s.id}`}
                                                            className={`dropdown-item${active ? ' active' : ''}`}
                                                            onClick={(e) => moveToStatus(e, lead.id, s.id)}
                                                        >
                                                            {s.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {colLeads.length === 0 && (
                                    <div className="col-empty">
                                        <p>{`Nenhum ${singular(labels.leads).toLowerCase()}`}</p>
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
                title={`Importar ${labels.leads}`}
            />

            <style dangerouslySetInnerHTML={{
                __html: `
        .pipeline-container { height: calc(100vh - 140px); display: flex; flex-direction: column; }
        .pipeline-header { padding: 12px 0 8px; background: var(--surface); border-bottom: 1px solid var(--border-light); }
        .pipeline-header .container h2 { margin: 0; }
        .header-actions { align-items: center; gap: 8px; flex-wrap: wrap; }
        .kanban-wrapper { 
          display: flex; gap: 16px; overflow-x: auto; padding: 12px 16px 16px; flex: 1;
          scroll-snap-type: x mandatory;
          scrollbar-width: thin;
          scrollbar-gutter: stable both-edges;
        }
        .kanban-wrapper::-webkit-scrollbar {
          height: 12px;
        }
        .kanban-wrapper::-webkit-scrollbar-track {
          background: var(--surface);
          border-top: 1px solid var(--border-light);
        }
        .kanban-wrapper::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, var(--border) 0%, var(--accent) 100%);
          border-radius: 999px;
          border: 2px solid var(--surface);
        }
        .kanban-wrapper::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, var(--accent) 0%, var(--accent) 100%);
        }
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
        .filters { display: flex; align-items: center; gap: 8px; margin-right: 8px; }
        .filter-chip {
          min-height: 30px; padding: 4px 10px; border-radius: var(--radius-full);
          border: 1px solid var(--border); background: var(--surface); color: var(--text-secondary);
          font-size: 0.78rem; font-weight: 700;
        }
        .filter-chip.active { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
        .origin-group { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: var(--radius-full); padding: 2px 8px; background: var(--surface); }
        .origin-select { border: none; outline: none; background: transparent; color: var(--text-secondary); font-weight: 700; }
        .stage-editor { margin-top: 10px; padding-bottom: 10px; }
        .stage-row { display: grid; grid-template-columns: 1fr 90px; gap: 8px; margin-bottom: 8px; }
        .stage-input, .stage-sla { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px; background: var(--surface); color: var(--text); }
        .stage-actions { display: flex; align-items: center; gap: 8px; }
        .btn-primary { background: var(--accent); color: white; border: 1px solid var(--accent); padding: 6px 12px; border-radius: var(--radius-sm); font-weight: 700; }
        .btn-secondary { background: var(--surface-hover); color: var(--text-secondary); border: 1px solid var(--border); padding: 6px 12px; border-radius: var(--radius-sm); font-weight: 700; display: inline-flex; align-items: center; gap: 6px; }
        .btn-outline { background: var(--surface); color: var(--text-secondary); border: 1px solid var(--border); padding: 6px 12px; border-radius: var(--radius-sm); font-weight: 700; }
        .grow { flex: 1 1 auto; }
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
        .action-bar { display: flex; gap: 6px; flex-wrap: wrap; }
        .action-btn {
          min-height: 30px; padding: 4px 10px; border-radius: var(--radius-full);
          font-size: 0.78rem; font-weight: 700; border: 1px solid var(--border);
          background: var(--surface); color: var(--text-secondary); display: inline-flex; align-items: center; gap: 6px;
        }
        .action-btn:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
        .lead-card { position: relative; }
        .dropdown-panel {
          position: absolute; left: 14px; right: 14px; top: 100%; margin-top: 6px;
          background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
          box-shadow: var(--shadow-lg); padding: 10px; z-index: 5;
        }
        .dropdown-section { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
        .dropdown-label { font-size: 0.72rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; }
        .dropdown-times { display: flex; gap: 6px; flex-wrap: wrap; }
        .dropdown-item {
          width: 100%; text-align: left; padding: 8px 10px; border-radius: var(--radius-sm);
          border: 1px solid var(--border); background: var(--surface);
          font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);
        }
        .dropdown-item.active { background: var(--accent-light); border-color: var(--accent); color: var(--accent); }
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
