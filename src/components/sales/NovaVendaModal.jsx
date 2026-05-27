import React, { useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useModalA11y } from '../../hooks/useModalA11y.js';
import SalesNewSaleTab from './SalesNewSaleTab.jsx';

export default function NovaVendaModal({ open, onClose }) {
  const requestClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useModalA11y({ isOpen: open, onClose: requestClose });

  const handleSaleComplete = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="nova-venda-modal-backdrop"
      role="presentation"
      onClick={requestClose}
    >
      <div
        className="sales-modal card nova-venda-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nova-venda-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="nova-venda-modal__head">
          <h2 id="nova-venda-modal-title" className="nova-venda-modal__title">
            Nova venda
          </h2>
          <button
            type="button"
            className="nova-venda-modal__close"
            onClick={requestClose}
            aria-label="Fechar"
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </header>

        <div className="nova-venda-modal__body">
          <SalesNewSaleTab modalMode onSaleComplete={handleSaleComplete} />
        </div>
      </div>
    </div>,
    document.body
  );
}
