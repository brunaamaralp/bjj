import React, { useCallback, useState } from 'react';
import { DateInput } from './DateInput';
import { todayYmdLocal } from '../lib/studentOffboarding.js';
import { useTerms } from '../lib/terminology.js';
import ModalShell from './shared/ModalShell.jsx';

export default function DeactivateStudentModal({
  studentName,
  exitReasons = [],
  onConfirm,
  onCancel,
  busy = false,
}) {
  const terms = useTerms();
  const studentLabel = terms.student.toLowerCase();
  const [selectedReason, setSelectedReason] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const [exitDate, setExitDate] = useState(() => todayYmdLocal());
  const [exitNotes, setExitNotes] = useState('');
  const [cancelFuturePayments, setCancelFuturePayments] = useState(false);
  const [sendRescissionTerm, setSendRescissionTerm] = useState(false);

  const isOther = String(selectedReason || '').trim().toLowerCase() === 'outro';
  const resolvedReason = isOther ? otherReason.trim() : String(selectedReason || '').trim();
  const canConfirm = Boolean(resolvedReason && exitDate && !busy);

  const handleClose = useCallback(() => {
    if (busy) return;
    onCancel();
  }, [busy, onCancel]);

  return (
    <ModalShell
      open
      title={`Desligar ${studentLabel} (saída definitiva)`}
      onClose={handleClose}
      closeOnOverlay={!busy}
      closeOnEsc={!busy}
      showCloseButton={!busy}
      maxWidth={440}
      className="navi-modal-overlay--form"
      dialogClassName="deactivate-student-modal"
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
          <button type="button" className="btn-outline" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!canConfirm}
            onClick={() =>
              canConfirm &&
              onConfirm({
                exitReason: resolvedReason,
                exitDate: String(exitDate || '').slice(0, 10),
                exitNotes: String(exitNotes || '').trim(),
                cancelFuturePayments,
                sendRescissionTerm,
              })
            }
            style={{
              background: canConfirm ? 'var(--danger)' : 'var(--border)',
              borderColor: canConfirm ? 'var(--danger)' : 'var(--border)',
              opacity: canConfirm ? 1 : 0.7,
            }}
          >
            {busy ? 'Salvando…' : `Desligar ${studentLabel}`}
          </button>
        </div>
      }
    >
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>
        Encerra a matrícula de <strong>{studentName}</strong>. O histórico é mantido; o {studentLabel} deixa de
        aparecer em cobranças ativas e no funil.
      </p>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: 'var(--text-secondary)',
          lineHeight: 1.45,
          padding: '8px 10px',
          borderRadius: 8,
          background: 'var(--surface-muted, #f8fafc)',
          border: '1px solid var(--border-light)',
        }}
      >
        Para pausa temporária (viagem, licença médica etc.), use <strong>Trancar matrícula</strong> — não o
        desligamento.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="info-mini-label" style={{ alignSelf: 'flex-start' }}>
          Motivo da saída
        </span>
        {exitReasons.map((reason) => (
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
              name="exitReason"
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
        <div className="form-group">
          <label className="text-small" style={{ fontWeight: 600 }}>
            Descreva o motivo
          </label>
          <input
            type="text"
            className="form-input"
            value={otherReason}
            disabled={busy}
            onChange={(e) => setOtherReason(e.target.value)}
            placeholder="Motivo da saída"
            autoFocus
          />
        </div>
      ) : null}

      <div className="form-group">
        <label className="text-small" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
          Data de saída
        </label>
        <DateInput
          value={exitDate}
          onChange={(e) => setExitDate(e.target.value)}
          disabled={busy}
        />
      </div>

      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          fontSize: 13,
          color: 'var(--text)',
          cursor: busy ? 'not-allowed' : 'pointer',
          opacity: busy ? 0.7 : 1,
        }}
      >
        <input
          type="checkbox"
          checked={cancelFuturePayments}
          disabled={busy}
          onChange={(e) => setCancelFuturePayments(e.target.checked)}
          style={{ marginTop: 2, accentColor: 'var(--purple)' }}
        />
        <span>
          <strong>Cancelar cobranças futuras</strong>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Mensalidades pendentes ou agendadas serão canceladas no desligamento.
          </span>
        </span>
      </label>

      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          fontSize: 13,
          color: 'var(--text)',
          cursor: busy ? 'not-allowed' : 'pointer',
          opacity: busy ? 0.7 : 1,
        }}
      >
        <input
          type="checkbox"
          checked={sendRescissionTerm}
          disabled={busy}
          onChange={(e) => setSendRescissionTerm(e.target.checked)}
          style={{ marginTop: 2, accentColor: 'var(--purple)' }}
        />
        <span>
          <strong>Enviar termo de rescisão para assinatura</strong>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Após salvar o desligamento, abre o envio do termo (modelo de rescisão do plano em Financeiro →
            Planos). Você também pode enviar depois em Contratos no perfil do aluno.
          </span>
        </span>
      </label>

      <div className="form-group">
        <label className="text-small" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
          Observações (opcional)
        </label>
        <textarea
          className="form-input"
          rows={3}
          value={exitNotes}
          disabled={busy}
          onChange={(e) => setExitNotes(e.target.value)}
          placeholder="Informações adicionais sobre o desligamento"
          style={{ resize: 'vertical', minHeight: 72 }}
        />
      </div>
    </ModalShell>
  );
}
