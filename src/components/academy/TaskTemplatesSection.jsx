import React, { useCallback, useEffect, useState } from 'react';
import { CheckSquare, Plus, Trash2, ChevronUp, ChevronDown, Play } from 'lucide-react';
import { account } from '../../lib/appwrite';
import { fetchTeamMemberships } from '../../lib/teamApi.js';
import { membershipPrimaryLabel } from '../../lib/teamMembershipLabel.js';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import EmptyState from '../shared/EmptyState.jsx';
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
  assigned_to: '',
  order,
});

export default function TaskTemplatesSection({ academyId, teamId = '', onTemplatesMetaChange }) {
  const addToast = useUiStore((s) => s.addToast);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [configurado, setConfigurado] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);

  useEffect(() => {
    if (!academyId) {
      setMembers([]);
      return;
    }
    let cancelled = false;
    setMembersLoading(true);
    fetchTeamMemberships(academyId)
      .then((data) => {
        if (!cancelled) {
          const rows = (data.memberships || []).filter((m) => String(m?.userId || '').trim());
          setMembers(rows);
        }
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      })
      .finally(() => {
        if (!cancelled) setMembersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  const load = useCallback(async () => {
    if (!academyId) return;
    setLoading(true);
    try {
      const headers = await apiHeaders(academyId);
      const res = await fetch('/api/task-templates?include_disabled=1', { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.sucesso) throw new Error(data?.erro || `HTTP ${res.status}`);
      const list = data.templates || [];
      const ok = data.configurado !== false;
      setTemplates(list);
      setConfigurado(ok);
      onTemplatesMetaChange?.({
        configurado: ok,
        hasEnrollmentTemplate: list.some(
          (t) => t.trigger === TASK_TEMPLATE_TRIGGERS.ENROLLMENT && t.enabled !== false
        ),
      });
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'action') });
      setTemplates([]);
      onTemplatesMetaChange?.({ configurado: false, hasEnrollmentTemplate: false });
    } finally {
      setLoading(false);
    }
  }, [academyId, addToast, onTemplatesMetaChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setEditing({
      id: null,
      name: '',
      trigger: TASK_TEMPLATE_TRIGGERS.MANUAL,
      enabled: true,
      tasks: [emptyItem(0), emptyItem(1)],
    });
  };

  const openEdit = (t) => {
    setEditing({
      id: t.id,
      name: t.name,
      trigger: t.trigger,
      enabled: t.enabled !== false,
      tasks: (t.tasks || []).map((item, i) => ({ ...item, order: i, assigned_to: item.assigned_to || '' })),
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
        assigned_to: String(item.assigned_to || '').trim(),
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
      const body = {
        name,
        trigger: editing.trigger,
        tasks,
        enabled: editing.enabled !== false,
      };
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

  const performDeleteTemplate = async (id) => {
    try {
      const headers = await apiHeaders(academyId);
      const res = await fetch(`/api/task-templates/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.sucesso) throw new Error(data?.erro || `HTTP ${res.status}`);
      if (editing?.id === id) {
        setEditing(null);
        setPreview(null);
      }
      addToast({ type: 'success', message: 'Template excluído.' });
      void load();
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'delete') });
    }
  };

  const requestDeleteTemplate = (t) => {
    const name = String(t?.name || '').trim() || 'este template';
    addToast({
      type: 'warning',
      message: `Excluir template "${name}"? Tarefas já criadas não serão removidas.`,
      persistent: true,
      secondaryAction: { label: 'Cancelar', onClick: () => {} },
      actionDanger: true,
      action: {
        label: 'Excluir',
        onClick: async () => performDeleteTemplate(t.id),
      },
    });
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

  const toggleTemplateEnabled = async (t) => {
    if (!academyId || !t?.id) return;
    const nextEnabled = t.enabled === false;
    try {
      const headers = await apiHeaders(academyId);
      const res = await fetch(`/api/task-templates/${encodeURIComponent(t.id)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.sucesso) throw new Error(data?.erro || `HTTP ${res.status}`);
      addToast({
        type: 'success',
        message: nextEnabled ? 'Template ativado.' : 'Template desativado.',
      });
      void load();
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
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
        <h3 className="navi-section-heading flex items-center gap-2" style={{ marginBottom: 12 }}>
          <CheckSquare size={18} color="var(--v500)" /> Templates de tarefas
        </h3>
        <EmptyState
          variant="compact"
          tone="dashed"
          icon={CheckSquare}
          title="Módulo de templates indisponível neste ambiente"
          description="Templates ainda não configurados. Entre em contato com o suporte."
          role="status"
        />
      </section>
    );
  }

  return (
    <section className="empresa-section" style={{ marginTop: 8 }}>
      <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 className="navi-section-heading flex items-center gap-2" style={{ margin: 0 }}>
            <CheckSquare size={18} color="var(--v500)" /> Templates de tarefas
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 0', maxWidth: 560, lineHeight: 1.45 }}>
            Processo de onboarding (gatilho <strong>Matrícula</strong>) e checklist de desligamento. Ao
            matricular, o sistema cria automaticamente todas as tarefas com prazos em dias.
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
                <strong style={{ fontSize: 14 }}>
                  {t.name}
                  {t.enabled === false ? (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      Inativo
                    </span>
                  ) : null}
                </strong>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {TASK_TEMPLATE_TRIGGER_LABELS[t.trigger] || t.trigger} · {(t.tasks || []).length} itens
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-outline" onClick={() => void toggleTemplateEnabled(t)}>
                  {t.enabled === false ? 'Ativar' : 'Desativar'}
                </button>
                <button type="button" className="btn-outline" onClick={() => openEdit(t)}>
                  Editar
                </button>
                <button type="button" className="btn-ghost text-danger" onClick={() => requestDeleteTemplate(t)}>
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
            >
              {Object.entries(TASK_TEMPLATE_TRIGGER_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
            {editing.id && editing.trigger !== TASK_TEMPLATE_TRIGGERS.MANUAL ? (
              <p className="text-xs text-light" style={{ margin: '4px 0 0' }}>
                Só pode existir um template automático por gatilho. Ao mudar o gatilho, confira se não há outro
                template com o mesmo tipo.
              </p>
            ) : null}
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
                  <div className="form-group" style={{ minWidth: 160, flex: 1, marginBottom: 0 }}>
                    <label>Responsável</label>
                    <select
                      className="form-input"
                      value={item.assigned_to || ''}
                      disabled={membersLoading}
                      onChange={(e) => {
                        const arr = [...editing.tasks];
                        arr[idx] = { ...arr[idx], assigned_to: e.target.value };
                        setEditing({ ...editing, tasks: arr });
                      }}
                    >
                      <option value="">
                        {membersLoading ? 'Carregando equipe…' : 'Sem responsável'}
                      </option>
                      {members.map((m) => (
                        <option key={m.userId || m.$id} value={m.userId}>
                          {membershipPrimaryLabel(m)}
                        </option>
                      ))}
                    </select>
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
