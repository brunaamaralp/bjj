import React, { useEffect, useMemo, useState } from 'react';
import ModalShell from '../shared/ModalShell.jsx';
import { decodeStaffRef, encodeStaffRef } from '../../../lib/staffRoster.js';
import { readExperimentalProfessor } from '../../../lib/experimentalProfessor.js';

function normalizeStoredStaffId(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const decoded = decodeStaffRef(s);
  if (!decoded.id) return '';
  return encodeStaffRef(decoded);
}

/**
 * Modal para escolher o professor da experimental (opcional).
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   lead: object | null,
 *   mode?: 'attended' | 'missed' | 'edit',
 *   options: { id: string, nome: string }[],
 *   onConfirm: (selection: { userId: string, name: string } | undefined) => void | Promise<void>,
 *   saving?: boolean,
 * }} props
 *
 * onConfirm(undefined) = continuar sem alterar o professor.
 * onConfirm({ userId, name }) = gravar (userId vazio limpa).
 */
export default function ConfirmExperimentalProfessorModal({
  open,
  onClose,
  lead,
  mode = 'attended',
  options = [],
  onConfirm,
  saving = false,
}) {
  const [professorId, setProfessorId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProfessorId(normalizeStoredStaffId(readExperimentalProfessor(lead).userId));
    setSubmitting(false);
  }, [open, lead]);

  const title = useMemo(() => {
    if (mode === 'edit') return 'Professor da experimental';
    if (mode === 'missed') return 'Registrar não compareceu';
    return 'Registrar comparecimento';
  }, [mode]);

  const leadName = String(lead?.name || '').trim() || 'Lead';

  const busy = saving || submitting;

  const resolveSelection = () => {
    const id = String(professorId || '').trim();
    if (!id) return { userId: '', name: '' };
    const opt = options.find((o) => o.id === id);
    return { userId: id, name: String(opt?.nome || '').trim() || id };
  };

  const handleConfirm = async () => {
    if (busy) return;
    setSubmitting(true);
    try {
      await onConfirm(resolveSelection());
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    if (busy || mode === 'edit') return;
    setSubmitting(true);
    try {
      await onConfirm(undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={busy ? undefined : onClose}
      title={title}
      maxWidth={420}
      footer={
        <>
          {mode === 'edit' ? (
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
          ) : (
            <button type="button" className="btn-ghost" onClick={handleSkip} disabled={busy}>
              Continuar sem informar
            </button>
          )}
          <button type="button" className="btn-primary" onClick={handleConfirm} disabled={busy}>
            {busy ? 'Salvando…' : mode === 'edit' ? 'Salvar' : 'Confirmar'}
          </button>
        </>
      }
    >
      <p className="text-small text-muted mb-3">
        {mode === 'edit'
          ? `Quem conduziu a experimental de ${leadName}?`
          : `Quem conduziu a experimental de ${leadName}? (opcional — pode completar depois)`}
      </p>
      <div className="form-group">
        <label htmlFor="experimental-professor-select">Professor / instrutor</label>
        <select
          id="experimental-professor-select"
          className="form-input"
          value={professorId}
          onChange={(ev) => setProfessorId(ev.target.value)}
          name="experimental_professor_user_id"
          autoComplete="off"
          disabled={busy}
        >
          <option value="">Selecionar…</option>
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
            </option>
          ))}
        </select>
        {options.length === 0 ? (
          <p className="form-hint">Cadastre pessoas em Equipe (ou roster) para selecionar aqui.</p>
        ) : (
          <p className="form-hint">Usado para comissão (compareceu) e conversão por responsável.</p>
        )}
      </div>
    </ModalShell>
  );
}
