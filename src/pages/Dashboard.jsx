import React, { useState } from 'react';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import { useNavigate } from 'react-router-dom';
import { Plus, CheckCircle, XCircle, Calendar, Clock, ChevronRight, AlertTriangle, MessageCircle, RefreshCcw, Zap } from 'lucide-react';

const DAY_FILTERS = [
    { key: 'today', label: 'Hoje' },
    { key: 'tomorrow', label: 'Amanhã' },
    { key: 'week', label: 'Semana' },
    { key: 'all', label: 'Todos' },
];

const Dashboard = () => {
    const navigate = useNavigate();
    const { leads, loading, fetchLeads, academyId } = useLeadStore();
    const [dateFilter, setDateFilter] = useState('all');
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Fetch leads on mount if not already loaded or if returning to dashboard
    React.useEffect(() => {
        if (academyId) {
            fetchLeads();
        }
    }, [academyId]);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await fetchLeads();
        setIsRefreshing(false);
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + 7);

    // Agenda with date filter
    const allScheduled = (leads || [])
        .filter(l => l.status === LEAD_STATUS.SCHEDULED)
        .sort((a, b) => {
            const dateA = new Date(a.scheduledDate || a.createdAt);
            const dateB = new Date(b.scheduledDate || b.createdAt);
            if (isNaN(dateA)) return 1;
            if (isNaN(dateB)) return -1;
            return dateA - dateB;
        });

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
        if (days >= 5) return { level: 'critical', label: '⚠️ Urgente', color: 'var(--danger)' };
        if (days >= 3) return { level: 'high', label: '🔴 Atenção', color: 'var(--warning)' };
        if (days >= 1) return { level: 'medium', label: '🟡 Acompanhar', color: 'var(--accent)' };
        return { level: 'low', label: '🟢 Recente', color: 'var(--success)' };
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
        const msg = encodeURIComponent(`Olá ${name}! Tudo bem? 😊 Estamos entrando em contato sobre sua aula experimental. Podemos conversar?`);
        window.open(`https://wa.me/55${cleanPhone}?text=${msg}`, '_blank');
    };

    return (
        <div className="container" style={{ paddingTop: 20, paddingBottom: 20 }}>
            <div className="animate-in">
                <h1 style={{ fontSize: '1.5rem', marginBottom: 2 }}>Agenda da Recepção</h1>
                <p className="text-small">Controle de aulas experimentais e retornos</p>
            </div>

            <button className="btn-secondary btn-large mt-4" onClick={() => navigate('/new-lead')} style={{ borderRadius: 'var(--radius)' }}>
                <Plus size={22} /> Novo Interessado
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
                        🔔 Follow-ups Pendentes
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
                            <p>Nada pendente por agora. 🎉</p>
                        </div>
                    )}
                </div>
            </section>

            {/* Diagnostics (Shown if agenda is empty to help debug) */}
            {agendaLeads.length === 0 && (
                <section className="mt-8 p-5 animate-in" style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 16 }}>
                    <div className="flex items-center gap-2 mb-4" style={{ color: 'var(--text-secondary)' }}>
                        <Zap size={18} color="var(--accent)" />
                        <strong style={{ fontSize: '1rem' }}>Painel de Suporte</strong>
                    </div>

                    <div className="flex-col gap-3">
                        <div className="flex justify-between items-center py-2 border-b" style={{ borderColor: '#e2e8f0' }}>
                            <span className="text-small">Academia ID:</span>
                            <span className="text-xs font-mono" style={{ background: '#cbd5e1', padding: '2px 6px', borderRadius: 4 }}>
                                {academyId?.slice(-8) || 'Não definido'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b" style={{ borderColor: '#e2e8f0' }}>
                            <span className="text-small">Total no Sistema:</span>
                            <strong className="text-small">{leads.length} interessados</strong>
                        </div>

                        {leads.length > 0 && (
                            <div className="mt-3">
                                <p className="text-xs mb-2" style={{ fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Últimos cadastros (Qualquer status):</p>
                                <div className="flex-col gap-1" style={{ maxHeight: 150, overflowY: 'auto' }}>
                                    {[...leads].slice(0, 8).map(l => (
                                        <div key={l.id} className="flex justify-between py-1 text-xs border-b last:border-0" style={{ borderColor: '#e2e8f0' }}>
                                            <div className="flex-col">
                                                <span>{l.name}</span>
                                                <span className="text-muted" style={{ fontSize: '0.6rem' }}>{l.scheduledDate || 'Sem data'} {l.scheduledTime}</span>
                                            </div>
                                            <span className={`badge ${l.status === LEAD_STATUS.SCHEDULED ? 'badge-primary' : 'badge-secondary'}`} style={{ height: 18, fontSize: '0.65rem' }}>
                                                {l.status || 'Sem status'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="mt-4 p-3 bg-white" style={{ borderRadius: 8, border: '1px solid #e2e8f0' }}>
                            <p className="text-xs" style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                {leads.length === 0
                                    ? "Nenhum dado encontrado. Clique no botão abaixo para tentar forçar uma nova busca na nuvem."
                                    : "Se o interessado aparece na lista acima mas não na agenda, verifique se ele foi salvo como 'Agendado'."}
                            </p>
                            <button
                                className="btn-secondary w-full mt-3"
                                style={{ minHeight: 44, fontSize: '0.85rem' }}
                                onClick={handleRefresh}
                            >
                                Sincronizar Agora 🔄
                            </button>
                        </div>
                    </div>
                </section>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
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
      `}} />
        </div>
    );
};

export default Dashboard;
