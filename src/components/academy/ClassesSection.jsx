import '../../styles/schedules.css';
import React, { useCallback, useEffect, useState } from 'react';
import { GraduationCap, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import ModalShell from '../shared/ModalShell.jsx';
import AsyncButton from '../shared/AsyncButton.jsx';
import { useUiStore } from '../../store/useUiStore';
import { isClassesConfigured, useClassesStore } from '../../store/classesStore.js';
import { friendlyError } from '../../lib/errorMessages';
import { emptyClassForm, formatCapacityLabel, validateClassForm } from '../../lib/classes.js';

function ClassFormFields({ form, setForm, errors }) {
  return (
    <div className="schedules-form-grid">
      <label className="form-field">
        <span className="form-label">Nome da turma *</span>
        <input
          className="form-input"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          placeholder="Ex: Adulto Noite"
          maxLength={100}
        />
        {errors.name ? <span className="field-error">{errors.name}</span> : null}
      </label>

      <label className="form-field">
        <span className="form-label">Modalidade *</span>
        <input
          className="form-input"
          value={form.modality}
          onChange={(e) => setForm((p) => ({ ...p, modality: e.target.value }))}
          placeholder="Ex: bjj, kids"
          maxLength={50}
        />
        {errors.modality ? <span className="field-error">{errors.modality}</span> : null}
      </label>

      <label className="form-field">
        <span className="form-label">Professor padrão</span>
        <input
          className="form-input"
          value={form.instructor}
          onChange={(e) => setForm((p) => ({ ...p, instructor: e.target.value }))}
          maxLength={100}
        />
      </label>

      <label className="form-field">
        <span className="form-label">Capacidade padrão</span>
        <input
          className="form-input"
          type="number"
          min={1}
          max={200}
          value={form.max_capacity}
          onChange={(e) => setForm((p) => ({ ...p, max_capacity: e.target.value }))}
          placeholder="Ilimitado"
        />
        {errors.max_capacity ? <span className="field-error">{errors.max_capacity}</span> : null}
      </label>

      <label className="form-field schedules-form-grid__full">
        <span className="form-label">Descrição</span>
        <textarea
          className="form-input"
          rows={2}
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          maxLength={500}
        />
      </label>

      <div className="form-field schedules-form-grid__full schedules-toggle-row">
        <span className="form-label">Ativa</span>
        <label className="schedules-toggle">
          <input
            type="checkbox"
            checked={form.is_active !== false}
            onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
          />
          <span>{form.is_active !== false ? 'Disponível para novos horários' : 'Inativa'}</span>
        </label>
      </div>
    </div>
  );
}

export default function ClassesSection({ academyId, embeddedInLayout = false }) {
  const addToast = useUiStore((s) => s.addToast);
  const classes = useClassesStore((s) => s.classes);
  const loading = useClassesStore((s) => s.loading);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);
  const createClass = useClassesStore((s) => s.createClass);
  const updateClass = useClassesStore((s) => s.updateClass);
  const toggleClassActive = useClassesStore((s) => s.toggleClassActive);
  const deleteClass = useClassesStore((s) => s.deleteClass);
  const isMutating = useClassesStore((s) => s.isMutating);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyClassForm());
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const configured = isClassesConfigured();

  const load = useCallback(async () => {
    if (!academyId || !configured) return;
    try {
      await fetchClasses(academyId, { activeOnly: false });
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'load') });
    }
  }, [academyId, configured, fetchClasses, addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!configured) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="Turmas não configuradas"
        description="Defina VITE_APPWRITE_CLASSES_COLLECTION_ID=classes e rode npm run provision:booking-schema."
      />
    );
  }

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyClassForm());
    setFormErrors({});
    setEditorOpen(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      modality: item.modality,
      instructor: item.instructor,
      level: item.level,
      description: item.description,
      is_active: item.is_active !== false,
      max_capacity: item.max_capacity ?? '',
      legacy_turma_key: item.legacy_turma_key,
      color: item.color,
    });
    setFormErrors({});
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditorOpen(false);
    setEditingId(null);
    setForm(emptyClassForm());
    setFormErrors({});
  };

  const handleSave = async () => {
    const validation = validateClassForm(form);
    if (!validation.valid) {
      setFormErrors(validation.errors);
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, academy_id: academyId };
      if (editingId) {
        await updateClass(editingId, payload);
        addToast({ type: 'success', message: 'Turma atualizada.' });
      } else {
        await createClass(payload);
        addToast({ type: 'success', message: 'Turma criada.' });
      }
      closeEditor();
    } catch (e) {
      if (e?.validation) setFormErrors(e.validation);
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (item) => {
    try {
      await toggleClassActive(item.id, item.is_active);
      addToast({
        type: 'success',
        message: item.is_active ? 'Turma desativada.' : 'Turma reativada.',
      });
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteClass(deleteTarget.id);
      addToast({ type: 'success', message: 'Turma excluída.' });
      setDeleteTarget(null);
      if (editingId === deleteTarget.id) closeEditor();
    } catch (e) {
      addToast({
        type: 'error',
        message: e?.code === 'class_has_schedules' ? e.message : friendlyError(e, 'delete'),
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className={`schedules-section${embeddedInLayout ? ' schedules-section--embedded' : ''}`}>
      {!embeddedInLayout && (
        <div className="schedules-section__head">
          <div>
            <h2 className="schedules-section__title">Turmas</h2>
            <p className="text-small text-muted">
              Catálogo de turmas. Horários recorrentes são vinculados abaixo.
            </p>
          </div>
          <button type="button" className="btn-primary" onClick={openCreate}>
            <Plus size={16} strokeWidth={2} aria-hidden />
            Nova turma
          </button>
        </div>
      )}
      {embeddedInLayout && (
        <div className="schedules-section__head" style={{ marginTop: 0 }}>
          <button type="button" className="btn-primary" onClick={openCreate}>
            <Plus size={16} strokeWidth={2} aria-hidden />
            Nova turma
          </button>
        </div>
      )}

      {loading && !classes.length ? (
        <p className="text-small text-muted" role="status">
          Carregando turmas…
        </p>
      ) : null}

      {!loading && !classes.length ? (
        <EmptyState
          icon={GraduationCap}
          title="Nenhuma turma cadastrada"
          description="Crie a primeira turma antes de cadastrar horários."
          action={{ label: 'Nova turma', onClick: openCreate }}
        />
      ) : (
        <ul className="schedules-list">
          {classes.map((item) => (
            <li key={item.id} className="schedules-list__item">
              <button
                type="button"
                className="schedules-list__main-btn"
                onClick={() => openEdit(item)}
                disabled={isMutating(item.id)}
              >
                <div className="schedules-list__name-row">
                  <span className="schedules-list__name">{item.name}</span>
                  <span className={`badge ${item.is_active ? 'badge-success' : 'badge-secondary'}`}>
                    {item.is_active ? 'Ativa' : 'Inativa'}
                  </span>
                </div>
                <p className="schedules-list__meta text-small text-muted">
                  {item.modality}
                  {item.instructor ? ` · ${item.instructor}` : ''}
                  {` · ${formatCapacityLabel(item.max_capacity)}`}
                </p>
              </button>
              <div className="schedules-list__actions">
                <button
                  type="button"
                  className="btn-icon"
                  title="Editar turma"
                  aria-label="Editar turma"
                  onClick={() => openEdit(item)}
                  disabled={isMutating(item.id)}
                >
                  <Pencil size={16} strokeWidth={2} aria-hidden />
                </button>
                <button
                  type="button"
                  className="btn-icon"
                  title={item.is_active ? 'Desativar turma' : 'Reativar turma'}
                  aria-label={item.is_active ? 'Desativar turma' : 'Reativar turma'}
                  onClick={() => void handleToggle(item)}
                  disabled={isMutating(item.id)}
                >
                  <Power size={16} strokeWidth={2} aria-hidden />
                </button>
                <button
                  type="button"
                  className="btn-icon btn-icon--danger"
                  title="Excluir turma"
                  aria-label="Excluir turma"
                  onClick={() => setDeleteTarget(item)}
                  disabled={isMutating(item.id)}
                >
                  <Trash2 size={16} strokeWidth={2} aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ModalShell
        open={editorOpen}
        title={editingId ? 'Editar turma' : 'Nova turma'}
        onClose={closeEditor}
        maxWidth={640}
        dialogClassName="navi-modal-shell--scroll-body"
        footer={
          <>
            <button type="button" className="btn-outline" onClick={closeEditor} disabled={saving}>
              Cancelar
            </button>
            <AsyncButton variant="primary" loading={saving} onClick={() => void handleSave()}>
              Salvar
            </AsyncButton>
          </>
        }
      >
        <ClassFormFields form={form} setForm={setForm} errors={formErrors} />
      </ModalShell>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Excluir turma?"
        description={
          deleteTarget
            ? `A turma "${deleteTarget.name}" será removida. Não é possível excluir se houver horários vinculados.`
            : undefined
        }
        confirmLabel="Excluir"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
      />
    </section>
  );
}
