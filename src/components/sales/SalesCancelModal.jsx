import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { CANCEL_REASON_OPTIONS, formatCancelMotivo } from '../../lib/salesHistory';
import ModalShell from '../shared/ModalShell.jsx';

export default function SalesCancelModal({ open, sale, loading, onClose, onConfirm }) {
  const [categoria, setCategoria] = useState('desistencia');
  const [outroTexto, setOutroTexto] = useState('');

  useEffect(() => {
    if (open) {
      setCategoria('desistencia');
      setOutroTexto('');
    }
  }, [open]);

  const requestClose = useCallback(() => {
    if (loading) return;
    onClose();
  }, [loading, onClose]);

  if (!sale) return null;

  const motivo = formatCancelMotivo(categoria, outroTexto);
  const canSubmit = categoria !== 'outro' ? Boolean(categoria) : Boolean(outroTexto.trim());

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onConfirm(motivo);
  };

  return (
    <ModalShell
      open={open && Boolean(sale)}
      title="Cancelar venda"
      onClose={requestClose}
      closeOnOverlay={!loading}
      closeOnEsc={!loading}
      maxWidth={420}
      className="sales-modal-backdrop navi-modal-overlay--form"
      dialogClassName="sales-modal card"
      footer={
        <div className="flex gap-2" style={{ justifyContent: 'flex-end', flexWrap: 'wrap', width: '100%' }}>
          <button type="button" className="btn-outline" onClick={onClose} disabled={loading}>
            Voltar
          </button>
          <button type="submit" form="sales-cancel-form" className="btn-danger" disabled={!canSubmit || loading}>
            {loading ? 'Cancelando…' : 'Confirmar cancelamento'}
          </button>
        </div>
      }
    >
      <p className="text-small" style={{ color: 'var(--text-muted)', margin: 0 }}>
        Venda {sale.id_short} — {sale.client_name}
      </p>

      <form id="sales-cancel-form" onSubmit={handleSubmit}>
        <div className="form-group mt-3">
          <label>Motivo do cancelamento *</label>
          <select className="form-input" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {CANCEL_REASON_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {categoria === 'outro' && (
          <div className="form-group mt-2">
            <label>Descreva o motivo *</label>
            <textarea
              className="form-input"
              rows={3}
              maxLength={256}
              value={outroTexto}
              onChange={(e) => setOutroTexto(e.target.value)}
              required
            />
          </div>
        )}

        <div
          className="flex gap-2 mt-3 p-3"
          style={{
            background: 'var(--surface-2)',
            borderRadius: 8,
            fontSize: 13,
            alignItems: 'flex-start',
          }}
        >
          <AlertTriangle size={18} style={{ flexShrink: 0, color: 'var(--warning)' }} />
          <span>
            Esta ação reverterá o estoque e estornará o valor no Caixa.
          </span>
        </div>
      </form>
    </ModalShell>
  );
}
