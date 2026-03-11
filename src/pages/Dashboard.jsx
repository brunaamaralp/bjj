import React, { useState } from 'react';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import { useNavigate } from 'react-router-dom';
import { Plus, CheckCircle, XCircle, Calendar, Clock, ChevronRight, AlertTriangle, MessageCircle, RefreshCcw, Edit3, TrendingUp, TrendingDown } from 'lucide-react';
const DAY_FILTERS = [
    { key: 'today', label: 'Hoje' },
    { key: 'tomorrow', label: 'Amanhã' },
    { key: 'week', label: 'Semana' },
    { key: 'all', label: 'Todos' },
];
const COMMON_TIMES = ['07:00', '08:00', '12:00', '18:00', '19:00', '20:00'];
const nextQuarterTime = () => {
    const d = new Date();
    let m = d.getMinutes();
    const add = 15 - (m % 15 || 15);
    d.setMinutes(m + add, 0, 0);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
};

const Dashboard = () => {
    const navigate = useNavigate();
    const { leads, loading, fetchLeads, academyId } = useLeadStore();
    const [dateFilter, setDateFilter] = useState('all');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [editLead, setEditLead] = useState(null);
    const [editDate, setEditDate] = useState('');
    const [editTime, setEditTime] = useState('');
    const [editStatus, setEditStatus] = useState(LEAD_STATUS.SCHEDULED);

    // Fetch leads on mount if not already loaded or if returning to dashboard
    React.useEffect(() => {
        if (academyId) {
            fetchLeads();
        }
    }, [academyId]);

    const handleRefresh = async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        try {
            await fetchLeads();
        } finally {
            setTimeout(() => setIsRefreshing(false), 300);
        }
    };

    const openEdit = (lead) => {
        setEditLead(lead);
        setEditDate(lead.scheduledDate || '');
        setEditTime(lead.scheduledTime || '');
        setEditStatus(lead.status || LEAD_STATUS.SCHEDULED);
        setEditOpen(true);
    };

    const closeEdit = () => {
        setEditOpen(false);
        setEditLead(null);
        setEditDate('');
        setEditTime('');
    };

    const saveEdit = async () => {
        if (!editLead) return;
        await useLeadStore.getState().updateLead(editLead.id, {
            scheduledDate: editDate,
            scheduledTime: editTime,
            status: editStatus
        });
        closeEdit();
    };

    const removeSchedule = async () => {
        if (!editLead) return;
        await useLeadStore.getState().updateLead(editLead.id, {
            scheduledDate: '',
            scheduledTime: '',
            status: LEAD_STATUS.NEW
        });
        closeEdit();
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + 7);

    // Agenda with date filter
    const toDateTime = (lead) => {
        const base = lead.scheduledDate || lead.createdAt || '';
        if (!base) return new Date(8640000000000000); // max date
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

    const allScheduled = (leads || [])
        .filter(l => l.status === LEAD_STATUS.SCHEDULED)
        .sort((a, b) => toDateTime(a) - toDateTime(b));

    const agendaLeads = allScheduled.filter(lead => {
        if (dateFilter === 'all') return true;
        if (!lead.scheduledDate) return false;

        // Use YYYY-MM-DD from lead.scheduledDate directly for comparison to avoid TZ shifts
        const [y, m, d] = lead.scheduledDate.split('-').map(Number);
        const leadDate = new Date(y, m - 1, d);

        if (dateFilter === 'today') return leadDate.toDateString() === today.toDateString();
        if (dateFilter === 'tomorrow') return leadDate.toDateString() === tomorrow.toDateString();
        if (dateFilter === 'week') return leadDate >= today && leadDate < weekEnd;
        return true;
    });

    // Follow-ups with "days ago" calculation
    const followUps = leads
        .filter(l => l.status === LEAD_STATUS.COMPLETED || l.status === LEAD_STATUS.MISSED)
        .map(l => {
            const classDate = l.scheduledDate ? new Date(l.scheduledDate + 'T00:00:00') : new Date(l.createdAt);
            const diffMs = new Date() - classDate;
            const daysAgo = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            return { ...l, daysAgo };
        })
        .sort((a, b) => b.daysAgo - a.daysAgo);

    const getUrgency = (days) => {
        if (days >= 5) return { level: 'critical', label: 'Urgente', color: 'var(--danger)' };
        if (days >= 3) return { level: 'high', label: 'Atenção', color: 'var(--warning)' };
        if (days >= 1) return { level: 'medium', label: 'Acompanhar', color: 'var(--accent)' };
        return { level: 'low', label: 'Recente', color: 'var(--success)' };
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr + 'T00:00:00');
        if (d.toDateString() === today.toDateString()) return 'Hoje';
        if (d.toDateString() === tomorrow.toDateString()) return 'Amanhã';
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    };

    // Count per filter
    const countFor = (key) => {
        if (key === 'all') return allScheduled.length;
        return allScheduled.filter(l => {
            if (!l.scheduledDate) return false;
            const [y, m, d] = l.scheduledDate.split('-').map(Number);
            const leadDate = new Date(y, m - 1, d);
            if (key === 'today') return leadDate.toDateString() === today.toDateString();
            if (key === 'tomorrow') return leadDate.toDateString() === tomorrow.toDateString();
            if (key === 'week') return leadDate >= today && leadDate < weekEnd;
            return false;
        }).length;
    };

    const handleWhatsApp = (phone, name) => {
        const cleanPhone = phone.replace(/\D/g, '');
        const msg = encodeURIComponent(`Olá ${name}! Tudo bem? Estamos entrando em contato sobre sua aula experimental. Podemos conversar?`);
        window.open(`https://wa.me/55${cleanPhone}?text=${msg}`, '_blank');
    };

    return (
        <div className="container" style={{ paddingTop: 20, paddingBottom: 20 }}>
            <div className="animate-in">
                <h1 style={{ fontSize: '1.5rem', marginBottom: 2 }}>Agenda da Recepção</h1>
                <p className="text-small">Controle de aulas experimentais e retornos</p>
            </div>
            {(() => {
                const startOfWeek = (d) => { const dd = new Date(d); const day = dd.getDay(); const diff = (day + 6) % 7; dd.setDate(dd.getDate()-diff); dd.setHours(0,0,0,0); return dd; };
                const endOfWeek = (d) => { const dd = startOfWeek(d); dd.setDate(dd.getDate()+6); dd.setHours(23,59,59,999); return dd; };
                const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1, 0,0,0,0);
                const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999);
                const parseYMD = (s) => { if (!s) return null; const [Y,M,D] = s.split('-').map(Number); return new Date(Y,(M||1)-1,D||1); };
                const inRange = (ts,a,b) => { if (!ts) return false; const t = new Date(ts).getTime(); return t>=a.getTime() && t<=b.getTime(); };
                const stageEventWithin = (lead, toStatus, cmp) => {
                    const evs = Array.isArray(lead.notes) ? lead.notes : [];
                    const hit = evs.find(e => e && e.type === 'stage_change' && e.to === toStatus && cmp(e.at || e.date));
                    if (hit) return true;
                    if (lead.status === toStatus && lead.statusChangedAt && cmp(lead.statusChangedAt)) return true;
                    return false;
                };
                const now = new Date();
                const mFrom = startOfMonth(now), mTo = endOfMonth(now);
                const pmFrom = startOfMonth(new Date(now.getFullYear(), now.getMonth()-1, 1)), pmTo = endOfMonth(new Date(now.getFullYear(), now.getMonth()-1, 1));
                const wFrom = startOfWeek(now), wTo = endOfWeek(now);
                const pwFrom = new Date(wFrom); pwFrom.setDate(pwFrom.getDate()-7);
                const pwTo = new Date(wTo); pwTo.setDate(pwTo.getDate()-7);
                const pctVar = (cur, prev) => { if (prev === 0) return cur > 0 ? 100 : 0; return Math.round(((cur - prev) / prev) * 100); };
                const newLeadsCur = leads.filter(l => inRange(l.createdAt, mFrom, mTo)).length;
                const newLeadsPrev = leads.filter(l => inRange(l.createdAt, pmFrom, pmTo)).length;
                const schedCur = leads.filter(l => { const d = parseYMD(l.scheduledDate); return d && inRange(d, wFrom, wTo); }).length;
                const schedPrev = leads.filter(l => { const d = parseYMD(l.scheduledDate); return d && inRange(d, pwFrom, pwTo); }).length;
                const convCur = leads.filter(l => stageEventWithin(l, LEAD_STATUS.CONVERTED, (ts) => inRange(ts, mFrom, mTo))).length;
                const convPrev = leads.filter(l => stageEventWithin(l, LEAD_STATUS.CONVERTED, (ts) => inRange(ts, pmFrom, pmTo))).length;
                const cards = [
                    { title: 'Novos leads no mês', cur: newLeadsCur, var: pctVar(newLeadsCur, newLeadsPrev) },
                    { title: 'Aulas agendadas (semana)', cur: schedCur, var: pctVar(schedCur, schedPrev) },
                    { title: 'Matrículas no mês', cur: convCur, var: pctVar(convCur, convPrev) },
                ];
                return (
                    <div className="kpi-row mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
                        {cards.map((c, i) => {
                            const up = c.var >= 0;
                            return (
                                <div key={i} className="card kpi-mini">
                                    <div className="kpi-mini-head"><span>{c.title}</span></div>
                                    <div className="kpi-mini-val">{c.cur}</div>
                                    <div className={`kpi-mini-var ${up ? 'up':'down'}`}>
                                        {up ? <TrendingUp size={14}/> : <TrendingDown size={14}/> } {c.var}%
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                );
            })()}

            <button className="btn-secondary btn-large mt-4" onClick={() => navigate('/new-lead')} style={{ borderRadius: 'var(--radius)' }}>
                <Plus size={22} /> {`Novo ${(() => {
                    const l = useLeadStore.getState().labels?.leads || 'Leads';
                    const basePlural = String(l).trim();
                    const singular = basePlural.toLowerCase().endsWith('s') && basePlural.length > 1
                        ? basePlural.slice(0, -1)
                        : basePlural.toLowerCase();
                    return singular.slice(0,1).toUpperCase() + singular.slice(1);
                })()}`}
            </button>

            {/* Date Filter Tabs */}
            <section className="mt-6 animate-in" style={{ animationDelay: '0.1s' }}>
                <div className="flex justify-between items-center mb-2">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Calendar size={18} color="var(--accent)" /> Aulas Experimentais
                    </h3>
                    <button
                        className="refresh-btn"
                        onClick={handleRefresh}
                        disabled={loading || isRefreshing}
                    >
                        <RefreshCcw size={16} className={isRefreshing ? 'spin-refresh' : ''} />
                    </button>
                </div>

                <div className="filter-tabs mb-3">
                    {DAY_FILTERS.map(f => (
                        <button
                            key={f.key}
                            className={`filter-tab ${dateFilter === f.key ? 'active' : ''}`}
                            onClick={() => setDateFilter(f.key)}
                        >
                            {f.label}
                            {countFor(f.key) > 0 && <span className="tab-count">{countFor(f.key)}</span>}
                        </button>
                    ))}
                </div>

                <div className="flex-col gap-2">
                    {loading ? (
                        <div className="flex justify-center p-8">
                            <div className="spinner" />
                        </div>
                    ) : agendaLeads.length > 0 ? agendaLeads.map((lead, i) => (
                        <div key={lead.id} className="card agenda-card animate-in" style={{ animationDelay: `${0.04 * i}s` }}>
                            <div className="flex justify-between items-center" onClick={() => navigate(`/lead/${lead.id}`)} style={{ cursor: 'pointer' }}>
                                <div style={{ flex: 1 }}>
                                    <strong style={{ fontSize: '1rem' }}>{lead.name}</strong>
                                    <p className="text-small" style={{ marginTop: 2 }}>
                                        {lead.type || 'Adulto'} • {lead.phone}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
                                        <Clock size={14} color="var(--accent)" />
                                        <strong style={{ color: 'var(--accent)', fontSize: '1.05rem' }}>{lead.scheduledTime || '--:--'}</strong>
                                        <button
                                            className="edit-time-btn"
                                            onClick={(e) => { e.stopPropagation(); openEdit(lead); }}
                                            title="Editar agendamento"
                                            aria-label="Editar agendamento"
                                        >
                                            <Edit3 size={20} strokeWidth={2.6} color="#ffffff" />
                                        </button>
                                    </div>
                                    <span className="text-xs text-light">{formatDate(lead.scheduledDate)}</span>
                                </div>
                            </div>

                            <div className="flex gap-2 mt-3 pt-3 border-t">
                                <button
                                    className="btn-success flex-1"
                                    onClick={(e) => { e.stopPropagation(); useLeadStore.getState().updateLead(lead.id, { status: LEAD_STATUS.COMPLETED }); }}
                                >
                                    <CheckCircle size={16} /> Compareceu
                                </button>
                                <button
                                    className="btn-outline flex-1"
                                    onClick={(e) => { e.stopPropagation(); useLeadStore.getState().updateLead(lead.id, { status: LEAD_STATUS.MISSED }); }}
                                >
                                    <XCircle size={16} /> Faltou
                                </button>
                            </div>
                        </div>
                    )) : (
                        <div className="empty-state">
                            <Calendar size={32} color="var(--text-muted)" style={{ marginBottom: 10, opacity: 0.5 }} />
                            <p>Nenhuma aula para {DAY_FILTERS.find(f => f.key === dateFilter)?.label.toLowerCase() || 'o período'}.</p>
                            <p className="text-xs text-light mt-1">Cadastre um novo interessado para começar!</p>
                        </div>
                    )}
                </div>
            </section>

            {/* Follow-ups with urgency ruler */}
            <section className="mt-6 animate-in" style={{ animationDelay: '0.2s' }}>
                <div className="flex justify-between items-center mb-2">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        Follow-ups Pendentes
                    </h3>
                    <span className="badge badge-secondary">{followUps.length}</span>
                </div>

                <div className="flex-col gap-2">
                    {followUps.length > 0 ? followUps.map((lead, i) => {
                        const urgency = getUrgency(lead.daysAgo);
                        return (
                            <div key={lead.id} className="card follow-card animate-in" style={{ animationDelay: `${0.04 * i}s` }}>
                                <div className="flex justify-between items-center" onClick={() => navigate(`/lead/${lead.id}`)} style={{ cursor: 'pointer' }}>
                                    <div style={{ flex: 1 }}>
                                        <div className="flex items-center gap-2">
                                            <strong>{lead.name}</strong>
                                            <span className="urgency-tag" style={{ background: urgency.color + '18', color: urgency.color }}>
                                                {lead.daysAgo === 0 ? 'Hoje' : `${lead.daysAgo}d`}
                                            </span>
                                        </div>
                                        <p className="text-small">{lead.phone} • {urgency.label}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`status-pill ${lead.status === LEAD_STATUS.COMPLETED ? 'pill-success' : 'pill-danger'}`}>
                                            {lead.status === LEAD_STATUS.COMPLETED ? 'Pós-Aula' : 'Recuperar'}
                                        </span>
                                    </div>
                                </div>

                                {/* Quick actions */}
                                <div className="flex gap-2 mt-3 pt-3 border-t">
                                    <button
                                        className="followup-action-btn flex-1"
                                        onClick={(e) => { e.stopPropagation(); handleWhatsApp(lead.phone, lead.name); }}
                                    >
                                        <MessageCircle size={14} color="#25D366" /> WhatsApp
                                    </button>
                                    <button
                                        className="followup-action-btn flex-1"
                                        onClick={(e) => { e.stopPropagation(); navigate(`/lead/${lead.id}`); }}
                                    >
                                        <ChevronRight size={14} /> Ver Perfil
                                    </button>
                                </div>
                            </div>
                        );
                    }) : (
                        <div className="empty-state">
                            <p>Nada pendente por agora.</p>
                        </div>
                    )}
                </div>
            </section>

            {editOpen && (
                <div className="edit-modal-overlay" onClick={closeEdit}>
                    <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
                        <h3 style={{ marginBottom: 8 }}>Editar Agendamento</h3>
                        <div className="flex gap-2">
                            <div className="form-group" style={{ flex: 1 }}>
                                <label>Data</label>
                                <input type="date" className="form-input" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                            </div>
                            <div className="form-group" style={{ flex: 1 }}>
                                <label>Horário</label>
                                <input type="time" step="300" className="form-input" value={editTime} onChange={(e) => setEditTime(e.target.value)} />
                                <div className="time-chips mt-2">
                                    <button type="button" className="time-chip" onClick={() => setEditTime(nextQuarterTime())}>
                                        Próximo
                                    </button>
                                    {COMMON_TIMES.map(t => (
                                        <button
                                            key={t}
                                            type="button"
                                            className={`time-chip ${editTime === t ? 'active' : ''}`}
                                            onClick={() => setEditTime(t)}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="form-group mt-2">
                            <label>Status</label>
                            <select className="form-input" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                                <option value={LEAD_STATUS.NEW}>Novo</option>
                                <option value={LEAD_STATUS.SCHEDULED}>Agendado</option>
                                <option value={LEAD_STATUS.COMPLETED}>Compareceu</option>
                                <option value={LEAD_STATUS.MISSED}>Não Compareceu</option>
                                <option value={LEAD_STATUS.CONVERTED}>Matriculado</option>
                                <option value={LEAD_STATUS.LOST}>Não fechou</option>
                            </select>
                        </div>
                        <div className="edit-actions">
                            <button className="btn-outline danger-outline" onClick={removeSchedule} title="Remover agendamento e voltar para Novo">Remover agendamento</button>
                            <button className="btn-outline" onClick={closeEdit}>Cancelar</button>
                            <button className="btn-secondary" onClick={saveEdit}>Salvar</button>
                        </div>
                    </div>
                </div>
            )}
            <style dangerouslySetInnerHTML={{
                __html: `
        .kpi-row { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px; }
        @media (max-width: 900px) { .kpi-row { grid-template-columns: 1fr; } }
        .kpi-mini { padding: 14px; }
        .kpi-mini-head { display: flex; justify-content: space-between; align-items: center; }
        .kpi-mini-head span { font-size: 0.82rem; font-weight: 700; color: var(--text-secondary); }
        .kpi-mini-val { font-size: 1.6rem; font-weight: 800; margin-top: 6px; }
        .kpi-mini-var { margin-top: 6px; font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); display: inline-flex; align-items: center; gap: 6px; }
        .kpi-mini-var.up { color: var(--success); }
        .kpi-mini-var.down { color: var(--danger); }
        .agenda-card { border-left: 4px solid var(--accent); }
        .follow-card { border-left: 4px solid var(--warning); }
        .filter-tabs { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
        .filter-tabs::-webkit-scrollbar { display: none; }
        .filter-tab {
          padding: 8px 16px; border-radius: var(--radius-full); font-size: 0.82rem;
          font-weight: 600; white-space: nowrap; background: var(--surface);
          border: 1.5px solid var(--border); color: var(--text-secondary);
          min-height: 36px; display: flex; align-items: center; gap: 6px;
          transition: var(--transition); cursor: pointer;
        }
        .filter-tab.active { background: var(--accent); color: white; border-color: var(--accent); }
        .tab-count {
          font-size: 0.7rem; font-weight: 800; min-width: 18px; height: 18px;
          border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.25);
        }
        .filter-tab:not(.active) .tab-count { background: var(--accent-light); color: var(--accent); }
        .status-pill { 
          font-size: 0.7rem; padding: 4px 10px; border-radius: var(--radius-full); 
          font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; white-space: nowrap;
        }
        .pill-success { background: var(--success-light); color: var(--success); }
        .pill-danger { background: var(--danger-light); color: var(--danger); }
        .urgency-tag {
          font-size: 0.65rem; font-weight: 800; padding: 2px 7px;
          border-radius: var(--radius-full); letter-spacing: 0.02em;
        }
        .followup-action-btn {
          background: var(--surface-hover); border: 1px solid var(--border-light);
          border-radius: var(--radius-sm); font-size: 0.78rem; font-weight: 600;
          min-height: 36px; gap: 6px; color: var(--text-secondary);
        }
        .followup-action-btn:hover { border-color: var(--accent); color: var(--accent); }
        .refresh-btn {
          background: none; border: none; color: var(--text-muted);
          width: 32px; height: 32px; padding: 0; min-height: auto;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: var(--transition);
        }
        .refresh-btn:hover { color: var(--accent); }
        .refresh-btn:disabled { opacity: 0.5; }
        .spin-refresh { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .edit-time-btn { 
          width: 32px; height: 32px; border-radius: 50%;
          background: var(--accent); color: #fff;
          display: inline-flex; align-items: center; justify-content: center;
          border: none; cursor: pointer;
          box-shadow: 0 4px 16px rgba(35, 99, 255, 0.22);
          transition: transform .12s ease, filter .12s ease, box-shadow .2s ease;
        }
        .edit-time-btn svg { color: #fff; stroke: #fff; filter: drop-shadow(0 0 1px rgba(0,0,0,0.18)); }
        .edit-time-btn:hover { filter: brightness(0.96); }
        .edit-time-btn:active { transform: translateY(1px); }
        .edit-time-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; box-shadow: 0 0 0 4px rgba(35,99,255,0.16); }
        .edit-modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 300;
          display: flex; align-items: center; justify-content: center;
        }
        .edit-modal {
          background: var(--surface); border-radius: var(--radius); width: 92%; max-width: 420px;
          padding: 16px; box-shadow: var(--shadow);
        }
        .edit-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 12px; }
        .danger-outline { border-color: var(--danger) !important; color: var(--danger) !important; }
        .time-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .time-chip {
          min-height: 30px; padding: 6px 10px; border-radius: var(--radius-full);
          background: var(--surface-hover); border: 1px solid var(--border);
          font-size: 0.75rem; font-weight: 700; color: var(--text-secondary);
        }
        .time-chip.active, .time-chip:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
      `}} />
        </div>
    );
};

export default Dashboard;
