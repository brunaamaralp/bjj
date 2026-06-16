import React, { useEffect, useRef, useState } from 'react';
import { DateInputField } from '../DateInput';
import FieldError from '../shared/FieldError.jsx';
import { maskCurrency } from '../../lib/masks';
import {
  validatePaymentStatusPopoverForm,
  focusFirstPaymentStatusPopoverError,
  PAYMENT_STATUS_POPOVER_FIELD_IDS,
} from '../../lib/paymentStatus';
import { FINANCE_TERM_HINTS } from '../../lib/financeTermHints.js';

const STATUS_OPTIONS = [
  { value: 'paid', label: 'Pago' },
  { value: 'awaiting', label: 'Aguardando' },
  { value: 'partial', label: 'Parcial' },
  { value: 'pending', label: 'Pendente' },
];

function normalizeGridStatus(initialStatus) {
  return initialStatus === 'soon' || initialStatus === 'none' ? 'pending' : initialStatus;
}

function buildInitialPaidAmount(initialPaidAmount, expectedAmount) {
  const amt = initialPaidAmount > 0 ? initialPaidAmount : expectedAmount;
  return maskCurrency(String(Math.round(amt * 100)));
}

function buildInitialPaidAt(initialPaidAt) {
  return initialPaidAt ? String(initialPaidAt).slice(0, 10) : new Date().toISOString().slice(0, 10);
}

function PaymentStatusPopoverForm({
  anchorRect,
  initialStatus,
  initialPaidAmount,
  expectedAmount,
  initialNote,
  initialPaidAt,
  saving,
  onSave,
  onClose,
}) {
  const popRef = useRef(null);
  const [status, setStatus] = useState(() => normalizeGridStatus(initialStatus));
  const [paidAmount, setPaidAmount] = useState(() => buildInitialPaidAmount(initialPaidAmount, expectedAmount));
  const [paidAt, setPaidAt] = useState(() => buildInitialPaidAt(initialPaidAt));
  const [note, setNote] = useState(() => initialNote || '');
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    const onDoc = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const positionStyle = anchorRect
    ? {
        '--popover-top': `${Math.min(anchorRect.bottom + 6, window.innerHeight - 280)}px`,
        '--popover-left': `${Math.min(anchorRect.left, window.innerWidth - 300)}px`,
      }
    : undefined;

  const handleSubmit = (e) => {
    e.preventDefault();
    const { errors, dbStatus, paidNum } = validatePaymentStatusPopoverForm({
      gridStatus: status,
      paidAmount,
      paidAt,
    });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      focusFirstPaymentStatusPopoverError(errors);
      return;
    }
    setFieldErrors({});
    onSave({
      gridStatus: status,
      dbStatus,
      paid_amount: dbStatus === 'awaiting' ? 0 : paidNum,
      expected_amount: expectedAmount,
      paid_at: dbStatus === 'awaiting' ? null : new Date(`${paidAt}T12:00:00`).toISOString(),
      note: note.trim(),
    });
  };

  const showAmount = status === 'paid' || status === 'partial';

  return (
    <div
      ref={popRef}
      className="card payment-status-popover"
      style={positionStyle}
      role="dialog"
      aria-label="Atualizar pagamento"
    >
      <form onSubmit={handleSubmit} className="payment-status-popover__form">
        <div className="payment-status-popover__title">Status do mês</div>
        <select
          className="form-input payment-status-popover__input--compact"
          value={status}
          onChange={(e) => {
            setFieldErrors({});
            setStatus(e.target.value);
          }}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {status === 'pending' || status === 'awaiting' ? (
          <p className="text-xs text-muted payment-status-popover__hint" role="note">
            {FINANCE_TERM_HINTS.mensalidadePendenteCaixa}
          </p>
        ) : null}

        {showAmount ? (
          <div>
            <label className="text-xs payment-status-popover__field-label" htmlFor={PAYMENT_STATUS_POPOVER_FIELD_IDS.paid_amount}>
              Valor recebido
            </label>
            <input
              id={PAYMENT_STATUS_POPOVER_FIELD_IDS.paid_amount}
              className="form-input payment-status-popover__input--amount"
              value={paidAmount}
              onChange={(e) => {
                setFieldErrors((prev) => (prev.paid_amount ? { ...prev, paid_amount: '' } : prev));
                setPaidAmount(maskCurrency(e.target.value));
              }}
            />
            <FieldError id="payment-popover-amount-error">{fieldErrors.paid_amount}</FieldError>
            {status === 'partial' && expectedAmount > 0 ? (
              <p className="text-xs text-muted payment-status-popover__hint">
                Esperado: {expectedAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            ) : null}
          </div>
        ) : null}

        {status !== 'awaiting' ? (
          <div>
            <label className="text-xs payment-status-popover__field-label" htmlFor={PAYMENT_STATUS_POPOVER_FIELD_IDS.paid_at}>
              Data
            </label>
            <DateInputField
              id={PAYMENT_STATUS_POPOVER_FIELD_IDS.paid_at}
              type="date"
              className="form-input payment-status-popover__input--compact"
              value={paidAt}
              onChange={(e) => {
                setFieldErrors((prev) => (prev.paid_at ? { ...prev, paid_at: '' } : prev));
                setPaidAt(e.target.value);
              }}
            />
            <FieldError id="payment-popover-paid-at-error">{fieldErrors.paid_at}</FieldError>
          </div>
        ) : null}

        <div>
          <label className="text-xs payment-status-popover__field-label">Observação</label>
          <input
            className="form-input payment-status-popover__input--compact"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex.: PIX não identificado"
          />
        </div>

        <div className="flex gap-2 payment-status-popover__actions">
          <button type="button" className="btn-outline btn-sm" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn-secondary btn-sm" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function PaymentStatusPopover(props) {
  const popoverKey = [
    props.initialStatus,
    props.initialPaidAmount,
    props.expectedAmount,
    props.initialNote,
    props.initialPaidAt,
  ].join('|');
  return <PaymentStatusPopoverForm key={popoverKey} {...props} />;
}
