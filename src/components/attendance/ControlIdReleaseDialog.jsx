import '../../styles/confirm-dialog.css';
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { DoorOpen } from 'lucide-react';
import AsyncButton from '../shared/AsyncButton.jsx';
import FieldError from '../shared/FieldError.jsx';
import useDialogFocus from '../../hooks/useDialogFocus.js';
import {
  CONTROLID_RELEASE_REASON_MAX,
  CONTROLID_RELEASE_REASON_SUGGESTIONS,
  normalizeReleaseReason,
  validateReleaseReason,
} from '../../../lib/controlidRelease.js';

function ControlIdReleaseForm({ loading = false, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState('');
  const handleClose = useCallback(() => {
    if (!loading) onClose?.();
  }, [loading, onClose]);
  const dialogRef = useDialogFocus(true, handleClose);

  const trimmed = normalizeReleaseReason(reason);
  const canConfirm = trimmed.length >= 3 && trimmed.length <= CONTROLID_RELEASE_REASON_MAX;

  const submit = () => {
    const err = validateReleaseReason(reason);
    if (err) {
      setFieldError(err);
      return;
    }
    setFieldError('');
    onConfirm?.(trimmed);
  };

  return (
    <div
      className="navi-confirm-overlay"
      role="presentation"
      onClick={handleClose}
      style={{ overscrollBehavior: 'contain' }}
    >
      <div
        ref={dialogRef}
        className="navi-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="controlid-release-title"
        tabIndex={-1}
        style={{ textAlign: 'left', maxWidth: 420, overscrollBehavior: 'contain' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="navi-confirm-icon-wrap"
          aria-hidden
          style={{ background: 'var(--purple-light)', margin: '0 0 16px' }}
        >
          <DoorOpen size={26} strokeWidth={2} style={{ color: 'var(--v500)' }} />
        </div>
        <h2 id="controlid-release-title" className="navi-confirm-title" style={{ textAlign: 'center' }}>
          Liberar passagem?
        </h2>
        <p className="navi-confirm-desc text-small text-muted" style={{ textAlign: 'center', marginBottom: 16 }}>
          A catraca será liberada remotamente. Informe o motivo para registro na auditoria.
        </p>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="info-mini-label" htmlFor="controlid-release-reason">
            Motivo <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <textarea
            id="controlid-release-reason"
            name="controlid_release_reason"
            className="form-input"
            rows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (fieldError) setFieldError('');
            }}
            placeholder="Ex.: visitante aguardando aula experimental…"
            maxLength={CONTROLID_RELEASE_REASON_MAX}
            disabled={loading}
            autoComplete="off"
            style={{ resize: 'vertical', minHeight: 72 }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {CONTROLID_RELEASE_REASON_SUGGESTIONS.map((label) => (
              <button
                key={label}
                type="button"
                className="btn-outline"
                style={{ fontSize: 12, padding: '4px 10px' }}
                disabled={loading}
                onClick={() => {
                  setReason(label);
                  setFieldError('');
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <FieldError message={fieldError} />
        </div>

        <div className="navi-confirm-actions">
          <button type="button" className="btn-outline" onClick={handleClose} disabled={loading}>
            Cancelar
          </button>
          <AsyncButton variant="primary" loading={loading} onClick={submit} disabled={loading || !canConfirm}>
            Liberar
          </AsyncButton>
        </div>
      </div>
    </div>
  );
}

/**
 * Confirma liberação manual da catraca com motivo obrigatório.
 */
export default function ControlIdReleaseDialog({ open, loading = false, onClose, onConfirm }) {
  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <ControlIdReleaseForm loading={loading} onClose={onClose} onConfirm={onConfirm} />,
    document.body
  );
}
