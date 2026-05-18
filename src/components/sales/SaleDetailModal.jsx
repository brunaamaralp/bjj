import React from 'react';
import { X, XCircle } from 'lucide-react';
import { formatBRL } from '../../lib/moneyBr';
import { formatDateTimeBr, saleStatusLabel } from '../../lib/salesHistory';

export default function SaleDetailModal({ open, sale, loading, onClose, onCancelClick }) {
  if (!open || !sale) return null;

  const isConcluida = String(sale.status).toLowerCase() === 'concluida';
  const isCancelada = String(sale.status).toLowerCase() === 'cancelada';

  return (
    <div className="sales-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="sales-modal card sales-modal--wide" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="navi-section-heading" style={{ margin: 0 }}>
            Venda {sale.id_short}
          </h3>
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <p className="text-small text-muted">Carregando…</p>
        ) : (
          <>
            <div className="sales-detail-grid text-small">
              <div><strong>Data:</strong> {formatDateTimeBr(sale.created_at)}</div>
              <div><strong>Cliente:</strong> {sale.client_name}</div>
              <div><strong>Canal:</strong> {sale.canal_label}</div>
              <div><strong>Pagamento:</strong> {sale.payment_label}</div>
              <div>
                <strong>Status:</strong>{' '}
                <span className={isCancelada ? 'sales-badge sales-badge--danger' : 'sales-badge sales-badge--ok'}>
                  {saleStatusLabel(sale.status)}
                </span>
              </div>
              {isCancelada && (
                <>
                  <div><strong>Cancelada em:</strong> {formatDateTimeBr(sale.cancelada_em)}</div>
                  <div className="sales-detail-span-2"><strong>Motivo:</strong> {sale.cancel_motivo || '—'}</div>
                </>
              )}
            </div>

            <h4 className="navi-section-heading mt-4" style={{ fontSize: 14 }}>Itens</h4>
            <table className="sales-table mt-2">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Qtd</th>
                  <th>Unit.</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {(sale.items || []).map((it, i) => (
                  <tr key={i}>
                    <td>{it.display_label}</td>
                    <td>{it.quantidade}</td>
                    <td>{formatBRL(it.preco_unitario)}</td>
                    <td>{formatBRL(it.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-3 text-small">
              <strong>Total:</strong> {formatBRL(sale.total)}
            </div>

            {isConcluida && (
              <button type="button" className="btn-outline mt-4" onClick={onCancelClick}>
                <XCircle size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
                Cancelar venda
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}


