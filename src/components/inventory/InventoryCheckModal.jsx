import React, { useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useModalA11y } from '../../hooks/useModalA11y.js';

export default function InventoryCheckModal({ open, item, loading, onClose, onConfirm }) {
  const requestClose = useCallback(() => {
    if (loading) return;
    onClose();
  }, [loading, onClose]);

  useModalA11y({ isOpen: open && Boolean(item), onClose: requestClose });

  if (!open || !item || typeof document === 'undefined') return null;

  const label = item.Tamanho ? `${item.nome} · ${item.Tamanho}` : item.nome;

  return createPortal(
    <div className="navi-modal-overlay" role="presentation" onClick={requestClose}>
      <div
        className="card navi-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-check-title"
        style={{ maxWidth: 400, padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center gap-2" style={{ marginBottom: 12 }}>
          <h3 id="inventory-check-title" className="navi-section-heading" style={{ margin: 0 }}>
            Registrar conferência
          </h3>
          <button type="button" className="btn-outline btn-sm" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <p className="text-small" style={{ margin: '0 0 16px' }}>
          Confirmar conferência de estoque para <strong>{label}</strong>?
        </p>
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-outline" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button type="button" className="btn-secondary" onClick={onConfirm} disabled={loading}>
            {loading ? 'Registrando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
