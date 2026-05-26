import React from 'react';
import { X, XCircle } from 'lucide-react';
import { formatBRL } from '../../lib/moneyBr';
import { formatDateTimeBr, saleStatusLabel } from '../../lib/salesHistory';
import { useModalA11y } from '../../hooks/useModalA11y.js';

export default function SaleDetailModal({ open, sale, loading, onClose, onCancelClick }) {
  useModalA11y({ isOpen: open && Boolean(sale), onClose });

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
          <div className="sale-detail-skeleton" role="status" aria-live="polite" aria-label="Carregando detalhes da venda">
            <div className="sale-detail-skeleton-bar sale-detail-skeleton-bar--client" aria-hidden />
            <div className="sale-detail-skeleton-bar sale-detail-skeleton-bar--meta" aria-hidden />
            <div className="sale-detail-skeleton-bar sale-detail-skeleton-bar--meta" aria-hidden />
            <div className="sale-detail-skeleton-items mt-3" aria-hidden>
              <div className="sale-detail-skeleton-bar sale-detail-skeleton-bar--item" />
              <div className="sale-detail-skeleton-bar sale-detail-skeleton-bar--item" />
              <div className="sale-detail-skeleton-bar sale-detail-skeleton-bar--item" />
            </div>
            <div className="sale-detail-skeleton-bar sale-detail-skeleton-bar--badge mt-3" aria-hidden />
          </div>
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
      <style>{`
        @keyframes saleDetailSk {
          from { background-position: 200% 0; }
          to { background-position: -200% 0; }
        }
        .sale-detail-skeleton-bar {
          border-radius: 10px;
          background: linear-gradient(90deg, rgba(148,163,184,0.12) 25%, rgba(148,163,184,0.24) 50%, rgba(148,163,184,0.12) 75%);
          background-size: 200% 100%;
          animation: saleDetailSk 1.2s ease-in-out infinite;
        }
        .sale-detail-skeleton-bar--client { width: 200px; max-width: 100%; height: 18px; }
        .sale-detail-skeleton-bar--meta { width: 120px; max-width: 100%; height: 14px; margin-top: 12px; }
        .sale-detail-skeleton-items { display: flex; flex-direction: column; gap: 10px; }
        .sale-detail-skeleton-bar--item { width: 100%; height: 14px; }
        .sale-detail-skeleton-bar--badge { width: 80px; height: 22px; border-radius: 999px; }
        @media (prefers-reduced-motion: reduce) {
          .sale-detail-skeleton-bar { animation: none; background: rgba(148,163,184,0.18); }
        }
      `}</style>
    </div>
  );
}


