import React, { useEffect, useMemo, useState } from 'react';
import { DateInput } from '../DateInput';
import {
  FREEZE_MAX_DAYS_PER_YEAR,
  computeReturnYmd,
  effectiveFreezeDaysUsed,
  freezeDaysRemaining,
  validateFreezeRequest,
  toYmd,
} from '../../lib/planFreeze.js';

function todayYmd() {
  return toYmd(new Date());
}

export default function PlanFreezeModal({ open, student, onClose, onConfirm, busy = false }) {
  const [startYmd, setStartYmd] = useState(todayYmd());
  const [endYmd, setEndYmd] = useState('');
  const [durationDays, setDurationDays] = useState(30);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const daysUsed = effectiveFreezeDaysUsed(student);
  const daysAvailable = freezeDaysRemaining(student);

  useEffect(() => {
    if (!open) return;
    const start = todayYmd();
    const dur = Math.min(30, Math.max(1, daysAvailable || 1));
    setStartYmd(start);
    setDurationDays(dur);
    setEndYmd(computeReturnYmd(start, dur));
    setReason('');
    setError('');
  }, [open, daysAvailable]);

  useEffect(() => {
    if (!startYmd || durationDays < 1) return;
    setEndYmd(computeReturnYmd(startYmd, durationDays));
  }, [startYmd, durationDays]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, busy]);

  const validation = useMemo(
    () => validateFreezeRequest({ startYmd, endYmd, durationDays, student }),
    [startYmd, endYmd, durationDays, student]
  );

  if (!open) return null;

  const handleDurationChange = (raw) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) {
      setDurationDays(1);
      return;
    }
    if (n > daysAvailable) {
      setDurationDays(daysAvailable);
      setError(`Limite de ${FREEZE_MAX_DAYS_PER_YEAR} dias atingido. Disponível: ${daysAvailable} dias.`);
      return;
    }
    setDurationDays(Math.trunc(n));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    setError('');
    try {
      await onConfirm({
        startYmd: validation.startYmd,
        endYmd: validation.endYmd,
        durationDays: validation.days,
        reason: reason.trim(),
      });
    } catch (err) {
      setError(err?.message || 'Não foi possível trancar o plano.');
    }
  };

  const startLabel = startYmd
    ? new Date(`${startYmd}T12:00:00`).toLocaleDateString('pt-BR')
    : '—';

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-freeze-title"
        style={{
          background: 'var(--surface)',
          borderRadius: 16,
          padding: 24,
          width: '100%',
          maxWidth: 460,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: 'var(--shadow)',
          border: '1px solid var(--border)',
          margin: 16,
          boxSizing: 'border-box',
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h3 id="plan-freeze-title" style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>
          Trancamento de plano
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          <label style={{ fontSize: 13 }}>
            <span style={{ display: 'block', marginBottom: 4, color: 'var(--text-secondary)' }}>Data de início</span>
            <DateInput value={startYmd} onChange={(e) => setStartYmd(e.target.value)} disabled={busy} />
          </label>
          <label style={{ fontSize: 13 }}>
            <span style={{ display: 'block', marginBottom: 4, color: 'var(--text-secondary)' }}>Data de retorno</span>
            <DateInput value={endYmd} onChange={(e) => setEndYmd(e.target.value)} disabled={busy} />
          </label>
          <label style={{ fontSize: 13 }}>
            <span style={{ display: 'block', marginBottom: 4, color: 'var(--text-secondary)' }}>Duração (dias)</span>
            <input
              type="number"
              className="form-input"
              min={1}
              max={daysAvailable}
              value={durationDays}
              onChange={(e) => handleDurationChange(e.target.value)}
              disabled={busy}
            />
          </label>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
          Dias utilizados este ano: <strong>{daysUsed}</strong> de {FREEZE_MAX_DAYS_PER_YEAR}
          <br />
          Dias disponíveis: <strong>{daysAvailable}</strong> dias
        </p>

        <label style={{ display: 'block', fontSize: 13, marginBottom: 12 }}>
          <span style={{ display: 'block', marginBottom: 4, color: 'var(--text-secondary)' }}>Motivo (opcional)</span>
          <input
            type="text"
            className="form-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={256}
            disabled={busy}
          />
        </label>

        <p
          style={{
            fontSize: 12,
            color: 'var(--warning)',
            background: 'var(--warning-light)',
            padding: '10px 12px',
            borderRadius: 8,
            margin: '0 0 16px',
            lineHeight: 1.45,
          }}
        >
          O acesso na catraca será bloqueado a partir de {startLabel}.
          <br />
          O plano será estendido em {durationDays} dias ao final do período.
        </p>

        {error ? (
          <p style={{ color: 'var(--danger)', fontSize: 13, margin: '0 0 12px' }}>{error}</p>
        ) : null}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-outline" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={busy || daysAvailable < 1}>
            {busy ? 'Salvando…' : 'Confirmar trancamento'}
          </button>
        </div>
      </form>
    </div>
  );
}
