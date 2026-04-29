import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import { useLeadStore } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { teams } from '../lib/appwrite';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckSquare, PlusCircle, Pencil, Trash2, Calendar, User, X, ClipboardList } from 'lucide-react';

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

  const filteredTasks = useMemo(() => {
    const userId = useLeadStore.getState().userId;
    return tasks.filter(t => {
      if (filters.status === 'minhas' && t.assigned_to !== userId) return false;
      if (filters.status === 'vencidas' && (t.status === 'done' || !isVencida(t.due_date))) return false;
      if (filters.status === 'concluidas' && t.status !== 'done') return false;
      if (filters.lead_id && t.lead_id !== filters.lead_id) return false;
      return true;
    });
  }, [tasks, filters.status, filters.lead_id]);

  function isVencida(dateStr) {
    if (!dateStr) return false;
    const due = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr).getTime();
    const now = new Date().setHours(0,0,0,0);
    return due < now;
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
      addToast({ type: 'success', message: 'Tarefa excluída' });
    } catch (e) {
      addToast({ type: 'error', message: 'Erro ao excluir' });
    }
  };

  const renderTaskList = (list, title, titleColor) => {
    if (list.length === 0) return null;
    return (
      <div className="task-group">
        <h3 className="task-group-title" style={{ color: titleColor }}>{title} ({list.length})</h3>
        <div className="task-list">
          {list.map(t => {
            const vencida = isVencida(t.due_date) && t.status !== 'done';
            return (
              <div key={t.id} className={`task-card ${t.status === 'done' ? 'done' : ''}`}>
                <input 
                  type="checkbox" 
                  checked={t.status === 'done'} 
                  onChange={() => toggleDone(t)}
                  className="task-checkbox"
                />
                <div className="task-content">
                  <span className={`task-title ${t.status === 'done' ? 'line-through' : ''}`}>{t.title}</span>
                  <div className="task-meta">
                    {t.lead_id && (
                      <span className="task-badge lead-badge" onClick={() => navigate(`/lead/${t.lead_id}`)}>
                        <User size={12} /> {t.lead_name || 'Aluno'}
                      </span>
                    )}
                    {t.due_date && (
                      <span className={`task-badge ${vencida ? 'text-danger' : ''}`}>
                        <Calendar size={12} /> {new Date(t.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </span>
                    )}
                    {t.assigned_to && (
                      <span className="task-badge assign-badge" title={members.find(m => m.userId === t.assigned_to)?.userName || t.assigned_to}>
                        {(members.find(m => m.userId === t.assigned_to)?.userName || t.assigned_to).slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="task-actions dropdown-container">
                  <button type="button" className="task-action-btn" onClick={() => openEdit(t)}><Pencil size={14} /></button>
                  <button type="button" className="task-action-btn text-danger" onClick={() => handleDelete(t.id)}><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="container" style={{ paddingTop: 20, paddingBottom: 30 }}>
      <header className="animate-in">
        <div className="flex justify-between items-center mb-4">
          <h1 className="navi-page-title flex items-center gap-2"><CheckSquare size={24} /> Tarefas</h1>
          <button type="button" className="btn-primary" onClick={openNew}>
            <PlusCircle size={16} /> Nova tarefa
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
      </header>

      {error ? (
        <div className="dashboard-error-banner mt-3">
          <span>{error}</span>
          <button type="button" className="btn-secondary" onClick={() => fetchTasks(academyId, { reset: true })}>Tentar novamente</button>
        </div>
      ) : null}

      <div className="tasks-board mt-4">
        {loading && tasks.length === 0 ? (
          <p className="text-muted">Carregando tarefas...</p>
        ) : tasks.length === 0 ? (
          <div className="empty-state">
            <CheckSquare size={48} color="var(--border-mid)" />
            <p>Nenhuma tarefa por aqui ainda</p>
            <button type="button" className="btn-secondary mt-3" onClick={openNew}>+ Nova tarefa</button>
          </div>
        ) : filteredTasks.length === 0 ? (
          <p className="text-muted mt-4">Nenhuma tarefa corresponde a este filtro.</p>
        ) : (
          <div className="tasks-lists-wrap">
            {renderTaskList(groupedTasks.vencidas, 'Vencidas', 'var(--danger)')}
            {renderTaskList(groupedTasks.pendentes, 'Pendentes', 'var(--text)')}
            {renderTaskList(groupedTasks.concluidas, 'Concluídas', 'var(--success)')}
          </div>
        )}
      </div>

      {showModal && (
        <div
          role="presentation"
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999,
          }}
          onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) setShowModal(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            style={{
              background: 'var(--surface)',
              borderRadius: 16,
              width: '100%',
              maxWidth: 480,
              boxShadow: 'var(--shadow)',
              border: '1px solid var(--border)',
              margin: 16,
              boxSizing: 'border-box',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '18px 24px 16px',
              borderBottom: '1px solid var(--border-light)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ClipboardList size={18} color="var(--accent)" />
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                  {editingTask ? 'Editar Tarefa' : 'Nova Tarefa'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => !saving && setShowModal(false)}
                aria-label="Fechar"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', padding: 4, borderRadius: 6,
                  display: 'flex', alignItems: 'center',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex-col gap-3" style={{ padding: 24 }}>
              <div className="flex-col gap-1">
                <label className="info-mini-label">Título *</label>
                <input
                  type="text"
                  className="form-input-sm"
                  value={form.title}
                  onChange={e => setForm({...form, title: e.target.value})}
                  placeholder="Ex: Ligar para confirmar aula"
                  autoFocus
                  required
                />
              </div>

              <div className="flex-col gap-1">
                <label className="info-mini-label">Descrição</label>
                <textarea
                  className="form-input-sm"
                  rows={3}
                  value={form.description}
                  onChange={e => setForm({...form, description: e.target.value})}
                  placeholder="Detalhes opcionais..."
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-col gap-1 flex-1">
                  <label className="info-mini-label">Prazo</label>
                  <input
                    type="date"
                    className="form-input-sm"
                    value={form.due_date}
                    onChange={e => setForm({...form, due_date: e.target.value})}
                  />
                </div>
                <div className="flex-col gap-1 flex-1">
                  <label className="info-mini-label">Responsável</label>
                  <select
                    className="form-input-sm"
                    value={form.assigned_to}
                    onChange={e => setForm({...form, assigned_to: e.target.value})}
                  >
                    <option value="">(Sem responsável)</option>
                    {members.map(m => (
                      <option key={m.userId} value={m.userId}>{m.userName}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex-col gap-1" ref={leadDropRef} style={{ position: 'relative' }}>
                <label className="info-mini-label">Vincular aluno / lead</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="form-input-sm"
                    value={leadSearch}
                    onChange={e => {
                      setLeadSearch(e.target.value);
                      setForm(f => ({ ...f, lead_id: '' }));
                      setShowLeadDrop(true);
                    }}
                    onFocus={() => setShowLeadDrop(true)}
                    placeholder="Buscar aluno ou lead..."
                    autoComplete="off"
                  />
                  {form.lead_id && (
                    <button
                      type="button"
                      onClick={() => { setForm(f => ({ ...f, lead_id: '' })); setLeadSearch(''); }}
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 2 }}
                      aria-label="Limpar"
                    >
                      <X size={14} />
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
                          {l.name}
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                            {l.phone || ''}
                          </span>
                        </button>
                      ))
                    }
                    {leads.filter(l => !leadSearch || l.name?.toLowerCase().includes(leadSearch.toLowerCase())).length === 0 && (
                      <p style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Nenhum resultado</p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 mt-2 pt-3" style={{ borderTop: '1px solid var(--border-light)' }}>
                <button type="button" className="btn-outline" onClick={() => setShowModal(false)} disabled={saving}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .task-filters { display: flex; gap: 8px; flex-wrap: wrap; }
        .empty-state { padding: 60px 20px; text-align: center; color: var(--text-muted); display: flex; flex-direction: column; align-items: center; gap: 10px; background: var(--surface); border-radius: var(--radius); border: 1px dashed var(--border-mid); }
        .tasks-lists-wrap { display: flex; flex-direction: column; gap: 24px; }
        .task-group-title { font-size: 13px; font-weight: 700; text-transform: uppercase; margin-bottom: 12px; }
        .task-list { display: flex; flex-direction: column; gap: 8px; }
        .task-card { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); transition: var(--transition); }
        .task-card:hover { border-color: var(--border-mid); }
        .task-card.done { opacity: 0.7; background: var(--surface-hover); }
        .task-checkbox { margin-top: 3px; width: 16px; height: 16px; cursor: pointer; accent-color: var(--success); }
        .task-content { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
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
        .task-lead-drop { position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 200; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.12); max-height: 200px; overflow-y: auto; padding: 4px 0; }
        .task-lead-option { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px; background: none; border: none; cursor: pointer; font-size: 13px; color: var(--text); text-align: left; }
        .task-lead-option:hover { background: var(--surface-hover); }
      `}} />
    </div>
  );
}
