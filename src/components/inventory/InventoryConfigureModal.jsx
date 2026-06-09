import React, { useCallback, useEffect, useState } from 'react';
import ModalShell from '../shared/ModalShell.jsx';

export default function InventoryConfigureModal({ open, item, loading, onClose, onSave }) {
  const [form, setForm] = useState({ minimum_level: 0, unit: 'unidade', notes: '' });

  useEffect(() => {
    if (!item) return;
    setForm({
      minimum_level: item.minimum_level || 0,
      unit: item.unit || 'unidade',
      notes: item.notes || '',
    });
  }, [item]);

  const requestClose = useCallback(() => {
    if (loading) return;
    onClose();
  }, [loading, onClose]);

  if (!item) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      minimum_level: Number(form.minimum_level) || 0,
      unit: form.unit,
      notes: form.notes,
    });
  };

  return (
    <ModalShell
      open={open && Boolean(item)}
      title="Ajustar mínimo e unidade"
      onClose={requestClose}
      closeOnOverlay={!loading}
      closeOnEsc={!loading}
      overlayCloseSuppressMs={400}
      maxWidth={400}
      className="navi-modal-overlay--form"
      footer={
        <div className="flex gap-2 justify-end" style={{ width: '100%' }}>
          <button type="button" className="btn-outline" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button type="submit" form="inventory-configure-form" className="btn-secondary" disabled={loading}>
            {loading ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      }
    >
      <p className="text-small text-muted" style={{ margin: 0 }}>{item.nome}</p>
      <form id="inventory-configure-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Mín. ideal (0 = sem alerta)</label>
          <input
            type="number"
            min={0}
            className="form-input"
            value={form.minimum_level}
            onChange={(e) => setForm((f) => ({ ...f, minimum_level: e.target.value }))}
          />
        </div>
        <div className="form-group mt-2">
          <label>Unidade</label>
          <input
            className="form-input"
            value={form.unit}
            onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
            placeholder="unidade, pacote, kg…"
          />
        </div>
        <div className="form-group mt-2">
          <label>Observações</label>
          <textarea
            className="form-input"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>
      </form>
    </ModalShell>
  );
}
