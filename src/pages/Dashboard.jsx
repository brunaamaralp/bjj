import React, { useState } from 'react';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import { useNavigate } from 'react-router-dom';
import { Plus, CheckCircle, XCircle, Calendar, Clock, ChevronRight, MessageCircle, RefreshCcw, Edit3, TrendingUp, TrendingDown, Trash2 } from 'lucide-react';
const DAY_FILTERS = [
    { key: 'today', label: 'Hoje' },
    { key: 'tomorrow', label: 'Amanhã' },
    {
        key: 'week',
        label: 'Semana',
        title: 'Próximos 7 dias corridos a partir de hoje (não é semana civil segunda–domingo).',
    },
    { key: 'all', label: 'Todos' },
];
/** Follow-ups com aula há >= N dias somem desta agenda e ficam só no Kanban */
const FOLLOWUP_AGENDA_MAX_DAYS = 7;
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
        const pipelineStage =
            editStatus === LEAD_STATUS.SCHEDULED ? 'Aula experimental'
                : editStatus === LEAD_STATUS.COMPLETED ? 'Matriculado'
                    : editStatus === LEAD_STATUS.CONVERTED ? 'Matriculado'
                        : editStatus === LEAD_STATUS.MISSED ? LEAD_STATUS.MISSED
                            : editStatus === LEAD_STATUS.LOST ? LEAD_STATUS.LOST
                                : undefined;
        await useLeadStore.getState().updateLead(editLead.id, {
            scheduledDate: editDate,
            scheduledTime: editTime,
            status: editStatus,
            ...(pipelineStage ? { pipelineStage } : {})
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

    const deleteLead = async () => {
        if (!editLead) return;
        const ok = window.confirm(`Excluir o lead "${editLead.name || 'Sem nome'}"? Essa ação não pode ser desfeita.`);
        if (!ok) return;
        await useLeadStore.getState().deleteLead(editLead.id);
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

    /** Agenda da recepção: só quem tem data civil YYYY-MM-DD (evita “Agendado” sem horário no calendário). */
    const hasExperimentalDate = (l) => {
        const ymd = String(l?.scheduledDate || '').trim().split('T')[0];
        return /^\d{4}-\d{2}-\d{2}$/.test(ymd);
    };

    const allScheduled = (leads || [])
        .filter((l) => l.status === LEAD_STATUS.SCHEDULED && hasExperimentalDate(l))
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

    // Follow-ups: dias desde a data da aula experimental; na agenda, só os primeiros 7 dias; mais recentes no topo
    const followUpsAll = leads
        .filter(l => l.status === LEAD_STATUS.COMPLETED || l.status === LEAD_STATUS.MISSED)
        .map(l => {
            const classDate = l.scheduledDate ? new Date(l.scheduledDate + 'T00:00:00') : new Date(l.createdAt);
            const diffMs = new Date() - classDate;
            const daysAgo = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            return { ...l, daysAgo };
        });
    const followUpsKanbanOnlyCount = followUpsAll.filter((l) => l.daysAgo >= FOLLOWUP_AGENDA_MAX_DAYS).length;
    const followUps = followUpsAll
        .filter((l) => l.daysAgo < FOLLOWUP_AGENDA_MAX_DAYS)
        .sort((a, b) => {
            if (a.daysAgo !== b.daysAgo) return a.daysAgo - b.daysAgo;
            const ta = new Date(a.statusChangedAt || a.pipelineStageChangedAt || a.createdAt || 0).getTime();
            const tb = new Date(b.statusChangedAt || b.pipelineStageChangedAt || b.createdAt || 0).getTime();
            return tb - ta;
        });

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

    const scheduledOutsideFilter =
        !loading &&
        agendaLeads.length === 0 &&
        allScheduled.length > 0 &&
        dateFilter !== 'all';

    const handleWhatsApp = (lead) => {
        const cleanPhone = String(lead?.phone || '').replace(/\D/g, '');
        const firstName = String(lead?.name || '').trim().split(/\s+/)[0] || 'Aluno';
        const dateStr = lead?.scheduledDate ? new Date(`${lead.scheduledDate}T00:00:00`).toLocaleDateString('pt-BR') : '';
        const timeStr = String(lead?.scheduledTime || '').trim();

        let text = `Olá ${firstName}! Tudo bem?`;
        if (lead?.status === LEAD_STATUS.MISSED) {
            text += ` Sentimos sua falta na aula experimental${dateStr ? ` do dia ${dateStr}` : ''}${timeStr ? ` às ${timeStr}` : ''}. Quer remarcar para outro dia?`;
        } else {
            text += ` O que achou da aula experimental${dateStr ? ` do dia ${dateStr}` : ''}? Quer que eu te envie os valores e horários para começar?`;
        }

        const msg = encodeURIComponent(text);
        window.open(`https://wa.me/55${cleanPhone}?text=${msg}`, '_blank');
    };

    const handleWhatsAppScheduled = (lead) => {
        const cleanPhone = String(lead?.phone || '').replace(/\D/g, '');
        if (!cleanPhone) return;
        const firstName = String(lead?.name || '').trim().split(/\s+/)[0] || 'Aluno';
        const dateStr = lead?.scheduledDate ? new Date(`${lead.scheduledDate}T00:00:00`).toLocaleDateString('pt-BR') : '';
        const timeStr = String(lead?.scheduledTime || '').trim();
        let text = `Olá ${firstName}! Tudo bem?`;
        if (dateStr && timeStr) {
            text += ` Passando para confirmar sua aula experimental no dia ${dateStr} às ${timeStr}. Qualquer coisa, estamos à disposição!`;
        } else if (dateStr) {
            text += ` Passando para confirmar sua aula experimental no dia ${dateStr}. Qual horário combinamos?`;
        } else {
            text += ` Passando para combinar sua aula experimental. Qual o melhor dia e horário para você?`;
        }
        window.open(`https://wa.me/55${cleanPhone}?text=${encodeURIComponent(text)}`, '_blank');
    };

    return (
        <div className="container" style={{ paddingTop: 20, paddingBottom: 20 }}>
            <div className="reception-agenda-inner">
            <div className="animate-in">
                <h1 className="navi-page-title">Agenda da Recepção</h1>
                <p className="navi-eyebrow" style={{ marginTop: 6 }}>Controle de aulas experimentais e retornos</p>
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
                    return evs.some(e =>
                        e &&
                        e.type === 'stage_change' &&
                        e.to === toStatus &&
                        cmp(e.at || e.date)
                    );
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
                    <div className="agenda-kpi-grid mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
                        {cards.map((c, i) => {
                            const up = c.var >= 0;
                            return (
                                <div key={i} className="agenda-kpi-card">
                                    <div className="agenda-kpi-label">{c.title}</div>
                                    <div className="agenda-kpi-value">{c.cur}</div>
                                    <div className={`agenda-kpi-trend ${up ? 'is-up' : 'is-down'}`}>
                                        {up ? <TrendingUp size={16} strokeWidth={2.25} aria-hidden /> : <TrendingDown size={16} strokeWidth={2.25} aria-hidden />}
                                        <span>
                                            {up && c.var > 0 ? '+' : ''}
                                            {c.var}%
                                        </span>
                                        <span className="agenda-kpi-trend-hint">vs. período anterior</span>
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
                    <h3 className="navi-section-heading">
                        <Calendar size={18} color="var(--v500)" /> Aulas Experimentais
                    </h3>
                    <button
                        className="refresh-btn"
                        onClick={handleRefresh}
                        disabled={loading || isRefreshing}
                    >
                        <RefreshCcw size={16} className={isRefreshing ? 'spin-refresh' : ''} />
                    </button>
                </div>

                <div className="filter-strip agenda-experimental-filter-strip">
                    {DAY_FILTERS.map(f => (
                        <button
                            key={f.key}
                            type="button"
                            className={`filter-pill ${dateFilter === f.key ? 'active' : ''}`}
                            onClick={() => setDateFilter(f.key)}
                            title={f.title || undefined}
                        >
                            {f.label}
                            {countFor(f.key) > 0 && <span className="tab-count">{countFor(f.key)}</span>}
                        </button>
                    ))}
                </div>
                {dateFilter === 'week' && (
                    <p className="text-xs text-light agenda-week-hint">
                        Filtro &quot;Semana&quot;: próximos 7 dias corridos a partir de hoje (não é segunda a domingo).
                    </p>
                )}

                <div className="flex-col gap-3 agenda-experimental-cards">
                    {loading ? (
                        <div className="flex justify-center p-8">
                            <div className="spinner" />
                        </div>
                    ) : agendaLeads.length > 0 ? agendaLeads.map((lead, i) => {
                        const noScheduleDate = !String(lead.scheduledDate || '').trim();
                        const showNoDateWarning = noScheduleDate && dateFilter === 'all';
                        const hasPhone = String(lead.phone || '').replace(/\D/g, '').length >= 8;
                        return (
                        <div
                            key={lead.id}
                            className={`card agenda-card animate-in${showNoDateWarning ? ' agenda-card--no-date' : ''}`}
                            style={{ animationDelay: `${0.04 * i}s` }}
                        >
                            <div className="flex justify-between items-center" onClick={() => navigate(`/lead/${lead.id}`)} style={{ cursor: 'pointer' }}>
                                <div style={{ flex: 1 }}>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <strong style={{ fontSize: '1rem' }}>{lead.name}</strong>
                                        {showNoDateWarning && (
                                            <span className="agenda-no-date-badge">Sem data — defina no Remarcar</span>
                                        )}
                                    </div>
                                    <p className="text-small" style={{ marginTop: 2 }}>
                                        {lead.type || 'Adulto'} • {lead.phone}{lead.intention ? ` • ${lead.intention}` : ''}{lead.priority ? ` • ${lead.priority}` : ''}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
                                        <Clock size={14} color="var(--v500)" />
                                        <strong className="navi-ui-time">{lead.scheduledTime || '--:--'}</strong>
                                        <button
                                            className="edit-time-btn"
                                            onClick={(e) => { e.stopPropagation(); openEdit(lead); }}
                                            title="Editar agendamento"
                                            aria-label="Editar agendamento"
                                        >
                                            <Edit3 size={18} strokeWidth={2.6} />
                                        </button>
                                    </div>
                                    <span className="navi-ui-date">{noScheduleDate ? 'Definir data' : formatDate(lead.scheduledDate)}</span>
                                </div>
                            </div>

                            <div className="flex gap-2 mt-3 pt-3 border-t flex-wrap">
                                <button
                                    type="button"
                                    className="followup-action-btn flex-1"
                                    style={{ minWidth: '120px' }}
                                    disabled={!hasPhone}
                                    title={!hasPhone ? 'Cadastre um telefone válido no perfil' : 'Abrir WhatsApp com mensagem de confirmação'}
                                    onClick={(e) => { e.stopPropagation(); handleWhatsAppScheduled(lead); }}
                                >
                                    <MessageCircle size={14} color="#25D366" /> WhatsApp
                                </button>
                                <button
                                    type="button"
                                    className="followup-action-btn flex-1"
                                    style={{ minWidth: '120px' }}
                                    title="Alterar data, horário ou status"
                                    onClick={(e) => { e.stopPropagation(); openEdit(lead); }}
                                >
                                    <Calendar size={14} color="var(--accent)" /> Remarcar
                                </button>
                            </div>
                            <div className="flex gap-2 mt-2">
                                <button
                                    type="button"
                                    className="btn-success flex-1"
                                    onClick={(e) => { e.stopPropagation(); useLeadStore.getState().updateLead(lead.id, { status: LEAD_STATUS.COMPLETED, pipelineStage: 'Matriculado' }); }}
                                >
                                    <CheckCircle size={16} /> Compareceu
                                </button>
                                <button
                                    type="button"
                                    className="btn-outline flex-1"
                                    onClick={(e) => { e.stopPropagation(); useLeadStore.getState().updateLead(lead.id, { status: LEAD_STATUS.MISSED, pipelineStage: LEAD_STATUS.MISSED }); }}
                                >
                                    <XCircle size={16} /> Faltou
                                </button>
                            </div>
                        </div>
                        );
                    }) : (
                        <div className="empty-state">
                            <Calendar size={32} color="var(--text-muted)" style={{ marginBottom: 10, opacity: 0.5 }} />
                            {scheduledOutsideFilter ? (
                                <>
                                    <p>Nenhuma aula para {DAY_FILTERS.find(f => f.key === dateFilter)?.label.toLowerCase() || 'o período'}.</p>
                                    <p className="text-xs text-light mt-2" style={{ lineHeight: 1.4 }}>
                                        Existem {allScheduled.length} agendamento{allScheduled.length === 1 ? '' : 's'} em outras datas.
                                    </p>
                                    <button type="button" className="btn-secondary mt-3" onClick={() => setDateFilter('all')}>
                                        Ver todos os agendados
                                    </button>
                                </>
                            ) : (
                                <>
                                    <p>Nenhuma aula para {DAY_FILTERS.find(f => f.key === dateFilter)?.label.toLowerCase() || 'o período'}.</p>
                                    <p className="text-xs text-light mt-1">Cadastre um novo interessado para começar!</p>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </section>

            {/* Follow-ups with urgency ruler */}
            <section className="mt-6 animate-in" style={{ animationDelay: '0.2s' }}>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="navi-section-heading">Follow-ups Pendentes</h3>
                    <span className="badge badge-secondary">{followUps.length}</span>
                </div>
                <p className="text-xs text-light" style={{ marginBottom: 10, lineHeight: 1.4 }}>
                    Do mais recente para o mais antigo. Após {FOLLOWUP_AGENDA_MAX_DAYS} dias da data da aula, o follow-up sai desta lista e fica só no Kanban.
                </p>

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
                                        <p className="text-small">{lead.phone}{lead.intention ? ` • ${lead.intention}` : ''}{lead.priority ? ` • ${lead.priority}` : ''} • {urgency.label}</p>
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
                                        onClick={(e) => { e.stopPropagation(); handleWhatsApp(lead); }}
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
                            {followUpsKanbanOnlyCount > 0 && (
                                <p className="text-xs text-light mt-2">
                                    {followUpsKanbanOnlyCount} {followUpsKanbanOnlyCount === 1 ? 'interessado está' : 'interessados estão'} só no Kanban (aula há {FOLLOWUP_AGENDA_MAX_DAYS}+ dias).
                                </p>
                            )}
                        </div>
                    )}
                </div>
                {followUps.length > 0 && followUpsKanbanOnlyCount > 0 && (
                    <p className="text-xs text-light mt-2" style={{ lineHeight: 1.35 }}>
                        + {followUpsKanbanOnlyCount} no Kanban (follow-up com {FOLLOWUP_AGENDA_MAX_DAYS}+ dias desde a aula).
                    </p>
                )}
            </section>
            </div>

            {editOpen && (
                <div className="navi-modal-overlay" onClick={closeEdit}>
                    <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
                        <h3 className="navi-section-heading" style={{ marginBottom: 8 }}>Editar Agendamento</h3>
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
                            <button className="btn-outline danger-outline" onClick={removeSchedule} title="Excluir agendamento e voltar para Novo">Excluir agendamento</button>
                            <button className="btn-outline danger-outline" onClick={deleteLead} title="Excluir lead">
                                <Trash2 size={14} /> Excluir lead
                            </button>
                            <button className="btn-outline" onClick={closeEdit}>Cancelar</button>
                            <button className="btn-secondary" onClick={saveEdit}>Salvar</button>
                        </div>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
        .reception-agenda-inner {
          width: 100%;
          max-width: 720px;
          margin-left: auto;
          margin-right: auto;
        }
        .agenda-kpi-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }
        @media (max-width: 700px) {
          .agenda-kpi-grid { grid-template-columns: 1fr; }
        }
        .agenda-kpi-card {
          position: relative;
          padding: 18px 18px 16px;
          border-radius: 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          box-shadow: 0 1px 2px rgba(18, 16, 42, 0.04), 0 8px 28px rgba(91, 63, 191, 0.07);
          transition: transform 0.2s ease, box-shadow 0.22s ease, border-color 0.2s ease;
          overflow: hidden;
        }
        .agenda-kpi-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, var(--v500), rgba(124, 99, 214, 0.95));
          border-radius: 16px 16px 0 0;
          opacity: 0.9;
        }
        .agenda-kpi-card:hover {
          transform: translateY(-3px);
          border-color: rgba(91, 63, 191, 0.22);
          box-shadow: 0 4px 12px rgba(18, 16, 42, 0.06), 0 16px 40px rgba(91, 63, 191, 0.12);
        }
        @media (prefers-reduced-motion: reduce) {
          .agenda-kpi-card { transition: none; }
          .agenda-kpi-card:hover { transform: none; }
        }
        .agenda-kpi-label {
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--text-secondary);
          margin-bottom: 10px;
          line-height: 1.35;
          padding-right: 4px;
        }
        .agenda-kpi-value {
          font-size: clamp(1.75rem, 4vw, 2.125rem);
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          line-height: 1.05;
          color: var(--v500);
          letter-spacing: -0.03em;
        }
        .agenda-kpi-trend {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px 8px;
          margin-top: 12px;
          font-size: 0.8125rem;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
        .agenda-kpi-trend.is-up { color: var(--success-text); }
        .agenda-kpi-trend.is-down { color: var(--danger); }
        .agenda-kpi-trend-hint {
          width: 100%;
          flex-basis: 100%;
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          color: var(--text-secondary);
          opacity: 0.75;
          margin-top: 2px;
        }
        .hub-quick-row {
          display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px;
        }
        @media (max-width: 900px) { .hub-quick-row { grid-template-columns: 1fr; } }
        .hub-quick-card {
          text-align: left; padding: 14px 16px; cursor: pointer; border: 1.5px solid var(--border);
          background: var(--surface); border-radius: var(--radius); transition: var(--transition);
          display: flex; flex-direction: column; gap: 4px; font-family: inherit;
        }
        .hub-quick-card:hover { border-color: var(--accent); box-shadow: var(--shadow); }
        .hub-quick-label { font-size: 0.78rem; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.03em; }
        .hub-quick-count { font-size: 1.5rem; font-weight: 800; color: var(--text); }
        .hub-quick-arrow { font-size: 0.95rem; font-weight: 800; color: var(--accent); }
        .hub-quick-sub { font-size: 0.72rem; color: var(--text-muted); font-weight: 600; }
        .agenda-experimental-filter-strip {
          margin-bottom: 20px;
        }
        .agenda-week-hint {
          margin: 0 0 14px;
          line-height: 1.35;
          color: var(--text-secondary);
        }
        .agenda-experimental-cards {
          margin-top: 2px;
        }
        .reception-agenda-inner .agenda-card.card {
          position: relative;
          border-radius: 16px;
          padding: 18px 18px 16px;
          border: 1px solid var(--border);
          border-left: 4px solid var(--accent);
          box-shadow:
            0 1px 2px rgba(18, 16, 42, 0.05),
            0 10px 32px rgba(91, 63, 191, 0.08);
          overflow: hidden;
          transition: transform 0.2s ease, box-shadow 0.22s ease, border-color 0.2s ease;
        }
        .reception-agenda-inner .agenda-card.card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, var(--v500), rgba(124, 99, 214, 0.75));
          opacity: 0.7;
          pointer-events: none;
          border-radius: 16px 16px 0 0;
        }
        .reception-agenda-inner .agenda-card.card:hover {
          transform: translateY(-2px);
          border-color: rgba(91, 63, 191, 0.22);
          box-shadow:
            0 4px 14px rgba(18, 16, 42, 0.07),
            0 16px 40px rgba(91, 63, 191, 0.12);
        }
        @media (prefers-reduced-motion: reduce) {
          .reception-agenda-inner .agenda-card.card { transition: none; }
          .reception-agenda-inner .agenda-card.card:hover { transform: none; }
        }
        .agenda-card--no-date {
          border-left-color: var(--warning);
        }
        .reception-agenda-inner .agenda-card--no-date.card::before {
          background: linear-gradient(90deg, #d97706, #fbbf24);
          opacity: 0.55;
        }
        .agenda-no-date-badge {
          font-size: 0.65rem; font-weight: 800; padding: 2px 8px; border-radius: var(--radius-full);
          background: var(--warning-light); color: #b45309; text-transform: uppercase; letter-spacing: 0.02em;
        }
        .follow-card { border-left: 4px solid var(--warning); }
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
        .followup-action-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .followup-action-btn:disabled:hover { border-color: var(--border-light); color: var(--text-secondary); }
        .reception-agenda-inner .agenda-card.card .border-t {
          border-top: 1px solid rgba(91, 63, 191, 0.09);
        }
        .reception-agenda-inner .followup-action-btn {
          border-radius: 10px;
          min-height: 38px;
          font-weight: 700;
        }
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
          background: var(--v500); color: #fff;
          display: inline-flex; align-items: center; justify-content: center;
          border: none; cursor: pointer;
          padding: 0; min-height: auto; flex: 0 0 32px;
          box-shadow: 0 4px 14px rgba(91, 63, 191, 0.28);
          transition: transform .12s ease, filter .12s ease, box-shadow .2s ease;
        }
        .edit-time-btn svg { display: block; color: #fff; stroke: currentColor; fill: none; }
        .edit-time-btn:hover { filter: brightness(0.96); }
        .edit-time-btn:active { transform: translateY(1px); }
        .edit-time-btn:focus-visible { outline: 2px solid var(--v500); outline-offset: 2px; box-shadow: 0 0 0 4px rgba(91, 63, 191, 0.2); }
        .agenda-mini-btn {
          width: 32px; height: 32px; border-radius: 50%;
          display: inline-flex; align-items: center; justify-content: center;
          padding: 0; min-height: auto;
          background: var(--surface); border: 1.5px solid var(--border);
          color: var(--text-secondary);
          transition: var(--transition);
        }
        .agenda-mini-btn svg { display: block; }
        .agenda-mini-btn:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
        .agenda-mini-btn:active { transform: translateY(1px); }
        .agenda-mini-btn.danger { border-color: var(--danger); color: var(--danger); }
        .agenda-mini-btn.danger:hover { background: var(--danger-light); }
        .agenda-mini-btn.lost { border-color: var(--warning); color: var(--warning); }
        .agenda-mini-btn.lost:hover { background: var(--warning-light); }
        .edit-modal {
          background: var(--surface); border-radius: var(--radius); width: 92%; max-width: 420px;
          padding: 16px; box-shadow: var(--shadow-lg); border: 0.5px solid var(--border-violet);
        }
        .edit-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 12px; flex-wrap: wrap; }
        @media (max-width: 460px) {
          .edit-actions { flex-direction: column; align-items: stretch; }
          .edit-actions button { width: 100%; }
        }
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
