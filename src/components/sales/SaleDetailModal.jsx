import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { XCircle, ExternalLink } from 'lucide-react';
import { formatBRL } from '../../lib/moneyBr';
import { formatDateTimeBr, SALE_STATUS_BADGE_MAP, saleAllowsCancelOrEdit } from '../../lib/salesHistory';
import StatusBadge from '../shared/StatusBadge.jsx';
import ModalShell from '../shared/ModalShell.jsx';
import { useSalesStore } from '../../store/useSalesStore';
import { useUiStore } from '../../store/useUiStore';
import { useLeadStore } from '../../store/useLeadStore';
import SalesPaymentBlock from './SalesPaymentBlock';
import {
  createEmptyPaymentRow,
  serializePagamentosForApi,
  paymentsUiValid,
  salePaidAmountNet,
} from '../../lib/salePayments';
import { downloadSaleReceiptPdf } from '../../lib/receiptDownload.js';
import ReceiptPdfButton from '../shared/ReceiptPdfButton.jsx';

function SaleDetailModalContent({
  sale,
  loading,
  onClose,
  onCancelClick,
  canCancelSale = false,
  canEditSale = false,
  onEditItemClick,
  onLiquidated,
}) {
  const liquidateSale = useSalesStore((s) => s.liquidateSale);
  const creating = useSalesStore((s) => s.creating);
  const addToast = useUiStore((s) => s.addToast);
  const financeConfig = useLeadStore((s) => s.financeConfig);

  const [liquidateOpen, setLiquidateOpen] = useState(false);
  const [payments, setPayments] = useState(() => [createEmptyPaymentRow(0)]);
  const [liquidateError, setLiquidateError] = useState('');

  const totalCents = useMemo(
    () => Math.max(0, Math.round((Number(sale?.total) || 0) * 100)),
    [sale]
  );

  const paidCents = useMemo(
    () => Math.max(0, Math.round(salePaidAmountNet(sale?.pagamentos || sale?.pagamentos_json) * 100)),
    [sale]
  );

  const remainingCents = useMemo(
    () => Math.max(0, totalCents - paidCents),
    [totalCents, paidCents]
  );

  const openLiquidatePanel = useCallback(() => {
    setLiquidateError('');
    setPayments([createEmptyPaymentRow(remainingCents)]);
    setLiquidateOpen(true);
  }, [remainingCents]);

  const statusLower = String(sale.status).toLowerCase();
  const isConcluida = statusLower === 'concluida';
  const isCancelada = statusLower === 'cancelada';
  const isPendente = statusLower === 'pendente';
  const isParcial = statusLower === 'parcial';
  const canReceivePayment = isPendente || isParcial;
  const canModifySale = saleAllowsCancelOrEdit(sale.status);

  const paymentValid = paymentsUiValid(payments, remainingCents, { allowPartial: true });

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
      if (paymentValid.reason === 'sum' && paymentValid.net > remainingCents) {
        setLiquidateError('O valor informado excede o saldo em aberto da venda.');
      } else {
        setLiquidateError('Informe um valor de pagamento válido (até o saldo em aberto).');
      }
      return;
    }
    const pagamentos = serializePagamentosForApi(payments);
    const result = await liquidateSale({ venda_id: sale.id, pagamentos });
    if (!result?.ok) {
      addToast({ type: 'error', message: 'Não foi possível registrar o pagamento.' });
      return;
    }
    addToast({
      type: 'success',
      message: result?.partial ? 'Pagamento parcial registrado.' : 'Pagamento registrado.',
    });
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
              {canReceivePayment && paidCents > 0 ? (
                <>
                  <div><strong>Recebido:</strong> {formatBRL(paidCents / 100)}</div>
                  <div><strong>Saldo em aberto:</strong> {formatBRL(remainingCents / 100)}</div>
                </>
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
                  {canModifySale && canEditSale ? <th aria-label="Ações" /> : null}
                </tr>
              </thead>
              <tbody>
                {(sale.items || []).map((it, i) => (
                  <tr key={it.id || i}>
                    <td>{it.display_label}</td>
                    <td>{it.quantidade}</td>
                    <td>{formatBRL(it.preco_unitario)}</td>
                    <td>{formatBRL(it.subtotal)}</td>
                    {canModifySale && canEditSale ? (
                      <td>
                        <button
                          type="button"
                          className="btn-outline btn-sm"
                          onClick={() => onEditItemClick?.(it)}
                        >
                          Trocar
                        </button>
                      </td>
                    ) : null}
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

            {canReceivePayment && !liquidateOpen ? (
              <button
                type="button"
                className="btn-primary mt-4 sales-modal__full-width"
                onClick={openLiquidatePanel}
              >
                {isParcial ? 'Registrar pagamento parcial' : 'Registrar pagamento'}
              </button>
            ) : null}

            {canReceivePayment && liquidateOpen ? (
              <div className="sales-liquidate-panel mt-4">
                <h4 className="navi-section-heading sales-modal__section-title">
                  {isParcial ? 'Registrar pagamento parcial' : 'Registrar pagamento'}
                </h4>
                {paidCents > 0 ? (
                  <p className="text-small text-muted sales-liquidate-panel__balance">
                    Saldo em aberto: <strong>{formatBRL(remainingCents / 100)}</strong>
                    {' · '}
                    Total da venda: {formatBRL(sale.total)}
                  </p>
                ) : null}
                {liquidateError ? (
                  <p className="sales-liquidate-panel__error" role="alert">
                    {liquidateError}
                  </p>
                ) : null}
                <SalesPaymentBlock
                  totalCents={remainingCents}
                  payments={payments}
                  onChange={setPayments}
                  disabled={creating}
                  financeConfig={financeConfig}
                  allowPartial
                  saleTotalCents={totalCents}
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

            {canModifySale && canCancelSale ? (
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
  canEditSale = false,
  onEditItemClick,
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
      canEditSale={canEditSale}
      onEditItemClick={onEditItemClick}
      onLiquidated={onLiquidated}
    />
  );
}
