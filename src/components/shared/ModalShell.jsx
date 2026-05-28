import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Estrutura base para modais do app.
 */
export default function ModalShell({
  open,
  title,
  onClose,
  children,
  footer,
  className = '',
  dialogClassName = '',
  maxWidth = 420,
  closeOnOverlay = true,
  closeOnEsc = true,
  showCloseButton = true,
  ariaLabelledBy,
}) {
  useEffect(() => {
    if (!open || !closeOnEsc) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, closeOnEsc, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const labelledBy = ariaLabelledBy || 'navi-modal-shell-title';

  return createPortal(
    <div
      className={['navi-modal-overlay', className].filter(Boolean).join(' ')}
      role="presentation"
      onClick={closeOnOverlay ? onClose : undefined}
    >
      <div
        className={['card', 'navi-modal-shell', dialogClassName].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? labelledBy : undefined}
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || showCloseButton) && (
          <div className="navi-modal-shell__header">
            {title ? (
              <h3 id={labelledBy} className="navi-section-heading navi-modal-shell__title">
                {title}
              </h3>
            ) : (
              <span />
            )}
            {showCloseButton ? (
              <button type="button" className="btn-outline navi-btn--toolbar" onClick={onClose} aria-label="Fechar">
                <X size={16} />
              </button>
            ) : null}
          </div>
        )}
        <div className="navi-modal-shell__body">{children}</div>
        {footer ? <div className="navi-modal-shell__footer">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}
