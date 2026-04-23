import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DateInput } from './DateInput';

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

  const handleOverlayClick = useCallback(() => {
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

  if (!open) return null;

  const leadName = String(lead?.name || '').trim() || '—';

  return (
    <div
      role="presentation"
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          borderRadius: 'var(--radius-sm, 12px)',
          width: 'min(400px, calc(100vw - 32px))',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            padding: '16px 20px',
            borderBottom: '0.5px solid var(--border-light)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2 id="schedule-modal-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
              {title}
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>{leadName}</p>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            disabled={saving}
            onClick={() => !saving && onClose()}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 20,
              lineHeight: 1,
              color: 'var(--text-muted)',
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 20 }}>
          <div style={{ marginBottom: 16 }}>
            <DateInput
              ref={dateRef}
              label="Data"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: 16 }}>
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
                        background: active ? '#5B3FBF' : '#EEEDFE',
                        color: active ? '#fff' : '#3C3489',
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

          <div>
            <label
              style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: 8,
              }}
            >
              Observação <span style={{ textTransform: 'none', fontWeight: 500 }}>(opcional)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex: Veio com o pai, prefere treinar à noite..."
              rows={3}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                height: 64,
                resize: 'none',
                fontSize: 14,
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '12px 20px 20px',
          }}
        >
          <button
            type="button"
            className="btn-outline"
            disabled={saving}
            onClick={() => !saving && onClose()}
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
              background: '#5B3FBF',
              color: '#fff',
              border: 'none',
            }}
          >
            {saving ? 'Salvando...' : 'Confirmar agendamento'}
          </button>
        </div>
      </div>
    </div>
  );
}
