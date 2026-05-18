import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import AsyncButton from './AsyncButton.jsx';

/**
 * Diálogo de confirmação (Fase 2 — design system Nave).
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  confirmVariant = 'danger',
  loading = false,
  onConfirm,
  onClose,
}) {
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
    <div
      className="navi-confirm-overlay"
      role="presentation"
      onClick={() => {
        if (!loading) onClose?.();
      }}
    >
      <div
        className="navi-confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="navi-confirm-title"
        aria-describedby={description ? 'navi-confirm-desc' : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="navi-confirm-icon-wrap" aria-hidden>
          <AlertTriangle size={26} strokeWidth={2} style={{ color: 'var(--danger)' }} />
        </div>
        <h2 id="navi-confirm-title" className="navi-confirm-title">
          {title}
        </h2>
        {description ? (
          <p id="navi-confirm-desc" className="navi-confirm-desc text-small text-muted">
            {description}
          </p>
        ) : null}
        <div className="navi-confirm-actions">
          <button type="button" className="btn-outline" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </button>
          <AsyncButton
            variant={confirmVariant}
            loading={loading}
            onClick={onConfirm}
            disabled={loading}
          >
            {confirmLabel}
          </AsyncButton>
        </div>
      </div>
    </div>,
    document.body
  );
}
