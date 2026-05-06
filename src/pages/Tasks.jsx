import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import { useLeadStore } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { teams } from '../lib/appwrite';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckSquare, PlusCircle, Pencil, Trash2, Calendar, User, X, ClipboardList, LayoutList, Kanban, CalendarDays, AlertTriangle } from 'lucide-react';

const VIEW_STORAGE_KEY = 'nave_tasks_view';

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Segunda-feira 00:00 local da semana que contém `ref`. */
function startOfWeekMondayLocal(ref = new Date()) {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function isDueInCurrentWeek(dueStr) {
  if (!dueStr || !String(dueStr).trim()) return false;
  const mon = startOfWeekMondayLocal();
  const ymdDue = String(dueStr).trim().slice(0, 10);
  const due = new Date(ymdDue.length === 10 ? `${ymdDue}T00:00:00` : ymdDue);
  const dDue = new Date(due.getFullYear(), due.getMonth(), due.getDate(), 0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const dSun = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate(), 0, 0, 0, 0);
  return dDue.getTime() >= mon.getTime() && dDue.getTime() <= dSun.getTime();
}

export default function Tasks() {
  const navigate = useNavigate();
  const { academyId, teamId, leads } = useLeadStore();
  const { tasks, loading, error, filters, setFilter, fetchTasks, createTask, updateTask, deleteTask } = useTaskStore();
  const addToast = useUiStore((s) => s.addToast);

  const [searchParams] = useSearchParams();
  const initLeadId = searchParams.get('lead_id') || '';
  const initNew = searchParams.get('new') === '1';

  const [members, setMembers] = useState([]);
  const [showModal, setShowModal] = useState(initNew);
  const [editingTask, setEditingTask] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', due_date: '', assigned_to: '', lead_id: initLeadId });
  const [saving, setSaving] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');
  const [showLeadDrop, setShowLeadDrop] = useState(false);
  const leadDropRef = useRef(null);

  const [viewMode, setViewMode] = useState(() => {
    try {
      const v = localStorage.getItem(VIEW_STORAGE_KEY);
      if (v === 'kanban' || v === 'calendar') return v;
      return 'list';
    } catch {
      return 'list';
    }
  });
  const [estaSemanaOn, setEstaSemanaOn] = useState(false);
  const [detailTask, setDetailTask] = useState(null);
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  // Sincronizar filtro ao carregar a página se tiver lead_id na URL
  useEffect(() => {
    if (initLeadId && filters.lead_id !== initLeadId) {
      setFilter('lead_id', initLeadId);
    }
  }, [initLeadId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch team members for the dropdown
  useEffect(() => {
    if (!teamId) return;
    teams.listMemberships(teamId)
      .then(res => {
        setMembers(res.memberships || []);
      })
      .catch(e => console.error('Erro ao buscar membros', e));
  }, [teamId]);

  // Fetch tasks
  useEffect(() => {
    if (academyId) fetchTasks(academyId);
  }, [academyId, fetchTasks]);

  useEffect(() => {
    if (!showLeadDrop) return;
    const handler = (e) => {
      if (leadDropRef.current && !leadDropRef.current.contains(e.target)) setShowLeadDrop(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showLeadDrop]);

  useEffect(() => {
    if (!detailTask) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setDetailTask(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailTask]);

  function isVencida(dateStr) {
    if (!dateStr) return false;
    const due = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr).getTime();
    const now = new Date().setHours(0,0,0,0);
    return due < now;
  }

  const filteredTasksBase = useMemo(() => {
    const userId = useLeadStore.getState().userId;
    return tasks.filter(t => {
      if (filters.status === 'minhas' && t.assigned_to !== userId) return false;
      if (filters.status === 'vencidas' && (t.status === 'done' || !isVencida(t.due_date))) return false;
      if (filters.status === 'concluidas' && t.status !== 'done') return false;
      if (filters.lead_id && t.lead_id !== filters.lead_id) return false;
      return true;
    });
  }, [tasks, filters.status, filters.lead_id]);

  const filteredTasks = useMemo(() => {
    if (!estaSemanaOn) return filteredTasksBase;
    return filteredTasksBase.filter((t) => isDueInCurrentWeek(t.due_date));
  }, [filteredTasksBase, estaSemanaOn]);

  const semPrazoExcluidasCount = useMemo(
    () => filteredTasksBase.filter((t) => !t.due_date || !String(t.due_date).trim()).length,
    [filteredTasksBase]
  );

  const semPrazoTasksForCalendar = useMemo(
    () => filteredTasksBase.filter((t) => !t.due_date || !String(t.due_date).trim()),
    [filteredTasksBase]
  );

  const tasksByDueYmd = useMemo(() => {
    const map = {};
    for (const t of filteredTasks) {
      const raw = String(t.due_date || '').trim().slice(0, 10);
      if (!raw || raw.length < 10) continue;
      if (!map[raw]) map[raw] = [];
      map[raw].push(t);
    }
    return map;
  }, [filteredTasks]);

  const kanbanColumns = useMemo(() => {
    const atrasadas = [];
    const aFazer = [];
    const concluidas = [];
    filteredTasks.forEach((t) => {
      if (t.status === 'done') {
        concluidas.push(t);
      } else if (isVencida(t.due_date)) {
        atrasadas.push(t);
      } else {
        aFazer.push(t);
      }
    });
    return { atrasadas, aFazer, concluidas };
  }, [filteredTasks]);

  const calMatrix = useMemo(() => {
    const first = new Date(calMonth.y, calMonth.m, 1);
    const firstDow = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(calMonth.y, calMonth.m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [calMonth.y, calMonth.m]);

  const calMonthLabel = useMemo(
    () =>
      new Date(calMonth.y, calMonth.m, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    [calMonth.y, calMonth.m]
  );

  function shiftCalMonth(delta) {
    setCalMonth((prev) => {
      const d = new Date(prev.y, prev.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  function detailStatusMeta(t) {
    if (t.status === 'done') return { label: 'Concluída', cls: 'task-drawer-badge--done' };
    if (isVencida(t.due_date)) return { label: 'Atrasada', cls: 'task-drawer-badge--late' };
    return { label: 'Pendente', cls: 'task-drawer-badge--pending' };
  }

  const groupedTasks = useMemo(() => {
    const vencidas = [];
    const pendentes = [];
    const concluidas = [];
    
    filteredTasks.forEach(t => {
      if (t.status === 'done') {
        concluidas.push(t);
      } else if (isVencida(t.due_date)) {
        vencidas.push(t);
      } else {
        pendentes.push(t);
      }
    });
    
    return { vencidas, pendentes, concluidas };
  }, [filteredTasks]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      addToast({ type: 'error', message: 'Título é obrigatório' });
      return;
    }
    
    setSaving(true);
    try {
      let leadName = '';
      if (form.lead_id) {
        const lead = leads.find(l => l.id === form.lead_id);
        if (lead) leadName = lead.name;
      }
      
      const payload = { ...form, lead_name: leadName };
      
      if (editingTask) {
        await updateTask(editingTask.id, payload);
        addToast({ type: 'success', message: 'Tarefa atualizada' });
      } else {
        await createTask(payload);
        addToast({ type: 'success', message: 'Tarefa criada' });
      }
      setShowModal(false);
    } catch (err) {
      addToast({ type: 'error', message: 'Erro ao salvar tarefa' });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (t) => {
    setEditingTask(t);
    setForm({
      title: t.title || '',
      description: t.description || '',
      due_date: t.due_date || '',
      assigned_to: t.assigned_to || '',
      lead_id: t.lead_id || ''
    });
    const lead = leads.find(l => l.id === t.lead_id);
    setLeadSearch(lead ? lead.name : '');
    setShowModal(true);
  };

  const openEditFromDetail = () => {
    const t = detailTask;
    setDetailTask(null);
    if (t) openEdit(t);
  };

  const openNew = () => {
    setEditingTask(null);
    setForm({ title: '', description: '', due_date: '', assigned_to: '', lead_id: filters.lead_id || '' });
    setLeadSearch('');
    setShowModal(true);
  };

  const toggleDone = async (t) => {
    const newStatus = t.status === 'done' ? 'pending' : 'done';
    try {
      await updateTask(t.id, { status: newStatus });
    } catch (e) {
      addToast({ type: 'error', message: 'Erro ao atualizar status' });
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir esta tarefa?')) return;
    try {
      await deleteTask(id);
      if (detailTask?.id === id) setDetailTask(null);
      addToast({ type: 'success', message: 'Tarefa excluída' });
    } catch (e) {
      addToast({ type: 'error', message: 'Erro ao excluir' });
    }
  };

  const renderOneTaskCard = (t, opts = {}) => {
    const compact = Boolean(opts.compact);
    const vencida = isVencida(t.due_date) && t.status !== 'done';
    return (
      <div
        key={t.id}
        className={`task-card ${compact ? 'task-card--compact' : ''} ${t.status === 'done' ? 'done' : ''}`}
      >
        <input
          type="checkbox"
          checked={t.status === 'done'}
          onChange={() => toggleDone(t)}
          className="task-checkbox"
          onClick={(e) => e.stopPropagation()}
        />
        <div
          className="task-content"
          role="button"
          tabIndex={0}
          onClick={() => setDetailTask(t)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setDetailTask(t);
            }
          }}
        >
          <span className={`task-title ${t.status === 'done' ? 'line-through' : ''}`}>{t.title}</span>
          {!compact ? (
            <div className="task-meta">
              {t.lead_id ? (
                <span
                  className="task-badge lead-badge"
                  role="link"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/lead/${t.lead_id}`);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.stopPropagation();
                      navigate(`/lead/${t.lead_id}`);
                    }
                  }}
                >
                  <User size={12} /> {t.lead_name || 'Aluno'}
                </span>
              ) : null}
              {t.due_date ? (
                <span className={`task-badge ${vencida ? 'text-danger' : ''}`}>
                  <Calendar size={12} /> {new Date(t.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                </span>
              ) : null}
              {t.assigned_to ? (
                <span
                  className="task-badge assign-badge"
                  title={members.find((m) => m.userId === t.assigned_to)?.userName || t.assigned_to}
                >
                  {(members.find((m) => m.userId === t.assigned_to)?.userName || t.assigned_to)
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="task-actions dropdown-container" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="task-action-btn" onClick={() => openEdit(t)}>
            <Pencil size={14} />
          </button>
          <button type="button" className="task-action-btn text-danger" onClick={() => handleDelete(t.id)}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    );
  };

  const renderTasksLoadingSkeleton = () => (
    <div
      className="tasks-skeleton-root"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Carregando tarefas"
    >
      <span className="tasks-skeleton-sr">Carregando tarefas…</span>
      {[0, 1].map((section) => (
        <div key={section} className="tasks-skeleton-section">
          <div className="tasks-skeleton-group-title" aria-hidden />
          <div className="tasks-skeleton-list">
            {[0, 1, 2].map((row) => (
              <div key={`${section}-${row}`} className="tasks-skeleton-card" aria-hidden>
                <div className="tasks-skeleton-check" />
                <div className="tasks-skeleton-body">
                  <div className="tasks-skeleton-line tasks-skeleton-line--title" />
                  <div className={`tasks-skeleton-line tasks-skeleton-line--sub ${row % 2 === 1 ? 'tasks-skeleton-line--short' : ''}`} />
                  <div className="tasks-skeleton-badges">
                    <span className="tasks-skeleton-pill" />
                    <span className="tasks-skeleton-pill tasks-skeleton-pill--narrow" />
                  </div>
                </div>
                <div className="tasks-skeleton-actions">
                  <span className="tasks-skeleton-icon" />
                  <span className="tasks-skeleton-icon" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const renderTaskList = (list, title, titleColor) => {
    if (list.length === 0) return null;
    return (
      <div className="task-group">
        <h3 className="task-group-title" style={{ color: titleColor }}>{title} ({list.length})</h3>
        <div className="task-list">
          {list.map((t) => renderOneTaskCard(t))}
        </div>
      </div>
    );
  };

  function formatCreatedByLabel(task) {
    const raw = String(task?.created_by || '').trim();
    if (!raw) return '—';
    const creator = members.find(
      (m) => String(m.userId) === raw || String(m.id) === raw
    );
    return creator?.userName ?? creator?.name ?? creator?.userEmail ?? creator?.email ?? raw;
  }

  return (
    <div className="container" style={{ paddingTop: 20, paddingBottom: 30 }}>
      <header className="animate-in">
        <div className="tasks-page-head-top flex flex-wrap justify-between items-center gap-3 mb-3">
          <h1 className="navi-page-title flex items-center gap-2 mb-0"><CheckSquare size={24} /> Tarefas</h1>
          <button type="button" className="btn-primary" onClick={openNew}>
            <PlusCircle size={16} /> Nova tarefa
          </button>
        </div>

        <div className="tasks-view-toggle flex flex-wrap gap-2 mb-3" role="group" aria-label="Visualização">
          <button
            type="button"
            className={`tasks-view-btn ${viewMode === 'list' ? 'tasks-view-btn--active' : ''}`}
            onClick={() => setViewMode('list')}
          >
            <LayoutList size={18} strokeWidth={2} /> Lista
          </button>
          <button
            type="button"
            className={`tasks-view-btn ${viewMode === 'kanban' ? 'tasks-view-btn--active' : ''}`}
            onClick={() => setViewMode('kanban')}
          >
            <Kanban size={18} strokeWidth={2} /> Kanban
          </button>
          <button
            type="button"
            className={`tasks-view-btn ${viewMode === 'calendar' ? 'tasks-view-btn--active' : ''}`}
            onClick={() => setViewMode('calendar')}
          >
            <CalendarDays size={18} strokeWidth={2} /> Calendário
          </button>
        </div>
        
        <div className="task-filters">
          {['all', 'minhas', 'vencidas', 'concluidas'].map(f => (
            <button 
              key={f}
              type="button" 
              className={`filter-pill ${filters.status === f ? 'active' : ''}`}
              onClick={() => setFilter('status', f)}
            >
              {f === 'all' ? 'Todas' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <button
            type="button"
            className={`filter-pill ${estaSemanaOn ? 'active' : ''}`}
            onClick={() => setEstaSemanaOn((v) => !v)}
          >
            Esta semana
          </button>
          {filters.lead_id && (
            <button 
              type="button" 
              className="filter-pill active"
              onClick={() => {
                setFilter('lead_id', null);
                searchParams.delete('lead_id');
                searchParams.delete('new');
                navigate('/tarefas');
              }}
            >
              Aluno: {leads.find(l => l.id === filters.lead_id)?.name || 'Desconhecido'} ✕
            </button>
          )}
        </div>
        {estaSemanaOn && semPrazoExcluidasCount > 0 ? (
          <p className="task-week-hint text-muted text-sm mt-2 mb-0" style={{ lineHeight: 1.45 }}>
            {semPrazoExcluidasCount} {semPrazoExcluidasCount === 1 ? 'tarefa sem prazo definido não aparece' : 'tarefas sem prazo definido não aparecem'} neste filtro.
          </p>
        ) : null}
      </header>

      {error ? (
        <div className="dashboard-error-banner mt-3">
          <span>{error}</span>
          <button type="button" className="btn-secondary" onClick={() => fetchTasks(academyId, { reset: true })}>Tentar novamente</button>
        </div>
      ) : null}

      {tasks.length >= 500 ? (
        <div className="tasks-limit-notice" role="status">
          <AlertTriangle className="tasks-limit-notice__icon" size={18} strokeWidth={2} aria-hidden />
          <span>
            Exibindo 500 tarefas — o limite máximo. Use os filtros para encontrar o que precisa.
          </span>
        </div>
      ) : null}

      <div className={`tasks-board mt-4${loading && tasks.length === 0 ? ' tasks-board--loading' : ''}`}>
        {loading && tasks.length === 0 ? (
          renderTasksLoadingSkeleton()
        ) : tasks.length === 0 ? (
          <div className="empty-state">
            <CheckSquare size={48} color="var(--border-mid)" />
            <p>Nenhuma tarefa por aqui ainda</p>
            <button type="button" className="btn-secondary mt-3" onClick={openNew}>+ Nova tarefa</button>
          </div>
        ) : filteredTasks.length === 0 && viewMode !== 'calendar' ? (
          <p className="text-muted mt-4">Nenhuma tarefa corresponde a este filtro.</p>
        ) : viewMode === 'list' ? (
          <div className="tasks-lists-wrap">
            {renderTaskList(groupedTasks.vencidas, 'Vencidas', 'var(--danger)')}
            {renderTaskList(groupedTasks.pendentes, 'Pendentes', 'var(--text)')}
            {renderTaskList(groupedTasks.concluidas, 'Concluídas', 'var(--success)')}
          </div>
        ) : viewMode === 'kanban' ? (
          <div className="tasks-kanban">
            <div className="tasks-kanban-col tasks-kanban-col--late">
              <div className="tasks-kanban-col-head">
                <span className="tasks-kanban-col-title">Atrasadas</span>
                <span className="tasks-kanban-badge">{kanbanColumns.atrasadas.length}</span>
              </div>
              <div className="tasks-kanban-col-body task-list">
                {kanbanColumns.atrasadas.map((t) => renderOneTaskCard(t))}
              </div>
            </div>
            <div className="tasks-kanban-col tasks-kanban-col--todo">
              <div className="tasks-kanban-col-head">
                <span className="tasks-kanban-col-title">A fazer</span>
                <span className="tasks-kanban-badge">{kanbanColumns.aFazer.length}</span>
              </div>
              <div className="tasks-kanban-col-body task-list">
                {kanbanColumns.aFazer.map((t) => renderOneTaskCard(t))}
              </div>
            </div>
            <div className="tasks-kanban-col tasks-kanban-col--done">
              <div className="tasks-kanban-col-head">
                <span className="tasks-kanban-col-title">Concluídas</span>
                <span className="tasks-kanban-badge">{kanbanColumns.concluidas.length}</span>
              </div>
              <div className="tasks-kanban-col-body task-list">
                {kanbanColumns.concluidas.map((t) => renderOneTaskCard(t))}
              </div>
            </div>
          </div>
        ) : (
          <div className="tasks-cal-layout">
            <div className="tasks-cal-main">
              <div className="tasks-cal-toolbar flex flex-wrap justify-between items-center gap-2 mb-3">
                <button type="button" className="btn-secondary" onClick={() => shiftCalMonth(-1)}>
                  Mês anterior
                </button>
                <span className="tasks-cal-month-label">{calMonthLabel}</span>
                <button type="button" className="btn-secondary" onClick={() => shiftCalMonth(1)}>
                  Próximo mês
                </button>
              </div>
              <div className="tasks-cal-weekdays">
                {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((w) => (
                  <div key={w} className="tasks-cal-weekday">
                    {w}
                  </div>
                ))}
              </div>
              <div className="tasks-cal-grid">
                {calMatrix.map((cell, idx) => {
                  if (cell === null) {
                    return <div key={`e-${idx}`} className="tasks-cal-cell tasks-cal-cell--empty" />;
                  }
                  const ymd = `${calMonth.y}-${pad2(calMonth.m + 1)}-${pad2(cell)}`;
                  const now = new Date();
                  const isToday =
                    cell === now.getDate() &&
                    calMonth.m === now.getMonth() &&
                    calMonth.y === now.getFullYear();
                  const dayTasks = tasksByDueYmd[ymd] || [];
                  return (
                    <div
                      key={ymd}
                      className={`tasks-cal-cell ${isToday ? 'tasks-cal-cell--today' : ''}`}
                    >
                      <div className="tasks-cal-day-num">{cell}</div>
                      <div className="tasks-cal-day-tasks">
                        {dayTasks.map((t) => renderOneTaskCard(t, { compact: true }))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <section className="tasks-cal-semprazo" aria-label="Tarefas sem prazo">
              <h4 className="tasks-cal-semprazo-title">Sem prazo</h4>
              {semPrazoTasksForCalendar.length === 0 ? (
                <p className="text-muted text-sm mb-0">Nenhuma tarefa sem prazo neste filtro.</p>
              ) : (
                <div className="tasks-cal-semprazo-grid">
                  {semPrazoTasksForCalendar.map((t) => renderOneTaskCard(t, { compact: true }))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {showModal && (
        <div
          role="presentation"
          className="task-modal-overlay"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) setShowModal(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="task-modal-panel"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho */}
            <div className="task-modal-header">
              <div className="task-modal-title-row">
                <div className="task-modal-icon-wrap">
                  <ClipboardList size={16} />
                </div>
                <span className="task-modal-title">
                  {editingTask ? 'Editar tarefa' : 'Nova tarefa'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => !saving && setShowModal(false)}
                aria-label="Fechar"
                className="task-modal-close"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSave} className="task-modal-form">
              {/* Título */}
              <div className="task-field">
                <label className="task-field-label">Título <span className="task-field-required">*</span></label>
                <input
                  type="text"
                  className="form-input"
                  value={form.title}
                  onChange={e => setForm({...form, title: e.target.value})}
                  placeholder="Ex: Ligar para confirmar aula experimental"
                  autoFocus
                  required
                />
              </div>

              {/* Descrição */}
              <div className="task-field">
                <label className="task-field-label">Descrição</label>
                <textarea
                  className="form-input task-textarea"
                  rows={3}
                  value={form.description}
                  onChange={e => setForm({...form, description: e.target.value})}
                  placeholder="Detalhes opcionais..."
                />
              </div>

              {/* Prazo + Responsável — grid 2 colunas */}
              <div className="task-field-row">
                <div className="task-field">
                  <label className="task-field-label">Prazo</label>
                  <input
                    type="date"
                    className="form-input"
                    value={form.due_date}
                    onChange={e => setForm({...form, due_date: e.target.value})}
                  />
                </div>
                <div className="task-field">
                  <label className="task-field-label">Responsável</label>
                  <select
                    className="form-input task-select"
                    value={form.assigned_to}
                    onChange={e => setForm({...form, assigned_to: e.target.value})}
                  >
                    <option value="">Sem responsável</option>
                    {members.map(m => (
                      <option key={m.userId} value={m.userId}>{m.userName}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Vincular aluno / lead */}
              <div className="task-field" ref={leadDropRef} style={{ position: 'relative' }}>
                <label className="task-field-label">Vincular aluno / lead</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="form-input"
                    value={leadSearch}
                    onChange={e => {
                      setLeadSearch(e.target.value);
                      setForm(f => ({ ...f, lead_id: '' }));
                      setShowLeadDrop(true);
                    }}
                    onFocus={() => setShowLeadDrop(true)}
                    placeholder="Buscar por nome..."
                    autoComplete="off"
                    style={form.lead_id ? { paddingRight: 32 } : {}}
                  />
                  {form.lead_id && (
                    <button
                      type="button"
                      onClick={() => { setForm(f => ({ ...f, lead_id: '' })); setLeadSearch(''); }}
                      className="task-lead-clear"
                      aria-label="Limpar"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                {showLeadDrop && (
                  <div className="task-lead-drop">
                    {leads
                      .filter(l => !leadSearch || l.name?.toLowerCase().includes(leadSearch.toLowerCase()))
                      .slice(0, 20)
                      .map(l => (
                        <button
                          key={l.id}
                          type="button"
                          className="task-lead-option"
                          onMouseDown={() => {
                            setForm(f => ({ ...f, lead_id: l.id }));
                            setLeadSearch(l.name);
                            setShowLeadDrop(false);
                          }}
                        >
                          <span className="task-lead-name">{l.name}</span>
                          <span className="task-lead-phone">{l.phone || ''}</span>
                        </button>
                      ))
                    }
                    {leads.filter(l => !leadSearch || l.name?.toLowerCase().includes(leadSearch.toLowerCase())).length === 0 && (
                      <p className="task-lead-empty">Nenhum resultado</p>
                    )}
                  </div>
                )}
              </div>

              {/* Ações */}
              <div className="task-modal-footer">
                <button type="button" className="btn-outline" onClick={() => setShowModal(false)} disabled={saving}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Salvando...' : editingTask ? 'Salvar alterações' : 'Criar tarefa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detailTask ? (
        <>
          <div
            role="presentation"
            className="task-drawer-backdrop"
            onMouseDown={() => setDetailTask(null)}
          />
          <aside className="task-drawer-panel" aria-labelledby="task-drawer-heading">
            <div className="task-drawer-header">
              <h2 id="task-drawer-heading" className="task-drawer-heading">
                Detalhes da tarefa
              </h2>
              <button
                type="button"
                className="task-drawer-close"
                aria-label="Fechar"
                onClick={() => setDetailTask(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="task-drawer-body">
              <div className="task-drawer-field">
                <span className="task-drawer-label">Título</span>
                <p className="task-drawer-value">{detailTask.title || '—'}</p>
              </div>
              <div className="task-drawer-field">
                <span className="task-drawer-label">Descrição</span>
                <p className="task-drawer-value task-drawer-value--multiline">
                  {String(detailTask.description || '').trim() ? detailTask.description : 'Sem descrição'}
                </p>
              </div>
              <div className="task-drawer-field">
                <span className="task-drawer-label">Status</span>
                <div>
                  <span className={`task-drawer-badge ${detailStatusMeta(detailTask).cls}`}>
                    {detailStatusMeta(detailTask).label}
                  </span>
                </div>
              </div>
              <div className="task-drawer-field">
                <span className="task-drawer-label">Prazo</span>
                <p className="task-drawer-value">
                  {detailTask.due_date && String(detailTask.due_date).trim()
                    ? new Date(String(detailTask.due_date).slice(0, 10) + 'T00:00:00').toLocaleDateString('pt-BR')
                    : 'Sem prazo'}
                </p>
              </div>
              <div className="task-drawer-field">
                <span className="task-drawer-label">Responsável</span>
                <p className="task-drawer-value">
                  {detailTask.assigned_to
                    ? members.find((m) => m.userId === detailTask.assigned_to)?.userName ||
                      detailTask.assigned_to
                    : '—'}
                </p>
              </div>
              <div className="task-drawer-field">
                <span className="task-drawer-label">Lead vinculado</span>
                {detailTask.lead_id ? (
                  <button
                    type="button"
                    className="task-drawer-link"
                    onClick={() => {
                      setDetailTask(null);
                      navigate(`/lead/${detailTask.lead_id}`);
                    }}
                  >
                    {detailTask.lead_name || detailTask.lead_id}
                  </button>
                ) : (
                  <p className="task-drawer-value">—</p>
                )}
              </div>
              <div className="task-drawer-field">
                <span className="task-drawer-label">Criado por</span>
                <p className="task-drawer-value">
                  {formatCreatedByLabel(detailTask)}
                  {detailTask.created_at
                    ? ` · ${new Date(detailTask.created_at).toLocaleString('pt-BR')}`
                    : ''}
                </p>
              </div>
              <div className="task-drawer-field">
                <span className="task-drawer-label">Atualizado em</span>
                <p className="task-drawer-value">
                  {detailTask.updated_at
                    ? new Date(detailTask.updated_at).toLocaleString('pt-BR')
                    : '—'}
                </p>
              </div>
            </div>
            <div className="task-drawer-footer">
              <button type="button" className="btn-primary task-drawer-edit" onClick={openEditFromDetail}>
                Editar
              </button>
            </div>
          </aside>
        </>
      ) : null}

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes tasksSkeletonShimmer {
          from { background-position: 200% 0; }
          to { background-position: -200% 0; }
        }
        .tasks-skeleton-sr {
          position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
          overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
        }
        .tasks-board--loading { position: relative; min-height: 280px; }
        .tasks-skeleton-root {
          pointer-events: none;
          display: flex; flex-direction: column; gap: 28px;
          padding: 4px 0 8px;
        }
        .tasks-skeleton-section { display: flex; flex-direction: column; gap: 12px; }
        .tasks-skeleton-group-title {
          height: 13px; width: 140px; border-radius: 6px;
          background: linear-gradient(90deg, rgba(148,163,184,0.16) 25%, rgba(148,163,184,0.3) 50%, rgba(148,163,184,0.16) 75%);
          background-size: 200% 100%;
          animation: tasksSkeletonShimmer 1.15s ease-in-out infinite;
        }
        .tasks-skeleton-list { display: flex; flex-direction: column; gap: 8px; }
        .tasks-skeleton-card {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 14px 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          overflow: hidden;
        }
        .tasks-skeleton-check {
          flex-shrink: 0; width: 16px; height: 16px; margin-top: 3px; border-radius: 4px;
          border: 1px solid var(--border-mid);
          background: linear-gradient(90deg, rgba(148,163,184,0.1) 25%, rgba(148,163,184,0.2) 50%, rgba(148,163,184,0.1) 75%);
          background-size: 200% 100%;
          animation: tasksSkeletonShimmer 1.15s ease-in-out infinite;
        }
        .tasks-skeleton-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
        .tasks-skeleton-line {
          height: 12px; border-radius: 6px;
          background: linear-gradient(90deg, rgba(148,163,184,0.12) 25%, rgba(148,163,184,0.26) 50%, rgba(148,163,184,0.12) 75%);
          background-size: 200% 100%;
          animation: tasksSkeletonShimmer 1.15s ease-in-out infinite;
        }
        .tasks-skeleton-line--title { width: 78%; max-width: 420px; height: 14px; }
        .tasks-skeleton-line--sub { width: 52%; max-width: 280px; }
        .tasks-skeleton-line--short { width: 38%; max-width: 200px; }
        .tasks-skeleton-badges { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
        .tasks-skeleton-pill {
          height: 22px; width: 72px; border-radius: 999px;
          background: linear-gradient(90deg, rgba(148,163,184,0.1) 25%, rgba(148,163,184,0.22) 50%, rgba(148,163,184,0.1) 75%);
          background-size: 200% 100%;
          animation: tasksSkeletonShimmer 1.15s ease-in-out infinite;
        }
        .tasks-skeleton-pill--narrow { width: 52px; }
        .tasks-skeleton-actions {
          display: flex; flex-direction: row; gap: 4px; padding-top: 2px; opacity: 0.85;
        }
        .tasks-skeleton-icon {
          width: 26px; height: 26px; border-radius: 8px;
          border: 1px solid var(--border-light);
          background: rgba(148,163,184,0.08);
        }
        @media (prefers-reduced-motion: reduce) {
          .tasks-skeleton-group-title,
          .tasks-skeleton-check,
          .tasks-skeleton-line,
          .tasks-skeleton-pill {
            animation: none;
            background: rgba(148,163,184,0.18);
          }
        }

        /* ── Lista de tarefas ── */
        .tasks-limit-notice {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin-top: 12px;
          padding: 10px 14px;
          border-radius: var(--radius-sm);
          background: var(--color-background-warning, var(--warn-bg));
          color: var(--color-text-warning, var(--warn-text));
          font-size: 13px;
          font-weight: 500;
          line-height: 1.45;
          border: 1px solid rgba(138, 107, 26, 0.2);
        }
        .tasks-limit-notice__icon {
          flex-shrink: 0;
          margin-top: 1px;
          color: var(--color-text-warning, var(--warn-text));
          opacity: 0.95;
        }
        .task-filters { display: flex; gap: 8px; flex-wrap: wrap; }
        .empty-state { padding: 60px 20px; text-align: center; color: var(--text-muted); display: flex; flex-direction: column; align-items: center; gap: 10px; background: var(--surface); border-radius: var(--radius); border: 1px dashed var(--border-mid); }
        .tasks-lists-wrap { display: flex; flex-direction: column; gap: 24px; }
        .task-group-title { font-size: 13px; font-weight: 700; text-transform: uppercase; margin-bottom: 12px; }
        .task-list { display: flex; flex-direction: column; gap: 8px; }
        .task-card { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); transition: var(--transition); }
        .task-card:hover { border-color: var(--border-mid); }
        .task-card.done { opacity: 0.7; background: var(--surface-hover); }
        .task-checkbox { margin-top: 3px; width: 16px; height: 16px; cursor: pointer; accent-color: var(--success); }
        .task-content { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; cursor: pointer; }
        .task-title { font-weight: 600; font-size: 14px; color: var(--text); }
        .task-title.line-through { text-decoration: line-through; color: var(--text-muted); }
        .task-meta { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
        .task-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 2px 6px; border-radius: 4px; background: var(--border-light); color: var(--text-secondary); font-weight: 500; }
        .task-badge.text-danger { color: var(--danger); background: var(--danger-light); }
        .lead-badge { cursor: pointer; }
        .lead-badge:hover { background: var(--accent-light); color: var(--accent); }
        .assign-badge { width: 22px; height: 22px; justify-content: center; border-radius: 50%; padding: 0; font-size: 9px; font-weight: 800; background: var(--accent-light); color: var(--accent); border: 1px solid var(--accent); }
        .task-actions { display: flex; gap: 4px; opacity: 0; transition: opacity 0.2s; }
        .task-card:hover .task-actions { opacity: 1; }
        .task-action-btn { background: transparent; border: none; padding: 6px; border-radius: 6px; cursor: pointer; color: var(--text-muted); }
        .task-action-btn:hover { background: var(--border-light); color: var(--text); }
        .task-action-btn.text-danger:hover { background: var(--danger-light); color: var(--danger); }

        /* ── Modal ── */
        .task-modal-overlay {
          position: fixed; inset: 0;
          background: rgba(18, 16, 42, 0.55);
          backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          z-index: 9999; padding: 16px;
        }
        .task-modal-panel {
          background: var(--white);
          border-radius: 20px;
          width: 100%; max-width: 480px;
          box-shadow: 0 24px 60px rgba(18, 16, 42, 0.18), 0 2px 8px rgba(91,63,191,0.08);
          border: 0.5px solid var(--border-light);
          max-height: 92vh; overflow-y: auto;
        }
        .task-modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 24px 18px;
          border-bottom: 0.5px solid var(--v100);
        }
        .task-modal-title-row { display: flex; align-items: center; gap: 10px; }
        .task-modal-icon-wrap {
          width: 32px; height: 32px; border-radius: 9px;
          background: var(--v50); color: var(--v500);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .task-modal-title { font-size: 15px; font-weight: 700; color: var(--ink); letter-spacing: -0.01em; }
        .task-modal-close {
          width: 32px; height: 32px; min-height: 32px; padding: 0;
          background: transparent; border: 0.5px solid var(--v100);
          border-radius: 8px; color: var(--faint);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: background 0.15s, color 0.15s, border-color 0.15s;
        }
        .task-modal-close:hover { background: var(--v50); color: var(--mid); border-color: var(--v200); }

        /* ── Formulário ── */
        .task-modal-form {
          display: flex; flex-direction: column; gap: 18px;
          padding: 24px;
        }
        .task-field { display: flex; flex-direction: column; gap: 6px; }
        .task-field-label {
          font-family: var(--ff-mono);
          font-size: 10px; font-weight: 400;
          text-transform: uppercase; letter-spacing: 0.12em;
          color: var(--mid);
        }
        .task-field-required { color: var(--c500); }
        .task-textarea { resize: vertical; min-height: 88px; font-family: var(--ff-ui) !important; }
        .task-select { cursor: pointer; }
        .task-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

        /* ── Busca de lead ── */
        .task-lead-clear {
          position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; padding: 2px;
          color: var(--faint); display: flex; align-items: center;
          min-height: auto; width: auto; border-radius: 4px;
        }
        .task-lead-clear:hover { color: var(--mid); }
        .task-lead-drop {
          position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 300;
          background: var(--white);
          border: 0.5px solid var(--border-light);
          border-radius: 12px;
          box-shadow: 0 8px 28px rgba(18, 16, 42, 0.12);
          max-height: 220px; overflow-y: auto;
          padding: 6px;
        }
        .task-lead-option {
          display: flex; align-items: center; justify-content: space-between;
          width: 100%; padding: 9px 12px;
          background: none; border: none; border-radius: 8px;
          cursor: pointer; text-align: left; gap: 8px;
          min-height: auto;
          transition: background 0.1s;
        }
        .task-lead-option:hover { background: var(--v50); }
        .task-lead-name { font-size: 13px; font-weight: 500; color: var(--ink); }
        .task-lead-phone { font-size: 11px; color: var(--faint); font-family: var(--ff-mono); }
        .task-lead-empty { padding: 10px 12px; font-size: 12px; color: var(--faint); margin: 0; }

        /* ── Footer do modal ── */
        .task-modal-footer {
          display: flex; justify-content: flex-end; gap: 8px;
          padding-top: 8px;
          border-top: 0.5px solid var(--v100);
          margin-top: 2px;
        }
        .task-modal-footer .btn-outline { min-height: 38px; font-size: 13px; padding: 0 16px; }
        .task-modal-footer .btn-primary { min-height: 38px; font-size: 13px; padding: 0 20px; }

        .tasks-view-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 8px 14px; border-radius: var(--radius-sm);
          border: 1px solid var(--border-mid); background: var(--surface);
          color: var(--text-secondary); font-size: 13px; font-weight: 600;
          cursor: pointer; font-family: inherit; transition: var(--transition);
        }
        .tasks-view-btn:hover { border-color: var(--accent); color: var(--accent); background: var(--v50); }
        .tasks-view-btn--active {
          border-color: var(--v500); color: var(--v700); background: var(--v50);
          box-shadow: 0 1px 4px rgba(91, 63, 191, 0.12);
        }

        .tasks-kanban {
          display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px;
          align-items: stretch;
        }
        @media (max-width: 900px) {
          .tasks-kanban { grid-template-columns: 1fr; }
        }
        .tasks-kanban-col {
          border: 1px solid var(--border-mid); border-radius: var(--radius-sm);
          background: var(--surface); overflow: hidden; display: flex; flex-direction: column;
          min-height: 120px;
        }
        .tasks-kanban-col-head {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          padding: 12px 14px; border-bottom: 1px solid var(--border);
        }
        .tasks-kanban-col--late .tasks-kanban-col-head { background: rgba(220, 38, 38, 0.08); }
        .tasks-kanban-col--todo .tasks-kanban-col-head { background: rgba(91, 63, 191, 0.08); }
        .tasks-kanban-col--done .tasks-kanban-col-head { background: rgba(22, 163, 74, 0.1); }
        .tasks-kanban-col-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink); }
        .tasks-kanban-col--late .tasks-kanban-col-title { color: var(--danger); }
        .tasks-kanban-col--todo .tasks-kanban-col-title { color: var(--v500); }
        .tasks-kanban-col--done .tasks-kanban-col-title { color: var(--success-text); }
        .tasks-kanban-badge {
          font-size: 11px; font-weight: 800; min-width: 22px; height: 22px; padding: 0 7px;
          border-radius: 99px; background: var(--white); border: 1px solid var(--border-mid);
          display: inline-flex; align-items: center; justify-content: center; color: var(--ink);
        }
        .tasks-kanban-col-body { padding: 10px; flex: 1; overflow-y: auto; max-height: min(62vh, 520px); }

        .tasks-cal-layout {
          display: flex;
          flex-direction: column;
          gap: 22px;
          align-items: stretch;
        }
        .tasks-cal-main { width: 100%; min-width: 0; }
        .tasks-cal-month-label {
          font-size: 15px; font-weight: 700; color: var(--ink);
          text-transform: capitalize;
        }
        .tasks-cal-weekdays {
          display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; margin-bottom: 6px;
        }
        .tasks-cal-weekday {
          font-size: 10px; font-weight: 700; text-align: center; color: var(--text-secondary);
          text-transform: uppercase; letter-spacing: 0.06em;
        }
        .tasks-cal-grid {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 8px;
        }
        .tasks-cal-cell {
          border: 1px solid var(--border-mid); border-radius: 10px; background: var(--surface);
          min-height: 118px; padding: 8px 8px 10px; display: flex; flex-direction: column;
        }
        .tasks-cal-cell--empty { background: transparent; border: none; min-height: 0; }
        .tasks-cal-cell--today {
          border-color: var(--v500); box-shadow: 0 0 0 1px rgba(91, 63, 191, 0.25);
          background: rgba(91, 63, 191, 0.04);
        }
        .tasks-cal-day-num {
          font-size: 12px; font-weight: 800; color: var(--text-secondary); margin-bottom: 6px;
        }
        .tasks-cal-cell--today .tasks-cal-day-num {
          width: 26px; height: 26px; border-radius: 50%; background: #5b3fbf; color: #fff;
          display: flex; align-items: center; justify-content: center;
        }
        .tasks-cal-day-tasks { display: flex; flex-direction: column; gap: 6px; flex: 1; min-height: 0; overflow-y: auto; }
        .tasks-cal-day-tasks .task-title {
          white-space: normal;
          word-break: break-word;
          line-height: 1.35;
        }
        .tasks-cal-semprazo {
          width: 100%;
          border: 1px solid var(--border-mid);
          border-radius: var(--radius-sm);
          background: var(--surface);
          padding: 16px 18px;
        }
        .tasks-cal-semprazo-title {
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin: 0 0 12px;
          color: var(--text-secondary);
        }
        .tasks-cal-semprazo-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 8px;
        }
        .tasks-cal-semprazo-grid .task-card { min-width: 0; }

        .task-card--compact { padding: 8px 10px; gap: 8px; }
        .task-card--compact .task-checkbox { margin-top: 2px; width: 14px; height: 14px; }
        .task-card--compact .task-title { font-size: 12px; }
        .task-card--compact .task-actions { opacity: 1; }

        .task-drawer-backdrop {
          position: fixed; inset: 0; z-index: 9500;
          background: rgba(18, 16, 42, 0.35);
        }
        .task-drawer-panel {
          position: fixed; top: 0; right: 0; bottom: 0; width: min(420px, 100vw);
          z-index: 9600; background: var(--surface);
          box-shadow: -8px 0 40px rgba(18, 16, 42, 0.12);
          border-left: 1px solid var(--border-mid);
          display: flex; flex-direction: column;
          animation: taskDrawerIn 0.22s ease-out;
        }
        @keyframes taskDrawerIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .task-drawer-panel { animation: none; }
        }
        .task-drawer-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 18px; border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .task-drawer-heading { font-size: 16px; font-weight: 700; margin: 0; color: var(--ink); }
        .task-drawer-close {
          width: 36px; height: 36px; border-radius: var(--radius-sm);
          border: 1px solid var(--border-light); background: var(--surface);
          color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center;
        }
        .task-drawer-close:hover { border-color: var(--border-mid); color: var(--ink); }
        .task-drawer-body { flex: 1; overflow-y: auto; padding: 18px; display: flex; flex-direction: column; gap: 16px; }
        .task-drawer-field { display: flex; flex-direction: column; gap: 4px; }
        .task-drawer-label {
          font-family: var(--ff-mono); font-size: 10px; text-transform: uppercase;
          letter-spacing: 0.1em; color: var(--mid);
        }
        .task-drawer-value { margin: 0; font-size: 14px; color: var(--ink); line-height: 1.45; }
        .task-drawer-value--multiline { white-space: pre-wrap; }
        .task-drawer-badge {
          display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 99px;
          font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em;
        }
        .task-drawer-badge--pending { background: var(--v50); color: var(--v700); }
        .task-drawer-badge--late { background: var(--danger-light); color: var(--danger); }
        .task-drawer-badge--done { background: var(--success-light); color: var(--success-text); }
        .task-drawer-link {
          background: none; border: none; padding: 0; margin: 0;
          font-size: 14px; font-weight: 600; color: var(--v500); cursor: pointer; text-align: left;
          text-decoration: underline; font-family: inherit;
        }
        .task-drawer-link:hover { color: var(--v700); }
        .task-drawer-footer {
          padding: 14px 18px; border-top: 1px solid var(--border); flex-shrink: 0;
        }
        .task-drawer-edit { width: 100%; justify-content: center; }
      `}} />
    </div>
  );
}
