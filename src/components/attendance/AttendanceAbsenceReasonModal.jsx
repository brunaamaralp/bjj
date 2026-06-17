import React, { useCallback, useEffect, useState } from 'react';
import ModalShell from '../shared/ModalShell.jsx';
import FieldError from '../shared/FieldError.jsx';
import {
  ATTENDANCE_ABSENCE_REASONS,
  ATTENDANCE_ABSENCE_SNOOZE_OPTIONS,
  DEFAULT_ATTENDANCE_ABSENCE_SNOOZE_DAYS,
} from '../../../lib/attendanceRetentionCore.js';
import './attendance-at-risk.css';

/**
 * @param {{
 *   open: boolean;
 *   studentName?: string;
 *   busy?: boolean;
 *   onConfirm: (payload: { reason: string; notes: string; snoozeDays: number }) => void;
 *   onCancel: () => void;
 * }} props
 */
export default function AttendanceAbsenceReasonModal({
  open,
  studentName = '',
  busy = false,
  onConfirm,
  onCancel,
}) {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [snoozeDays, setSnoozeDays] = useState(DEFAULT_ATTENDANCE_ABSENCE_SNOOZE_DAYS);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setReason('');
      setNotes('');
      setSnoozeDays(DEFAULT_ATTENDANCE_ABSENCE_SNOOZE_DAYS);
      setError('');
    }
  }, [open]);

  const handleClose = useCallback(() => {
    if (busy) return;
    onCancel();
  }, [busy, onCancel]);

  const handleConfirm = () => {
    if (!reason) {
      setError('Selecione um motivo.');
      return;
    }
    setError('');
    onConfirm({ reason, notes: String(notes || '').trim(), snoozeDays });
  };

  if (!open) return null;

  return (
    <ModalShell
      open
      title="Registrar motivo de ausência"
      onClose={handleClose}
      closeOnOverlay={!busy}
      closeOnEsc={!busy}
      showCloseButton={!busy}
      maxWidth={420}
      className="navi-modal-overlay--form attendance-absence-modal"
      footer={
        <div className="attendance-absence-modal__footer">
          <button type="button" className="btn-outline" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" onClick={handleConfirm} disabled={busy || !reason}>
            {busy ? 'Salvando…' : 'Registrar'}
          </button>
        </div>
      }
    >
      <p className="attendance-absence-modal__lead">
        {studentName ? (
          <>
            Motivo da ausência de <strong>{studentName}</strong>
          </>
        ) : (
          'Selecione o motivo da ausência'
        )}
      </p>
      <fieldset className="attendance-absence-reasons" disabled={busy}>
        <legend className="sr-only">Motivo</legend>
        <div className="attendance-absence-reasons__list">
          {ATTENDANCE_ABSENCE_REASONS.map((opt) => (
            <label
              key={opt.id}
              className={`attendance-absence-reasons__option${busy ? ' attendance-absence-reasons__option--disabled' : ''}`}
            >
              <input
                type="radio"
                name="absence_reason"
                value={opt.id}
                checked={reason === opt.id}
                onChange={() => setReason(opt.id)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {error ? <FieldError message={error} /> : null}
      <label className="attendance-absence-snooze">
        <span className="attendance-absence-snooze__label">Ocultar da fila por</span>
        <select
          className="student-profile-data-input"
          value={snoozeDays}
          disabled={busy}
          onChange={(e) => setSnoozeDays(Number(e.target.value))}
        >
          {ATTENDANCE_ABSENCE_SNOOZE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="attendance-absence-notes">
        <span className="attendance-absence-notes__label">Observação (opcional)</span>
        <textarea
          className="student-profile-data-input"
          rows={3}
          value={notes}
          disabled={busy}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Detalhes adicionais"
        />
      </label>
    </ModalShell>
  );
}
