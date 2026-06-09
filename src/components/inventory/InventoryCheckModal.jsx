import React, { useCallback } from 'react';
import ModalShell from '../shared/ModalShell.jsx';

export default function InventoryCheckModal({ open, item, loading, onClose, onConfirm }) {
  const requestClose = useCallback(() => {
    if (loading) return;
    onClose();
  }, [loading, onClose]);

  if (!item) return null;

  const label = item.Tamanho ? `${item.nome} · ${item.Tamanho}` : item.nome;

  return (
    <ModalShell
      open={open && Boolean(item)}
      title="Registrar conferência"
      onClose={requestClose}
      closeOnOverlay={!loading}
      closeOnEsc={!loading}
      maxWidth={400}
      footer={
        <div className="flex gap-2 justify-end" style={{ width: '100%' }}>
          <button type="button" className="btn-outline" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button type="button" className="btn-secondary" onClick={onConfirm} disabled={loading}>
            {loading ? 'Registrando…' : 'Confirmar'}
          </button>
        </div>
      }
    >
      <p className="text-small" style={{ margin: 0 }}>
        Confirmar conferência de estoque para <strong>{label}</strong>?
      </p>
    </ModalShell>
  );
}
