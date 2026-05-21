import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

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

  if (!open || !item || typeof document === 'undefined') return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      minimum_level: Number(form.minimum_level) || 0,
      unit: form.unit,
      notes: form.notes,
    });
  };

  return createPortal(
    <div className="navi-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="card navi-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-config-title"
        style={{ maxWidth: 400, padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center gap-2" style={{ marginBottom: 12 }}>
          <h3 id="inventory-config-title" className="navi-section-heading" style={{ margin: 0 }}>
            Ajustar mínimo e unidade
          </h3>
          <button type="button" className="btn-outline btn-sm" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <p className="text-small text-muted" style={{ margin: '0 0 12px' }}>{item.nome}</p>
        <form onSubmit={handleSubmit}>
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
          <div className="flex gap-2 justify-end mt-3">
            <button type="button" className="btn-outline" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="btn-secondary" disabled={loading}>
              {loading ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
