import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DateInput } from './DateInput';
import ModalShell from './shared/ModalShell.jsx';

/**
 * @param {{
 *   open: boolean;
 *   onClose: () => void;
 *   onConfirm: (data: { date: string; time: string; note: string }) => Promise<void>;
 *   lead: { id?: string; name?: string } | null;
 *   quickTimes: string[];
 *   initialDate: string;
 *   initialTime: string;
 *   title?: string;
 * }} props
 */
export default function ScheduleModal({
  open,
  onClose,
  onConfirm,
  lead,
  quickTimes = [],
  initialDate = '',
  initialTime = '',
  title = 'Agendar aula experimental',
}) {
  const [date, setDate] = useState(initialDate || '');
  const [time, setTime] = useState(initialTime || '');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const dateRef = useRef(null);
  const timeRef = useRef(null);

  useEffect(() => {
    if (open) {
      setDate(initialDate || '');
      setTime(initialTime || '');
      setNote('');
    }
  }, [open, initialDate, initialTime]);

  const handleClose = useCallback(() => {
    if (!saving) onClose();
  }, [onClose, saving]);

  const handleConfirm = useCallback(async () => {
    if (!date) {
      dateRef.current?.focus();
      return;
    }
    if (!time) {
      timeRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      await onConfirm({ date, time, note: note || '' });
      onClose();
    } catch {
      // erro tratado pelo pai; modal permanece aberto
    } finally {
      setSaving(false);
    }
  }, [date, time, note, onConfirm, onClose]);

  const leadName = String(lead?.name || '').trim() || '—';

  return (
    <ModalShell
      open={open}
      title={title}
      onClose={handleClose}
      closeOnOverlay={!saving}
      closeOnEsc={!saving}
      showCloseButton={!saving}
      maxWidth={400}
      className="navi-modal-overlay--form"
      dialogClassName="schedule-modal-dialog"
      footer={
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          <button
            type="button"
            className="btn-outline"
            disabled={saving}
            onClick={handleClose}
            style={{ flex: 1, fontWeight: 700 }}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={saving}
            onClick={() => void handleConfirm()}
            style={{
              flex: 2,
              fontWeight: 700,
              background: 'var(--petroleo)',
              color: '#fff',
              border: 'none',
            }}
          >
            {saving ? 'Salvando...' : 'Confirmar agendamento'}
          </button>
        </div>
      }
    >
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>{leadName}</p>

      <div>
        <DateInput
          ref={dateRef}
          label="Data"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>

      <div>
        {quickTimes?.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {quickTimes.map((chip) => {
              const active = time === chip;
              return (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setTime(chip)}
                  style={{
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    background: active ? 'var(--petroleo)' : 'var(--accent-light)',
                    color: active ? '#fff' : 'var(--cosmos)',
                  }}
                >
                  {chip}
                </button>
              );
            })}
          </div>
        ) : null}
        <DateInput
          ref={timeRef}
          label="Horário"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          required
        />
      </div>

      <div className="form-group">
        <label className="form-label">
          Observação <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(opcional)</span>
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ex: Veio com o pai, prefere treinar à noite..."
          rows={3}
          className="form-input"
          style={{ resize: 'none', minHeight: 64 }}
        />
      </div>
    </ModalShell>
  );
}
