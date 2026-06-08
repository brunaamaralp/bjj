import React, { useEffect, useMemo, useState } from 'react';
import { DateInput } from '../DateInput';
import {
  FREEZE_MAX_DAYS_PER_YEAR,
  computeReturnYmd,
  computeDurationDays,
  effectiveFreezeDaysUsed,
  freezeDaysRemaining,
  minRetroactiveStartYmd,
  validateFreezeRequest,
  toYmd,
  formatFreezeDateBr,
} from '../../lib/planFreeze.js';

function todayYmd() {
  return toYmd(new Date());
}

export default function PlanFreezeModal({
  open,
  student,
  freezeReasons = [],
  onClose,
  onConfirm,
  busy = false,
}) {
  const [startYmd, setStartYmd] = useState(todayYmd());
  const [endYmd, setEndYmd] = useState('');
  const [durationDays, setDurationDays] = useState(30);
  const [indefinite, setIndefinite] = useState(false);
  const [selectedReason, setSelectedReason] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const [error, setError] = useState('');

  const daysUsed = effectiveFreezeDaysUsed(student);
  const daysAvailable = freezeDaysRemaining(student);
  const minStartYmd = minRetroactiveStartYmd(student);
  const isOther = String(selectedReason || '').trim().toLowerCase() === 'outro';
  const resolvedReason = isOther ? otherReason.trim() : String(selectedReason || '').trim();
  const reasons = freezeReasons.length > 0 ? freezeReasons : ['Viagem', 'Licença médica', 'Outro'];

  const retroactiveDays = useMemo(() => {
    const today = todayYmd();
    if (!startYmd || startYmd >= today) return 0;
    return computeDurationDays(startYmd, today);
  }, [startYmd]);

  useEffect(() => {
    if (!open) return;
    const start = todayYmd();
    const dur = Math.min(30, Math.max(1, daysAvailable || 1));
    setStartYmd(start);
    setDurationDays(dur);
    setEndYmd(computeReturnYmd(start, dur));
    setIndefinite(false);
    setSelectedReason('');
    setOtherReason('');
    setError('');
  }, [open, daysAvailable]);

  useEffect(() => {
    if (!open || indefinite) return;
    if (!startYmd || durationDays < 1) return;
    setEndYmd(computeReturnYmd(startYmd, durationDays));
  }, [open, startYmd, durationDays, indefinite]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, busy]);

  const validation = useMemo(
    () =>
      validateFreezeRequest({
        startYmd,
        endYmd: indefinite ? '' : endYmd,
        durationDays: indefinite ? undefined : durationDays,
        student,
        indefinite,
      }),
    [startYmd, endYmd, durationDays, student, indefinite]
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
    if (!resolvedReason) {
      setError('Selecione o motivo do trancamento.');
      return;
    }
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
        indefinite: validation.indefinite === true,
        reason: resolvedReason,
      });
    } catch (err) {
      setError(err?.message || 'Não foi possível trancar a matrícula.');
    }
  };

  const startLabel = startYmd
    ? new Date(`${startYmd}T12:00:00`).toLocaleDateString('pt-BR')
    : '—';

  return (
    <div
      role="presentation"
      className="navi-modal-overlay"
      style={{ zIndex: 9999, padding: 16 }}
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
        <h3 id="plan-freeze-title" style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700 }}>
          Trancar matrícula (pausa temporária)
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>
          O aluno permanece cadastrado. Cobranças do período são pausadas e o acesso na catraca pode ser bloqueado. Para
          saída definitiva, use <strong>Desligar aluno</strong>.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          <label style={{ fontSize: 13 }}>
            <span style={{ display: 'block', marginBottom: 4, color: 'var(--text-secondary)' }}>Data de início</span>
            <DateInput value={startYmd} onChange={(e) => setStartYmd(e.target.value)} disabled={busy} />
            <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
              Retroativo permitido desde {formatFreezeDateBr(minStartYmd)}
            </span>
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 8,
              cursor: busy ? 'not-allowed' : 'pointer',
              border: `1px solid ${indefinite ? 'var(--purple)' : 'var(--border)'}`,
              background: indefinite ? 'var(--purple-light)' : 'transparent',
              opacity: busy ? 0.7 : 1,
            }}
          >
            <input
              type="checkbox"
              checked={indefinite}
              disabled={busy}
              onChange={(e) => setIndefinite(e.target.checked)}
              style={{ accentColor: 'var(--purple)', marginTop: 3 }}
            />
            <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.45 }}>
              Retorno indefinido — reabrir manualmente quando o aluno voltar
            </span>
          </label>

          {!indefinite ? (
            <>
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
            </>
          ) : null}
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
          Dias utilizados este ano: <strong>{daysUsed}</strong> de {FREEZE_MAX_DAYS_PER_YEAR}
          <br />
          Dias disponíveis: <strong>{daysAvailable}</strong> dias
          {retroactiveDays > 0 ? (
            <>
              <br />
              <span style={{ color: 'var(--warning)' }}>
                Início retroativo: {retroactiveDays} dia{retroactiveDays === 1 ? '' : 's'} já decorridos entram na cota.
              </span>
            </>
          ) : null}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          <span className="info-mini-label" style={{ alignSelf: 'flex-start' }}>
            Motivo do trancamento
          </span>
          {reasons.map((reason) => (
            <label
              key={reason}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 8,
                cursor: busy ? 'not-allowed' : 'pointer',
                border: `1px solid ${selectedReason === reason ? 'var(--purple)' : 'var(--border)'}`,
                background: selectedReason === reason ? 'var(--purple-light)' : 'transparent',
                opacity: busy ? 0.7 : 1,
              }}
            >
              <input
                type="radio"
                name="freezeReason"
                value={reason}
                checked={selectedReason === reason}
                disabled={busy}
                onChange={() => setSelectedReason(reason)}
                style={{ accentColor: 'var(--purple)' }}
              />
              <span style={{ fontSize: 14, color: 'var(--text)' }}>{reason}</span>
            </label>
          ))}
        </div>

        {isOther ? (
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="text-small" style={{ fontWeight: 600 }}>
              Descreva o motivo
            </label>
            <input
              type="text"
              className="form-input"
              value={otherReason}
              disabled={busy}
              onChange={(e) => setOtherReason(e.target.value)}
              placeholder="Motivo do trancamento"
              maxLength={256}
              autoFocus
            />
          </div>
        ) : null}

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
          {indefinite
            ? 'Sem data de retorno — encerre o trancamento manualmente quando o aluno voltar. O plano será estendido pelos dias efetivamente utilizados.'
            : `O plano será estendido em ${durationDays} dias ao final do período.`}
        </p>

        {error ? (
          <p style={{ color: 'var(--danger)', fontSize: 13, margin: '0 0 12px' }}>{error}</p>
        ) : null}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-outline" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={busy || daysAvailable < 1 || !resolvedReason || (isOther && !otherReason.trim())}
          >
            {busy ? 'Salvando…' : 'Confirmar trancamento'}
          </button>
        </div>
      </form>
    </div>
  );
}
