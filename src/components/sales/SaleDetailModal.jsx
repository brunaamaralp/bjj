import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { XCircle, ExternalLink } from 'lucide-react';
import { formatBRL } from '../../lib/moneyBr';
import { formatDateTimeBr, SALE_STATUS_BADGE_MAP } from '../../lib/salesHistory';
import StatusBadge from '../shared/StatusBadge.jsx';
import ModalShell from '../shared/ModalShell.jsx';
import { useSalesStore } from '../../store/useSalesStore';
import { useUiStore } from '../../store/useUiStore';
import SalesPaymentBlock from './SalesPaymentBlock';
import {
  createEmptyPaymentRow,
  serializePagamentosForApi,
  paymentsUiValid,
} from '../../lib/salePayments';
import { downloadSaleReceiptPdf } from '../../lib/receiptDownload.js';
import ReceiptPdfButton from '../shared/ReceiptPdfButton.jsx';

function SaleDetailModalContent({
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
    [sale]
  );

  const openLiquidatePanel = useCallback(() => {
    setLiquidateError('');
    setPayments([createEmptyPaymentRow(totalCents)]);
    setLiquidateOpen(true);
  }, [totalCents]);

  const statusLower = String(sale.status).toLowerCase();
  const isConcluida = statusLower === 'concluida';
  const isCancelada = statusLower === 'cancelada';
  const isPendente = statusLower === 'pendente';

  const paymentValid = paymentsUiValid(payments, totalCents);

  const studentId = String(sale.student_id || sale.aluno_id || '').trim();
  const leadId = String(sale.lead_id || '').trim();
  const clientProfileHref = studentId
    ? `/student/${studentId}`
    : leadId
      ? `/lead/${leadId}`
      : null;

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
    <ModalShell
      open
      title={`Venda ${sale.id_short}`}
      onClose={onClose}
      maxWidth={560}
      className="sales-modal-backdrop navi-modal-overlay--form"
      dialogClassName="sales-modal card sales-modal--wide"
    >
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
              <div>
                <strong>Cliente:</strong>{' '}
                {clientProfileHref ? (
                  <Link to={clientProfileHref} className="sales-profile-link">
                    {sale.client_name}
                    <ExternalLink size={12} aria-hidden />
                  </Link>
                ) : (
                  sale.client_name
                )}
              </div>
              <div><strong>Canal:</strong> {sale.canal_label}</div>
              <div><strong>Pagamento:</strong> {sale.payment_label}</div>
              <div>
                <strong>Status:</strong>{' '}
                <StatusBadge status={sale.status} map={SALE_STATUS_BADGE_MAP} size="sm" />
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

            <h4 className="navi-section-heading sales-modal__section-title mt-4">Itens</h4>
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
                className="btn-primary mt-4 sales-modal__full-width"
                onClick={openLiquidatePanel}
              >
                Registrar pagamento
              </button>
            ) : null}

            {isPendente && liquidateOpen ? (
              <div className="sales-liquidate-panel mt-4">
                <h4 className="navi-section-heading sales-modal__section-title">
                  Registrar pagamento
                </h4>
                {liquidateError ? (
                  <p className="sales-liquidate-panel__error" role="alert">
                    {liquidateError}
                  </p>
                ) : null}
                <SalesPaymentBlock
                  totalCents={totalCents}
                  payments={payments}
                  onChange={setPayments}
                  disabled={creating}
                />
                <div className="sales-liquidate-panel__actions">
                  <button
                    type="button"
                    className="btn-outline sales-liquidate-panel__btn"
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
                    className="btn-primary sales-liquidate-panel__btn"
                    disabled={creating}
                    onClick={() => void handleLiquidate()}
                  >
                    {creating ? 'Registrando…' : 'Confirmar'}
                  </button>
                </div>
              </div>
            ) : null}

            {isConcluida && canCancelSale ? (
              <button type="button" className="btn-outline mt-4 sales-cancel-sale-btn" onClick={onCancelClick}>
                <XCircle size={16} aria-hidden />
                Cancelar venda
              </button>
            ) : null}
          </>
        )}
    </ModalShell>
  );
}

export default function SaleDetailModal({
  open,
  sale,
  loading,
  onClose,
  onCancelClick,
  canCancelSale = false,
  onLiquidated,
}) {
  if (!open || !sale) return null;
  return (
    <SaleDetailModalContent
      key={sale.id}
      sale={sale}
      loading={loading}
      onClose={onClose}
      onCancelClick={onCancelClick}
      canCancelSale={canCancelSale}
      onLiquidated={onLiquidated}
    />
  );
}
