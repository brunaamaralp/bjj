import React, { useCallback, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { CANCEL_REASON_OPTIONS, formatCancelMotivo } from '../../lib/salesHistory';
import ModalShell from '../shared/ModalShell.jsx';

function SalesCancelModalForm({ sale, loading, onClose, onConfirm }) {
  const [categoria, setCategoria] = useState('desistencia');
  const [outroTexto, setOutroTexto] = useState('');

  const requestClose = useCallback(() => {
    if (loading) return;
    onClose();
  }, [loading, onClose]);

  const motivo = formatCancelMotivo(categoria, outroTexto);
  const canSubmit = categoria !== 'outro' ? Boolean(categoria) : Boolean(outroTexto.trim());

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onConfirm(motivo);
  };

  return (
    <ModalShell
      open
      title="Cancelar venda"
      onClose={requestClose}
      closeOnOverlay={!loading}
      closeOnEsc={!loading}
      maxWidth={420}
      className="sales-modal-backdrop navi-modal-overlay--form navi-modal-overlay--stacked"
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

        <p className="text-small mt-3" style={{ color: 'var(--warning)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <AlertTriangle size={16} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
          Esta ação não pode ser desfeita. O estoque e o financeiro serão ajustados conforme a política da venda.
        </p>
      </form>
    </ModalShell>
  );
}

export default function SalesCancelModal({ open, sale, loading, onClose, onConfirm }) {
  if (!open || !sale) return null;
  return (
    <SalesCancelModalForm
      key={sale.id}
      sale={sale}
      loading={loading}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
