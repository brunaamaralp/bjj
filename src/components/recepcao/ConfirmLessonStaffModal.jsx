import React, { useEffect, useMemo, useState } from 'react';
import ModalShell from '../shared/ModalShell.jsx';
import FieldError from '../shared/FieldError.jsx';
import { useToast } from '../../hooks/useToast.js';
import { friendlyError } from '../../lib/errorMessages.js';
import { confirmLessonStaff } from '../../lib/lessonStaffApi.js';
import {
  LESSON_STATUS_CANCELLED,
  LESSON_STATUS_CONFIRMED,
  parseLessonInstructors,
  validateLessonStaffConfirmInput,
} from '../../../lib/lessonStaffRegister.js';
import { decodeStaffRef, encodeStaffRef } from '../../../lib/staffRoster.js';

function normalizeStoredStaffId(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const decoded = decodeStaffRef(s);
  if (!decoded.id) return '';
  return encodeStaffRef(decoded);
}

function formatDateLabel(ymd) {
  const raw = String(ymd || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const [y, m, d] = raw.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(y, m - 1, d));
}

/**
 * @param {{
 *   open: boolean;
 *   onClose: () => void;
 *   schedule: object | null;
 *   slot: object | null;
 *   dateYmd: string;
 *   teamMembers: { id: string, nome: string }[];
 *   onSaved: (slot: object) => void;
 * }} props
 */
export default function ConfirmLessonStaffModal({
  open,
  onClose,
  schedule,
  slot,
  dateYmd,
  teamMembers = [],
  onSaved,
}) {
  const toast = useToast();
  const [professorId, setProfessorId] = useState('');
  const [instructorIds, setInstructorIds] = useState(() => []);
  const [didNotHappen, setDidNotHappen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProfessorId(normalizeStoredStaffId(slot?.professor_user_id));
    const parsed = parseLessonInstructors(slot).map((e) => normalizeStoredStaffId(e.id)).filter(Boolean);
    setInstructorIds(parsed);
    const cancelled = String(slot?.lesson_status || '') === LESSON_STATUS_CANCELLED;
    setDidNotHappen(cancelled);
    setReason(String(slot?.lesson_cancel_reason || '').trim());
    setError('');
  }, [open, slot]);

  const title = useMemo(() => {
    const name = String(schedule?.name || slot?.name || 'Aula').trim();
    return name || 'Confirmar equipe';
  }, [schedule, slot]);

  const timeRange = useMemo(() => {
    const start = String(schedule?.time_start || slot?.time_start || '').trim();
    const end = String(schedule?.time_end || slot?.time_end || '').trim();
    if (start && end) return `${start}–${end}`;
    return start || end || '';
  }, [schedule, slot]);

  const options = useMemo(
    () =>
      [...(teamMembers || [])].sort((a, b) =>
        String(a.nome).localeCompare(String(b.nome), 'pt-BR')
      ),
    [teamMembers]
  );

  const toggleInstructor = (id) => {
    setInstructorIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setError('');

    const professor = options.find((m) => m.id === professorId);
    const instructors = instructorIds
      .map((id) => {
        const m = options.find((o) => o.id === id);
        return m ? { id: m.id, name: m.nome } : null;
      })
      .filter(Boolean);

    const payload = didNotHappen
      ? {
          lesson_status: LESSON_STATUS_CANCELLED,
          lesson_cancel_reason: reason,
        }
      : {
          lesson_status: LESSON_STATUS_CONFIRMED,
          professor_user_id: professorId,
          professor_name: professor?.nome || '',
          instructors,
        };

    const validation = validateLessonStaffConfirmInput(payload);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setSaving(true);
    try {
      const data = await confirmLessonStaff({
        ...payload,
        slot_id: slot?.id || '',
        schedule_id: schedule?.id || slot?.schedule_id || '',
        date: dateYmd,
      });
      toast.success(didNotHappen ? 'Aula marcada como não realizada.' : 'Equipe da aula confirmada.');
      onSaved?.(data.slot);
      onClose?.();
    } catch (err) {
      setError(friendlyError(err, 'save'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open={open}
      title={title}
      onClose={onClose}
      maxWidth={460}
      closeOnEsc={!saving}
      closeOnOverlay={!saving}
      dialogClassName="recepcao-lesson-staff-modal"
      footer={
        <div className="recepcao-lesson-staff-modal__footer">
          <button
            type="button"
            className="btn-outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn-action-primary"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? 'Salvando…' : didNotHappen ? 'Registrar ausência' : 'Confirmar equipe'}
          </button>
        </div>
      }
    >
      <form className="recepcao-lesson-staff-modal__form" onSubmit={handleSubmit}>
        <div className="recepcao-lesson-staff-modal__meta" aria-live="polite">
          <span className="recepcao-lesson-staff-modal__meta-date">{formatDateLabel(dateYmd)}</span>
          {timeRange ? (
            <span className="recepcao-lesson-staff-modal__meta-time">{timeRange}</span>
          ) : null}
        </div>

        <label className="recepcao-lesson-staff-modal__switch">
          <input
            type="checkbox"
            className="recepcao-lesson-staff-modal__switch-input"
            checked={didNotHappen}
            onChange={(ev) => setDidNotHappen(ev.target.checked)}
            name="did_not_happen"
            disabled={saving}
          />
          <span className="recepcao-lesson-staff-modal__switch-ui" aria-hidden />
          <span className="recepcao-lesson-staff-modal__switch-copy">
            <strong>Não houve aula</strong>
            <span className="text-small text-muted">Feriado, cancelamento ou sem professor/instrutor</span>
          </span>
        </label>

        {didNotHappen ? (
          <div className="form-group">
            <label htmlFor="lesson-staff-reason">Motivo</label>
            <textarea
              id="lesson-staff-reason"
              className="form-input"
              rows={3}
              value={reason}
              onChange={(ev) => setReason(ev.target.value)}
              placeholder="Ex.: feriado, falta de professor…"
              name="lesson_cancel_reason"
              autoComplete="off"
              required
              disabled={saving}
            />
          </div>
        ) : (
          <div className="recepcao-lesson-staff-modal__fields">
            <div className="form-group">
              <label htmlFor="lesson-staff-professor">Professor</label>
              <select
                id="lesson-staff-professor"
                className="form-input"
                value={professorId}
                onChange={(ev) => setProfessorId(ev.target.value)}
                name="professor_user_id"
                autoComplete="off"
                disabled={saving}
              >
                <option value="">Selecionar…</option>
                {options.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </div>
            <fieldset className="form-group recepcao-lesson-staff-modal__instructors">
              <legend>Instrutores</legend>
              {options.length === 0 ? (
                <p className="form-hint">Cadastre pessoas em Equipe para selecionar aqui.</p>
              ) : (
                <ul className="recepcao-lesson-staff-modal__check-list">
                  {options.map((m) => {
                    const checked = instructorIds.includes(m.id);
                    const inputId = `lesson-instructor-${m.id}`;
                    return (
                      <li key={m.id}>
                        <label htmlFor={inputId} className="recepcao-lesson-staff-modal__check">
                          <input
                            id={inputId}
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleInstructor(m.id)}
                            disabled={saving}
                          />
                          <span>{m.nome}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="form-hint">
                Pode marcar vários. Professor ou ao menos um instrutor é obrigatório.
              </p>
            </fieldset>
          </div>
        )}

        {error ? <FieldError>{error}</FieldError> : null}
      </form>
    </ModalShell>
  );
}
