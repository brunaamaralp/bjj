import '../../styles/schedules.css';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import AsyncButton from '../shared/AsyncButton.jsx';
import { useUiStore } from '../../store/useUiStore';
import { isSchedulesConfigured, useSchedulesStore } from '../../store/schedulesStore.js';
import { isClassesConfigured, useClassesStore } from '../../store/classesStore.js';
import { friendlyError } from '../../lib/errorMessages';
import {
  SCHEDULE_LEVEL_SUGGESTIONS,
  SCHEDULE_WEEKDAYS,
  SCHEDULE_WEEKDAY_LABELS,
  collectScheduleModalities,
  emptyScheduleForm,
  formatScheduleDays,
  groupSchedulesByModality,
  validateScheduleForm,
} from '../../lib/schedules.js';

function ScheduleFormFields({ form, setForm, errors, modalitySuggestions, classOptions }) {
  const toggleDay = (day) => {
    setForm((prev) => {
      const set = new Set(prev.days_of_week || []);
      if (set.has(day)) set.delete(day);
      else set.add(day);
      return { ...prev, days_of_week: SCHEDULE_WEEKDAYS.filter((d) => set.has(d)) };
    });
  };

  return (
    <div className="schedules-form-grid">
      <label className="form-field schedules-form-grid__full">
        <span className="form-label">Turma *</span>
        <select
          className="form-input"
          value={form.class_id}
          onChange={(e) => {
            const classId = e.target.value;
            const selected = classOptions.find((c) => c.id === classId);
            setForm((p) => ({
              ...p,
              class_id: classId,
              name: p.name || selected?.name || '',
              modality: p.modality || selected?.modality || '',
              instructor: p.instructor || selected?.instructor || '',
              level: p.level || selected?.level || '',
              max_capacity:
                p.max_capacity === '' || p.max_capacity == null
                  ? selected?.max_capacity ?? ''
                  : p.max_capacity,
            }));
          }}
        >
          <option value="">Selecione…</option>
          {classOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {errors.class_id ? <span className="field-error">{errors.class_id}</span> : null}
      </label>

      <label className="form-field">
        <span className="form-label">Nome da aula *</span>
        <input
          className="form-input"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          placeholder="Ex: Jiu-jitsu Adulto Manhã"
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
          placeholder="Ex: bjj, kids, fitness"
          list="schedule-modality-suggestions"
          maxLength={50}
        />
        <datalist id="schedule-modality-suggestions">
          {modalitySuggestions.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        {errors.modality ? <span className="field-error">{errors.modality}</span> : null}
      </label>

      <label className="form-field">
        <span className="form-label">Professor</span>
        <input
          className="form-input"
          value={form.instructor}
          onChange={(e) => setForm((p) => ({ ...p, instructor: e.target.value }))}
          placeholder="Opcional"
          maxLength={100}
        />
      </label>

      <label className="form-field">
        <span className="form-label">Nível</span>
        <input
          className="form-input"
          value={form.level}
          onChange={(e) => setForm((p) => ({ ...p, level: e.target.value }))}
          placeholder="Opcional"
          list="schedule-level-suggestions"
          maxLength={50}
        />
        <datalist id="schedule-level-suggestions">
          {SCHEDULE_LEVEL_SUGGESTIONS.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </label>

      <div className="form-field schedules-form-grid__full">
        <span className="form-label">Dias da semana *</span>
        <div className="schedules-day-chips" role="group" aria-label="Dias da semana">
          {SCHEDULE_WEEKDAYS.map((day) => {
            const selected = (form.days_of_week || []).includes(day);
            return (
              <button
                key={day}
                type="button"
                className={`schedules-day-chip${selected ? ' schedules-day-chip--active' : ''}`}
                aria-pressed={selected}
                onClick={() => toggleDay(day)}
              >
                {SCHEDULE_WEEKDAY_LABELS[day]}
              </button>
            );
          })}
        </div>
        {errors.days_of_week ? <span className="field-error">{errors.days_of_week}</span> : null}
      </div>

      <label className="form-field">
        <span className="form-label">Início *</span>
        <input
          type="time"
          className="form-input"
          value={form.time_start}
          onChange={(e) => setForm((p) => ({ ...p, time_start: e.target.value }))}
        />
        {errors.time_start ? <span className="field-error">{errors.time_start}</span> : null}
      </label>

      <label className="form-field">
        <span className="form-label">Fim *</span>
        <input
          type="time"
          className="form-input"
          value={form.time_end}
          onChange={(e) => setForm((p) => ({ ...p, time_end: e.target.value }))}
        />
        {errors.time_end ? <span className="field-error">{errors.time_end}</span> : null}
      </label>

      <label className="form-field">
        <span className="form-label">Capacidade neste horário</span>
        <input
          className="form-input"
          type="number"
          min={1}
          max={200}
          value={form.max_capacity}
          onChange={(e) => setForm((p) => ({ ...p, max_capacity: e.target.value }))}
          placeholder="Herdar da turma"
        />
      </label>

      <label className="form-field schedules-form-grid__full schedules-toggle-row">
        <span className="form-label">Ativo</span>
        <label className="schedules-toggle">
          <input
            type="checkbox"
            checked={form.is_active !== false}
            onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
          />
          <span>{form.is_active !== false ? 'Visível na recepção' : 'Oculto na recepção'}</span>
        </label>
      </label>
    </div>
  );
}

export default function SchedulesSection({ academyId, embeddedInLayout = false }) {
  const addToast = useUiStore((s) => s.addToast);
  const schedules = useSchedulesStore((s) => s.schedules);
  const loading = useSchedulesStore((s) => s.loading);
  const fetchSchedules = useSchedulesStore((s) => s.fetchSchedules);
  const createSchedule = useSchedulesStore((s) => s.createSchedule);
  const updateSchedule = useSchedulesStore((s) => s.updateSchedule);
  const toggleScheduleActive = useSchedulesStore((s) => s.toggleScheduleActive);
  const deleteSchedule = useSchedulesStore((s) => s.deleteSchedule);
  const isMutating = useSchedulesStore((s) => s.isMutating);
  const classes = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);
  const classesLoading = useClassesStore((s) => s.loading);

  const classesConfigured = isClassesConfigured();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyScheduleForm());
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const configured = isSchedulesConfigured();

  const load = useCallback(async () => {
    if (!academyId || !configured) return;
    try {
      const tasks = [fetchSchedules(academyId, { activeOnly: false })];
      if (classesConfigured) tasks.push(fetchClasses(academyId, { activeOnly: false }));
      await Promise.all(tasks);
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'load') });
    }
  }, [academyId, configured, classesConfigured, fetchSchedules, fetchClasses, addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const modalitySuggestions = useMemo(() => collectScheduleModalities(schedules), [schedules]);
  const groups = useMemo(() => groupSchedulesByModality(schedules), [schedules]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyScheduleForm());
    setFormErrors({});
    setEditorOpen(true);
  };

  const openEdit = (schedule) => {
    setEditingId(schedule.id);
    setForm({
      class_id: schedule.class_id || '',
      name: schedule.name,
      modality: schedule.modality,
      instructor: schedule.instructor,
      level: schedule.level,
      days_of_week: [...(schedule.days_of_week || [])],
      time_start: schedule.time_start,
      time_end: schedule.time_end,
      is_active: schedule.is_active !== false,
      max_capacity: schedule.max_capacity ?? '',
    });
    setFormErrors({});
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditorOpen(false);
    setEditingId(null);
    setForm(emptyScheduleForm());
    setFormErrors({});
  };

  const handleSave = async () => {
    const validation = validateScheduleForm(form);
    if (!validation.valid) {
      setFormErrors(validation.errors);
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, academy_id: academyId };
      if (editingId) {
        await updateSchedule(editingId, payload);
        addToast({ type: 'success', message: 'Horário atualizado.' });
      } else {
        await createSchedule(payload);
        addToast({ type: 'success', message: 'Horário criado.' });
      }
      closeEditor();
    } catch (e) {
      if (e?.validation) setFormErrors(e.validation);
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (schedule) => {
    try {
      await toggleScheduleActive(schedule.id, schedule.is_active);
      addToast({
        type: 'success',
        message: schedule.is_active ? 'Horário desativado.' : 'Horário reativado.',
      });
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSchedule(deleteTarget.id);
      addToast({ type: 'success', message: 'Horário excluído.' });
      setDeleteTarget(null);
      if (editingId === deleteTarget.id) closeEditor();
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'delete') });
    } finally {
      setDeleting(false);
    }
  };

  if (!configured) {
    return (
      <EmptyState
        icon={Clock}
        title="Grade de horários não configurada"
        description="Defina VITE_APPWRITE_SCHEDULES_COLLECTION_ID=schedules no ambiente e rode npm run provision:booking-schema."
      />
    );
  }

  if (classesConfigured && !classesLoading && !classes.length) {
    return (
      <EmptyState
        icon={Clock}
        title="Cadastre uma turma primeiro"
        description="Horários recorrentes precisam estar vinculados a uma turma na seção acima."
      />
    );
  }

  return (
    <section className={`schedules-section${embeddedInLayout ? ' schedules-section--embedded' : ''}`}>
      <div className="schedules-section__head">
        <div>
          <h2 className="schedules-section__title">Horários</h2>
          <p className="text-small text-muted">
            Horários recorrentes vinculados às turmas. Exibidos na recepção.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={openCreate}>
          <Plus size={16} strokeWidth={2} aria-hidden />
          Novo horário
        </button>
      </div>

      {loading && !schedules.length ? (
        <p className="text-small text-muted" role="status">
          Carregando horários…
        </p>
      ) : null}

      {!loading && !schedules.length ? (
        <EmptyState
          icon={Clock}
          title="Nenhum horário cadastrado"
          description="Crie o primeiro horário para exibir a grade na recepção."
          action={{ label: 'Novo horário', onClick: openCreate }}
        />
      ) : null}

      {groups.map((group) => (
        <div key={group.modality} className="schedules-group card">
          <h3 className="schedules-group__title">{group.modality}</h3>
          <ul className="schedules-list">
            {group.items.map((schedule) => (
              <li key={schedule.id} className="schedules-list__item">
                <div className="schedules-list__main">
                  <div className="schedules-list__name-row">
                    <span className="schedules-list__name">{schedule.name}</span>
                    <span
                      className={`badge ${schedule.is_active ? 'badge-success' : 'badge-secondary'}`}
                    >
                      {schedule.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <p className="schedules-list__meta text-small text-muted">
                    {formatScheduleDays(schedule.days_of_week)} · {schedule.time_start}–
                    {schedule.time_end}
                    {schedule.instructor ? ` · ${schedule.instructor}` : ''}
                    {schedule.level ? ` · ${schedule.level}` : ''}
                  </p>
                </div>
                <div className="schedules-list__actions">
                  <button
                    type="button"
                    className="btn-icon"
                    aria-label="Editar horário"
                    onClick={() => openEdit(schedule)}
                    disabled={isMutating(schedule.id)}
                  >
                    <Pencil size={16} strokeWidth={2} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="btn-icon"
                    aria-label={schedule.is_active ? 'Desativar horário' : 'Ativar horário'}
                    onClick={() => void handleToggle(schedule)}
                    disabled={isMutating(schedule.id)}
                  >
                    <Power size={16} strokeWidth={2} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="btn-icon btn-icon--danger"
                    aria-label="Excluir horário"
                    onClick={() => setDeleteTarget(schedule)}
                    disabled={isMutating(schedule.id)}
                  >
                    <Trash2 size={16} strokeWidth={2} aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {editorOpen ? (
        <div className="schedules-editor card">
          <h3 className="schedules-editor__title">
            {editingId ? 'Editar horário' : 'Novo horário'}
          </h3>
          <ScheduleFormFields
            form={form}
            setForm={setForm}
            errors={formErrors}
            modalitySuggestions={modalitySuggestions}
            classOptions={classes.filter((c) => c.is_active !== false)}
          />
          <div className="schedules-editor__actions">
            <button type="button" className="btn-outline" onClick={closeEditor} disabled={saving}>
              Cancelar
            </button>
            <AsyncButton variant="primary" loading={saving} onClick={() => void handleSave()}>
              Salvar
            </AsyncButton>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Excluir horário?"
        description={
          deleteTarget
            ? `O horário "${deleteTarget.name}" será removido permanentemente.`
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
