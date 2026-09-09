import React, { useEffect, useMemo, useState } from 'react';
import ModalShell from '../shared/ModalShell.jsx';
import FieldError from '../shared/FieldError.jsx';
import { useToast } from '../../hooks/useToast.js';
import { friendlyError } from '../../lib/errorMessages.js';
import { confirmLessonStaff } from '../../lib/lessonStaffApi.js';
import {
  LESSON_STATUS_CANCELLED,
  LESSON_STATUS_CONFIRMED,
  validateLessonStaffConfirmInput,
} from '../../../lib/lessonStaffRegister.js';

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
  const [instructorId, setInstructorId] = useState('');
  const [didNotHappen, setDidNotHappen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProfessorId(String(slot?.professor_user_id || '').trim());
    setInstructorId(String(slot?.instructor_user_id || '').trim());
    const cancelled = String(slot?.lesson_status || '') === LESSON_STATUS_CANCELLED;
    setDidNotHappen(cancelled);
    setReason(String(slot?.lesson_cancel_reason || '').trim());
    setError('');
  }, [open, slot]);

  const title = useMemo(() => {
    const name = String(schedule?.name || slot?.name || 'Aula').trim();
    const time = `${schedule?.time_start || slot?.time_start || ''}–${schedule?.time_end || slot?.time_end || ''}`.trim();
    return time ? `${name} · ${time}` : name;
  }, [schedule, slot]);

  const options = useMemo(
    () =>
      [...(teamMembers || [])].sort((a, b) =>
        String(a.nome).localeCompare(String(b.nome), 'pt-BR')
      ),
    [teamMembers]
  );

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setError('');

    const professor = options.find((m) => m.id === professorId);
    const instructor = options.find((m) => m.id === instructorId);
    const payload = didNotHappen
      ? {
          lesson_status: LESSON_STATUS_CANCELLED,
          lesson_cancel_reason: reason,
        }
      : {
          lesson_status: LESSON_STATUS_CONFIRMED,
          professor_user_id: professorId,
          professor_name: professor?.nome || '',
          instructor_user_id: instructorId,
          instructor_name: instructor?.nome || '',
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
      toast.success(didNotHappen ? 'Aula marcada como não realizada.' : 'Staff da aula confirmado.');
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
      maxWidth={480}
      footer={
        <div className="navi-modal-shell__footer-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Salvando…' : 'Confirmar'}
          </button>
        </div>
      }
    >
      <form className="stack-form" onSubmit={handleSubmit}>
        <p className="text-small text-muted" style={{ marginTop: 0 }}>
          Data: <strong>{dateYmd}</strong>. Escolha quem deu a aula ou marque que não houve.
        </p>

        <label className="field-check">
          <input
            type="checkbox"
            checked={didNotHappen}
            onChange={(ev) => setDidNotHappen(ev.target.checked)}
          />
          <span>Não houve aula</span>
        </label>

        {didNotHappen ? (
          <label className="field">
            <span className="field-label">Motivo</span>
            <textarea
              className="input"
              rows={3}
              value={reason}
              onChange={(ev) => setReason(ev.target.value)}
              placeholder="Ex.: feriado, falta de professor…"
              required
            />
          </label>
        ) : (
          <>
            <label className="field">
              <span className="field-label">Professor</span>
              <select
                className="input"
                value={professorId}
                onChange={(ev) => setProfessorId(ev.target.value)}
              >
                <option value="">— Selecionar —</option>
                {options.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Instrutor</span>
              <select
                className="input"
                value={instructorId}
                onChange={(ev) => setInstructorId(ev.target.value)}
              >
                <option value="">— Selecionar —</option>
                {options.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {error ? <FieldError>{error}</FieldError> : null}
      </form>
    </ModalShell>
  );
}
