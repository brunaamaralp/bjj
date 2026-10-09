import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';
import { formatBRL } from '../../lib/moneyBr.js';
import {
  CLOSING_STATUS_PAID,
  financeExpenseAmountFromNet,
} from '../../../lib/professorClosing.js';
import {
  markProfessorClosingPaid,
  reopenProfessorClosing,
} from '../../lib/professorClosingApi.js';

function roleLabel(role) {
  if (role === 'instructor') return 'Instrutor';
  return 'Professor';
}

const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'transferencia', label: 'Transferência' },
];

/**
 * Ficha de fechamento de um professor/instrutor no mês.
 */
export default function ProfessorClosingSheet({
  row,
  month,
  academyId,
  canManage = false,
  canWithdraw = false,
  onClose,
  onChanged,
  onWithdraw,
  toast,
}) {
  const [payOpen, setPayOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('pix');

  if (!row) return null;

  const paid = String(row.status || '').toLowerCase() === CLOSING_STATUS_PAID;
  const net = Number(row.amounts?.net) || 0;
  const expenseAmount = financeExpenseAmountFromNet(net);
  const credits =
    (Number(row.amounts?.credits_lessons) || 0) +
    (Number(row.amounts?.credits_experimental) || 0);

  const payDescription =
    net < 0
      ? `Débitos excedem créditos (${formatBRL(net)}). O fechamento será marcado como pago com despesa de ${formatBRL(0)}.`
      : `Será criada uma despesa liquidada de ${formatBRL(expenseAmount)} para ${row.name || 'o colaborador'} (${month}).`;

  const handleMarkPaid = async () => {
    setBusy(true);
    try {
      await markProfessorClosingPaid({
        month,
        staff_ref: row.staff_ref,
        payment_method: paymentMethod,
        academyId,
      });
      toast?.success('Fechamento marcado como pago.');
      setPayOpen(false);
      await onChanged?.();
    } catch (e) {
      toast?.error(e, 'save');
    } finally {
      setBusy(false);
    }
  };

  const handleReopen = async () => {
    setBusy(true);
    try {
      await reopenProfessorClosing({
        month,
        staff_ref: row.staff_ref,
        closing_id: row.closing_id || undefined,
        academyId,
      });
      toast?.success('Fechamento reaberto.');
      setReopenOpen(false);
      await onChanged?.();
    } catch (e) {
      toast?.error(e, 'save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="professores-sheet page-header-card" aria-label="Ficha de fechamento">
      <div className="professores-sheet__head">
        <div>
          <h2 className="professores-sheet__title">{row.name || row.staff_ref}</h2>
          <p className="professores-sheet__meta text-small text-muted">
            {roleLabel(row.role)} · {month} ·{' '}
            <span
              className={`professores-status professores-status--${paid ? 'pago' : 'aberto'}`}
            >
              {paid ? 'Pago' : 'Aberto'}
            </span>
          </p>
        </div>
        <button type="button" className="btn-outline" onClick={onClose}>
          Voltar à lista
        </button>
      </div>

      {row.post_paid_activity ? (
        <StatusBanner
          variant="warning"
          message="Há atividade neste mês depois do pagamento. Os totais pagos ficam no snapshot; o ajuste automático fica para uma versão futura."
        />
      ) : null}

      <div className="professores-breakdown">
        <div className="professores-breakdown__item">
          <span className="professores-breakdown__label">Aulas</span>
          <div className="professores-breakdown__value">{row.counts?.lessons ?? 0}</div>
          <p className="text-small text-muted">{formatBRL(row.amounts?.credits_lessons)}</p>
        </div>
        <div className="professores-breakdown__item">
          <span className="professores-breakdown__label">Experimentais</span>
          <div className="professores-breakdown__value">{row.counts?.experimentals ?? 0}</div>
          <p className="text-small text-muted">{formatBRL(row.amounts?.credits_experimental)}</p>
        </div>
        <div className="professores-breakdown__item">
          <span className="professores-breakdown__label">Retiradas</span>
          <div className="professores-breakdown__value">{row.counts?.withdrawals ?? 0}</div>
          <p className="text-small text-muted">{formatBRL(row.amounts?.debits_products)}</p>
        </div>
        <div className="professores-breakdown__item">
          <span className="professores-breakdown__label">Créditos</span>
          <div className="professores-breakdown__value">{formatBRL(credits)}</div>
        </div>
        <div className="professores-breakdown__item">
          <span className="professores-breakdown__label">Débitos</span>
          <div className="professores-breakdown__value">
            {formatBRL(row.amounts?.debits_products)}
          </div>
        </div>
        <div className="professores-breakdown__item">
          <span className="professores-breakdown__label">Líquido</span>
          <div className="professores-breakdown__value">{formatBRL(net)}</div>
        </div>
      </div>

      {paid && row.finance_tx_id ? (
        <p className="text-small">
          <Link
            to={`/financeiro?tab=movimentacoes&tx=${encodeURIComponent(row.finance_tx_id)}`}
            className="edit-link"
          >
            Ver lançamento no Financeiro →
          </Link>
        </p>
      ) : null}

      {canManage && !paid ? (
        <div className="form-group" style={{ maxWidth: 240 }}>
          <label htmlFor="prof-closing-pay-method">Forma de pagamento</label>
          <select
            id="prof-closing-pay-method"
            className="form-input"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            disabled={busy}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="professores-sheet__actions">
        {canWithdraw && !paid ? (
          <button type="button" className="btn-outline" onClick={() => onWithdraw?.(row)}>
            Retirada de produto
          </button>
        ) : null}
        {canManage && !paid ? (
          <button
            type="button"
            className="btn-action-primary"
            onClick={() => setPayOpen(true)}
          >
            Marcar como pago
          </button>
        ) : null}
        {canManage && paid ? (
          <button type="button" className="btn-outline" onClick={() => setReopenOpen(true)}>
            Reabrir fechamento
          </button>
        ) : null}
      </div>

      <ConfirmDialog
        open={payOpen}
        title="Marcar fechamento como pago?"
        description={payDescription}
        confirmLabel="Marcar pago"
        confirmVariant="primary"
        loading={busy}
        onConfirm={() => void handleMarkPaid()}
        onClose={() => {
          if (!busy) setPayOpen(false);
        }}
      />

      <ConfirmDialog
        open={reopenOpen}
        title="Reabrir fechamento?"
        description="O lançamento financeiro vinculado será estornado ou cancelado e a ficha voltará a aberto."
        confirmLabel="Reabrir"
        loading={busy}
        onConfirm={() => void handleReopen()}
        onClose={() => {
          if (!busy) setReopenOpen(false);
        }}
      />
    </section>
  );
}
