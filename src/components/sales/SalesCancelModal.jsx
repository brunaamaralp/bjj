import React, { useCallback, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  CANCEL_REASON_OPTIONS,
  estimateCancelRefund,
  formatCancelMotivo,
  saleIsPartiallyPaid,
} from '../../lib/salesHistory';
import { formatBRL } from '../../lib/moneyBr';
import ModalShell from '../shared/ModalShell.jsx';

function CancelPreview({ sale }) {
  const items = sale?.items || [];
  const refund = estimateCancelRefund(sale);
  const partial = saleIsPartiallyPaid(sale);

  if (!items.length && refund <= 0 && !partial) return null;

  return (
    <div className="sales-cancel-preview mt-3">
      {items.length ? (
        <div className="sales-cancel-preview__items">
          <p className="text-small" style={{ margin: '0 0 6px', fontWeight: 600 }}>
            Itens da venda
          </p>
          <ul className="sales-cancel-preview__list text-small" style={{ margin: 0, paddingLeft: 18 }}>
            {items.map((it) => (
              <li key={it.id || `${it.display_label}-${it.quantidade}`}>
                {Number(it.quantidade) > 1 ? `${it.quantidade}x ` : ''}
                {it.display_label || 'Item'}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {refund > 0.009 ? (
        <p className="text-small mt-2" style={{ marginBottom: 0 }}>
          <strong>Estorno estimado:</strong> {formatBRL(refund)}
        </p>
      ) : (
        <p className="text-small text-muted mt-2" style={{ marginBottom: 0 }}>
          Nenhum valor recebido — não haverá estorno financeiro.
        </p>
      )}

      {partial ? (
        <p
          className="text-small mt-2"
          style={{ color: 'var(--warning)', display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 0 }}
        >
          <AlertTriangle size={16} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
          Venda com pagamento parcial: apenas o valor já recebido será estornado.
        </p>
      ) : null}
    </div>
  );
}

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

      <CancelPreview sale={sale} />

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
