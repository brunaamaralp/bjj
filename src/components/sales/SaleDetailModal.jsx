import React, { useEffect, useMemo, useState } from 'react';
import { X, XCircle } from 'lucide-react';
import { formatBRL } from '../../lib/moneyBr';
import { formatDateTimeBr, saleStatusLabel, saleStatusBadgeClass } from '../../lib/salesHistory';
import { useModalA11y } from '../../hooks/useModalA11y.js';
import { useSalesStore } from '../../store/useSalesStore';
import { useUiStore } from '../../store/useUiStore';
import SalesPaymentBlock from './SalesPaymentBlock';
import {
  createEmptyPaymentRow,
  serializePagamentosForApi,
  paymentsUiValid,
  rebalancePaymentsForTotal,
} from '../../lib/salePayments';
import { downloadSaleReceiptPdf } from '../../lib/receiptDownload.js';
import ReceiptPdfButton from '../shared/ReceiptPdfButton.jsx';

export default function SaleDetailModal({
  open,
  sale,
  loading,
  onClose,
  onCancelClick,
  canCancelSale = false,
  onLiquidated,
}) {
  const liquidateSale = useSalesStore((s) => s.liquidateSale);
  const creating = useSalesStore((s) => s.creating);
  const addToast = useUiStore((s) => s.addToast);

  const [liquidateOpen, setLiquidateOpen] = useState(false);
  const [payments, setPayments] = useState(() => [createEmptyPaymentRow(0)]);
  const [liquidateError, setLiquidateError] = useState('');

  const totalCents = useMemo(
    () => Math.max(0, Math.round((Number(sale?.total) || 0) * 100)),
    [sale?.total]
  );

  useModalA11y({ isOpen: open && Boolean(sale), onClose });

  useEffect(() => {
    if (!open || !sale) {
      setLiquidateOpen(false);
      setLiquidateError('');
      return;
    }
    setPayments([createEmptyPaymentRow(totalCents)]);
  }, [open, sale?.id, totalCents]);

  useEffect(() => {
    if (!liquidateOpen) return;
    setPayments((prev) => {
      if (prev.length === 1) {
        return [{ ...prev[0], valorCents: totalCents, recebidoCents: totalCents }];
      }
      return rebalancePaymentsForTotal(prev, totalCents);
    });
  }, [liquidateOpen, totalCents]);

  if (!open || !sale) return null;

  const statusLower = String(sale.status).toLowerCase();
  const isConcluida = statusLower === 'concluida';
  const isCancelada = statusLower === 'cancelada';
  const isPendente = statusLower === 'pendente';

  const paymentValid = paymentsUiValid(payments, totalCents);

  const handleLiquidate = async () => {
    setLiquidateError('');
    if (!paymentValid.ok) {
      setLiquidateError('Ajuste os valores de pagamento para fechar o total da venda.');
      return;
    }
    const pagamentos = serializePagamentosForApi(payments);
    const result = await liquidateSale({ venda_id: sale.id, pagamentos });
    if (!result?.ok) {
      addToast({ type: 'error', message: 'Não foi possível registrar o pagamento.' });
      return;
    }
    addToast({ type: 'success', message: 'Pagamento registrado.' });
    setLiquidateOpen(false);
    onLiquidated?.(result);
    onClose();
  };

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
                <span className={saleStatusBadgeClass(sale.status)}>
                  {saleStatusLabel(sale.status)}
                </span>
              </div>
              {isPendente && sale.due_date ? (
                <div><strong>Vencimento:</strong> {String(sale.due_date).slice(0, 10).split('-').reverse().join('/')}</div>
              ) : null}
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

            {isConcluida ? (
              <div className="mt-3">
                <ReceiptPdfButton
                  onDownload={() => downloadSaleReceiptPdf(sale.id)}
                  variant="outline"
                />
              </div>
            ) : null}

            {isPendente && !liquidateOpen ? (
              <button
                type="button"
                className="btn-primary mt-4"
                style={{ width: '100%' }}
                onClick={() => setLiquidateOpen(true)}
              >
                Registrar pagamento
              </button>
            ) : null}

            {isPendente && liquidateOpen ? (
              <div className="mt-4" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h4 className="navi-section-heading" style={{ fontSize: 14, margin: 0 }}>
                  Registrar pagamento
                </h4>
                {liquidateError ? (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }} role="alert">
                    {liquidateError}
                  </p>
                ) : null}
                <SalesPaymentBlock
                  totalCents={totalCents}
                  payments={payments}
                  onChange={setPayments}
                  disabled={creating}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn-outline"
                    style={{ flex: 1 }}
                    disabled={creating}
                    onClick={() => {
                      setLiquidateOpen(false);
                      setLiquidateError('');
                    }}
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ flex: 1 }}
                    disabled={creating}
                    onClick={() => void handleLiquidate()}
                  >
                    {creating ? 'Registrando…' : 'Confirmar'}
                  </button>
                </div>
              </div>
            ) : null}

            {isConcluida && canCancelSale ? (
              <button type="button" className="btn-outline mt-4" onClick={onCancelClick}>
                <XCircle size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
                Cancelar venda
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
