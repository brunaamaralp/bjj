import React, { useEffect, useMemo, useState } from 'react';
import ModalShell from '../shared/ModalShell.jsx';
import FieldError from '../shared/FieldError.jsx';
import SearchableSelect from '../shared/SearchableSelect.jsx';
import { useToast } from '../../hooks/useToast.js';
import { SCHEDULE_WEEKDAY_LABELS } from '../../lib/schedules.js';
import {
  NOTES_MAX,
  matchInstructorByName,
  ymdForWeekdayInCurrentWeek,
} from '../../lib/lessonRegister.js';
import { todayYmd } from '../../lib/recepcaoScheduleGrid.js';
import { fetchLessonRegister, saveLessonRegister } from '../../lib/lessonRegisterApi.js';
import {
  isInstructorsConfigured,
  useInstructorsStore,
} from '../../store/instructorsStore.js';

function formatYmdPt(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd || '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   academyId: string,
 *   schedule: object | null,
 *   weekdayId: string,
 *   classDoc?: object | null,
 * }} props
 */
export default function LessonRegisterModal({
  open,
  onClose,
  academyId,
  schedule,
  weekdayId,
  classDoc = null,
}) {
  const { success, error: toastError } = useToast();
  const instructors = useInstructorsStore((s) => s.instructors);
  const fetchInstructors = useInstructorsStore((s) => s.fetchInstructors);
  const createInstructor = useInstructorsStore((s) => s.createInstructor);
  const instructorsLoading = useInstructorsStore((s) => s.loading);

  const slotDate = useMemo(
    () => ymdForWeekdayInCurrentWeek(weekdayId, todayYmd()),
    [weekdayId]
  );

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [slot, setSlot] = useState(null);
  const [instructorId, setInstructorId] = useState('');
  const [notes, setNotes] = useState('');
  const [newName, setNewName] = useState('');
  const [creatingInstructor, setCreatingInstructor] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [loadError, setLoadError] = useState('');

  const isEdit = Boolean(slot?.has_lesson_register);

  useEffect(() => {
    if (!open || !academyId) return;
    if (isInstructorsConfigured()) {
      void fetchInstructors(academyId, { activeOnly: true, silent: true });
    }
  }, [open, academyId, fetchInstructors]);

  useEffect(() => {
    if (!open || !academyId || !schedule?.id || !slotDate) {
      setSlot(null);
      setInstructorId('');
      setNotes('');
      setLoadError('');
      setFieldErrors({});
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError('');
    void fetchLessonRegister(academyId, schedule.id, slotDate)
      .then((data) => {
        if (cancelled) return;
        const s = data.slot || null;
        setSlot(s);
        setNotes(String(s?.lesson_notes || ''));
        const existingId = String(s?.instructor_id || '').trim();
        if (existingId) {
          setInstructorId(existingId);
          return;
        }
        const hint = String(schedule.instructor || classDoc?.instructor || '').trim();
        const match = matchInstructorByName(
          useInstructorsStore.getState().instructors,
          hint
        );
        setInstructorId(match?.id || '');
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e?.message || 'Não foi possível carregar o registro.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, academyId, schedule?.id, schedule?.instructor, classDoc?.instructor, slotDate]);

  useEffect(() => {
    if (!open || instructorId || !schedule) return;
    const hint = String(schedule.instructor || classDoc?.instructor || '').trim();
    if (!hint || !instructors.length) return;
    const match = matchInstructorByName(instructors, hint);
    if (match?.id) setInstructorId(match.id);
  }, [open, instructorId, instructors, schedule, classDoc]);

  const instructorOptions = useMemo(
    () =>
      (instructors || []).map((i) => ({
        value: i.id,
        label: i.name,
      })),
    [instructors]
  );

  const dayLabel = SCHEDULE_WEEKDAY_LABELS[weekdayId] || weekdayId;
  const title = isEdit ? 'Editar registro da aula' : 'Registrar aula';

  const handleCreateInstructor = async () => {
    const name = String(newName || '').trim();
    if (!name) {
      setFieldErrors((p) => ({ ...p, newName: 'Informe o nome.' }));
      return;
    }
    setFieldErrors((p) => ({ ...p, newName: '' }));
    setCreatingInstructor(true);
    try {
      const created = await createInstructor({ name, academy_id: academyId, is_active: true });
      setInstructorId(created.id);
      setNewName('');
      success('Professor cadastrado.');
    } catch (e) {
      toastError(e?.message || 'Falha ao cadastrar professor.');
    } finally {
      setCreatingInstructor(false);
    }
  };

  const handleSave = async () => {
    /** @type {Record<string, string>} */
    const errs = {};
    if (!instructorId) errs.instructor = 'Selecione o professor responsável.';
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    const selected = instructors.find((i) => i.id === instructorId);
    setSaving(true);
    try {
      const data = await saveLessonRegister(academyId, {
        schedule_id: schedule.id,
        slot_date: slotDate,
        instructor_id: instructorId,
        instructor_name: selected?.name || '',
        lesson_notes: notes,
      });
      setSlot(data.slot || null);
      success(isEdit ? 'Registro atualizado.' : 'Aula registrada.');
      onClose?.();
    } catch (e) {
      toastError(e?.message || 'Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <ModalShell
      open={open}
      title={title}
      onClose={onClose}
      maxWidth={480}
      closeOnOverlay={!saving}
      footer={
        <div className="navi-modal-shell__footer-actions" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || loading || Boolean(loadError)}
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      }
    >
      <div className="form-stack" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="text-small text-muted">
          <div>
            <strong>
              {dayLabel} · {formatYmdPt(slotDate)}
            </strong>
          </div>
          <div>
            {schedule?.time_start}–{schedule?.time_end}
            {schedule?.name ? ` · ${schedule.name}` : ''}
          </div>
          {schedule?.modality ? <div>{schedule.modality}</div> : null}
        </div>

        {loading ? <p className="text-muted text-small">Carregando…</p> : null}
        {loadError ? <p className="text-small" style={{ color: 'var(--color-danger, #b91c1c)' }}>{loadError}</p> : null}

        {!isInstructorsConfigured() ? (
          <p className="text-small text-muted">
            Cadastro de professores não configurado. Rode o provisionamento do schema.
          </p>
        ) : (
          <>
            <label className="form-field">
              <span className="form-label">Professor responsável</span>
              <SearchableSelect
                value={instructorId}
                onChange={setInstructorId}
                options={instructorOptions}
                placeholder={instructorsLoading ? 'Carregando…' : 'Buscar professor…'}
                emptyMessage="Nenhum professor cadastrado."
                disabled={loading || saving}
              />
              <FieldError message={fieldErrors.instructor} />
            </label>

            {!instructorOptions.length ? (
              <div className="form-field">
                <span className="form-label">Cadastrar professor</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="form-input"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nome"
                    maxLength={100}
                    disabled={creatingInstructor || saving}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleCreateInstructor}
                    disabled={creatingInstructor || saving}
                  >
                    {creatingInstructor ? '…' : 'Adicionar'}
                  </button>
                </div>
                <FieldError message={fieldErrors.newName} />
              </div>
            ) : (
              <details>
                <summary className="text-small text-muted" style={{ cursor: 'pointer' }}>
                  Cadastrar outro professor
                </summary>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input
                    className="form-input"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nome"
                    maxLength={100}
                    disabled={creatingInstructor || saving}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleCreateInstructor}
                    disabled={creatingInstructor || saving}
                  >
                    {creatingInstructor ? '…' : 'Adicionar'}
                  </button>
                </div>
                <FieldError message={fieldErrors.newName} />
              </details>
            )}
          </>
        )}

        <label className="form-field">
          <span className="form-label">Observações</span>
          <textarea
            className="form-input"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={NOTES_MAX}
            placeholder="Anotações livres sobre a aula…"
            disabled={loading || saving}
          />
        </label>

        {slot?.lesson_recorded_at ? (
          <p className="text-small text-muted">
            Última edição
            {slot.lesson_recorded_by_name ? ` por ${slot.lesson_recorded_by_name}` : ''}
            {': '}
            {new Date(slot.lesson_recorded_at).toLocaleString('pt-BR')}
          </p>
        ) : null}
      </div>
    </ModalShell>
  );
}
