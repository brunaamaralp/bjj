import React, { useCallback, useEffect, useState } from 'react';
import { CheckSquare, Plus, Trash2, ChevronUp, ChevronDown, Play } from 'lucide-react';
import { account } from '../../lib/appwrite';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import {
  TASK_TEMPLATE_TRIGGER_LABELS,
  TASK_TEMPLATE_TRIGGERS,
} from '../../lib/taskTemplates.js';

async function apiHeaders(academyId) {
  const jwt = await account.createJWT();
  const token = String(jwt?.jwt || '').trim();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-academy-id': academyId,
  };
}

const emptyItem = (order) => ({
  title: '',
  offset_days: 0,
  notes: '',
  order,
});

export default function TaskTemplatesSection({ academyId }) {
  const addToast = useUiStore((s) => s.addToast);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [configurado, setConfigurado] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);

  const load = useCallback(async () => {
    if (!academyId) return;
    setLoading(true);
    try {
      const headers = await apiHeaders(academyId);
      const res = await fetch('/api/task-templates', { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.sucesso) throw new Error(data?.erro || `HTTP ${res.status}`);
      setTemplates(data.templates || []);
      setConfigurado(data.configurado !== false);
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'action') });
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [academyId, addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setEditing({
      id: null,
      name: '',
      trigger: TASK_TEMPLATE_TRIGGERS.MANUAL,
      tasks: [emptyItem(0), emptyItem(1)],
    });
  };

  const openEdit = (t) => {
    setEditing({
      id: t.id,
      name: t.name,
      trigger: t.trigger,
      tasks: (t.tasks || []).map((item, i) => ({ ...item, order: i })),
    });
  };

  const saveTemplate = async () => {
    if (!editing || !academyId) return;
    const name = String(editing.name || '').trim();
    if (!name) {
      addToast({ type: 'error', message: 'Informe o nome do template.' });
      return;
    }
    const tasks = (editing.tasks || [])
      .map((item, i) => ({
        title: String(item.title || '').trim(),
        offset_days: Number(item.offset_days) || 0,
        notes: String(item.notes || ''),
        order: i,
      }))
      .filter((item) => item.title);
    if (!tasks.length) {
      addToast({ type: 'error', message: 'Adicione ao menos um item com título.' });
      return;
    }

    setSaving(true);
    try {
      const headers = await apiHeaders(academyId);
      const body = { name, trigger: editing.trigger, tasks };
      const url = editing.id
        ? `/api/task-templates/${encodeURIComponent(editing.id)}`
        : '/api/task-templates';
      const res = await fetch(url, {
        method: editing.id ? 'PATCH' : 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.sucesso) throw new Error(data?.erro || `HTTP ${res.status}`);
      setEditing(null);
      addToast({ type: 'success', message: 'Template salvo.' });
      void load();
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (id) => {
    if (!window.confirm('Excluir este template? Tarefas já criadas não serão removidas.')) return;
    try {
      const headers = await apiHeaders(academyId);
      const res = await fetch(`/api/task-templates/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.sucesso) throw new Error(data?.erro || `HTTP ${res.status}`);
      addToast({ type: 'success', message: 'Template excluído.' });
      void load();
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'delete') });
    }
  };

  const runPreview = async () => {
    if (!editing?.id) {
      addToast({ type: 'info', message: 'Salve o template antes de testar.' });
      return;
    }
    try {
      const headers = await apiHeaders(academyId);
      const res = await fetch('/api/task-templates?action=apply', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          template_id: editing.id,
          trigger: editing.trigger,
          lead_id: 'preview',
          lead_name: 'Preview',
          anchor_date: new Date().toISOString().slice(0, 10),
          preview: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.sucesso) throw new Error(data?.erro || `HTTP ${res.status}`);
      setPreview(data.tasks || []);
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'action') });
    }
  };

  const provisionDefaults = async () => {
    try {
      const headers = await apiHeaders(academyId);
      const res = await fetch('/api/task-templates?action=provision', { method: 'POST', headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.sucesso) throw new Error(data?.erro || `HTTP ${res.status}`);
      addToast({
        type: 'success',
        message:
          data.created > 0
            ? `${data.created} template(s) padrão criado(s).`
            : 'Templates padrão já existem.',
      });
      void load();
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'action') });
    }
  };

  const moveItem = (idx, dir) => {
    const arr = [...(editing.tasks || [])];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    setEditing({ ...editing, tasks: arr.map((item, i) => ({ ...item, order: i })) });
  };

  if (!configurado) {
    return (
      <section className="empresa-section" style={{ marginTop: 8 }}>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Configure a coleção <code>task_templates</code> no Appwrite e defina{' '}
          <code>VITE_APPWRITE_TASK_TEMPLATES_COLLECTION_ID</code> no ambiente para usar templates de
          tarefas.
        </p>
      </section>
    );
  }

  return (
    <section className="empresa-section" style={{ marginTop: 8 }}>
      <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="navi-section-heading flex items-center gap-2">
            <CheckSquare size={20} color="var(--v500)" /> Templates de tarefas
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 0', maxWidth: 560, lineHeight: 1.45 }}>
            Listas reutilizáveis acionadas ao desligar ou matricular aluno. Cada academia configura os
            seus próprios passos — sem textos fixos no código.
          </p>
        </div>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn-outline" onClick={() => void provisionDefaults()}>
            Restaurar padrões
          </button>
          <button type="button" className="btn-secondary" onClick={openNew}>
            <Plus size={16} style={{ marginRight: 6 }} /> Novo template
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ marginTop: 16, color: 'var(--text-secondary)' }}>Carregando…</p>
      ) : templates.length === 0 ? (
        <p style={{ marginTop: 16, color: 'var(--text-secondary)' }}>
          Nenhum template ainda. Use &quot;Restaurar padrões&quot; ou crie um novo.
        </p>
      ) : (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {templates.map((t) => (
            <div
              key={t.id}
              className="card"
              style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}
            >
              <div>
                <strong style={{ fontSize: 14 }}>{t.name}</strong>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {TASK_TEMPLATE_TRIGGER_LABELS[t.trigger] || t.trigger} · {(t.tasks || []).length} itens
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-outline" onClick={() => openEdit(t)}>
                  Editar
                </button>
                <button type="button" className="btn-ghost text-danger" onClick={() => void deleteTemplate(t.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing ? (
        <div
          className="card"
          style={{
            marginTop: 20,
            padding: 16,
            border: '1px solid var(--border)',
          }}
        >
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{editing.id ? 'Editar template' : 'Novo template'}</h3>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Nome</label>
            <input
              className="form-input"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label>Gatilho</label>
            <select
              className="form-input"
              value={editing.trigger}
              onChange={(e) => setEditing({ ...editing, trigger: e.target.value })}
              disabled={Boolean(editing.id && editing.trigger !== TASK_TEMPLATE_TRIGGERS.MANUAL)}
            >
              {Object.entries(TASK_TEMPLATE_TRIGGER_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Itens do checklist</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(editing.tasks || []).map((item, idx) => (
              <div
                key={`item-${idx}`}
                style={{
                  border: '0.5px solid var(--border-light)',
                  borderRadius: 8,
                  padding: 10,
                  background: 'var(--surface-hover)',
                }}
              >
                <div className="flex" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
                    <label>Título</label>
                    <input
                      className="form-input"
                      value={item.title}
                      onChange={(e) => {
                        const arr = [...editing.tasks];
                        arr[idx] = { ...arr[idx], title: e.target.value };
                        setEditing({ ...editing, tasks: arr });
                      }}
                    />
                  </div>
                  <div className="form-group" style={{ width: 100, marginBottom: 0 }}>
                    <label>D+ dias</label>
                    <input
                      type="number"
                      min={0}
                      className="form-input"
                      value={item.offset_days}
                      onChange={(e) => {
                        const arr = [...editing.tasks];
                        arr[idx] = { ...arr[idx], offset_days: Number(e.target.value) || 0 };
                        setEditing({ ...editing, tasks: arr });
                      }}
                    />
                  </div>
                  <div className="flex gap-1" style={{ marginBottom: 8 }}>
                    <button type="button" className="btn-ghost" title="Subir" onClick={() => moveItem(idx, -1)} disabled={idx === 0}>
                      <ChevronUp size={16} />
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      title="Descer"
                      onClick={() => moveItem(idx, 1)}
                      disabled={idx === (editing.tasks?.length || 0) - 1}
                    >
                      <ChevronDown size={16} />
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-danger"
                      title="Remover"
                      onClick={() => {
                        const arr = editing.tasks.filter((_, i) => i !== idx);
                        setEditing({ ...editing, tasks: arr.length ? arr : [emptyItem(0)] });
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="form-group" style={{ marginTop: 8, marginBottom: 0 }}>
                  <label>Instrução (opcional)</label>
                  <textarea
                    className="form-input"
                    rows={2}
                    value={item.notes || ''}
                    onChange={(e) => {
                      const arr = [...editing.tasks];
                      arr[idx] = { ...arr[idx], notes: e.target.value };
                      setEditing({ ...editing, tasks: arr });
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn-outline mt-2"
            onClick={() =>
              setEditing({
                ...editing,
                tasks: [...(editing.tasks || []), emptyItem(editing.tasks.length)],
              })
            }
          >
            Adicionar item
          </button>

          <div className="flex gap-2 mt-4" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="btn-outline" onClick={() => { setEditing(null); setPreview(null); }}>
              Cancelar
            </button>
            {editing.id ? (
              <button type="button" className="btn-outline" onClick={() => void runPreview()}>
                <Play size={14} style={{ marginRight: 6 }} /> Testar template
              </button>
            ) : null}
            <button type="button" className="btn-secondary" disabled={saving} onClick={() => void saveTemplate()}>
              {saving ? 'Salvando…' : 'Salvar template'}
            </button>
          </div>

          {preview?.length ? (
            <div style={{ marginTop: 16, padding: 12, background: 'var(--v50)', borderRadius: 8 }}>
              <p style={{ fontSize: 12, fontWeight: 700, margin: '0 0 8px' }}>Preview (não salvo)</p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {preview.map((row, i) => (
                  <li key={i}>
                    {row.title} — prazo {row.due_date}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
