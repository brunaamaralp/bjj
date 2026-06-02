import React, { useEffect, useRef, useState } from 'react';
import { DateInputField } from '../DateInput';
import { maskCurrency, parseCurrencyBRL } from '../../lib/masks';
import { mapDbStatusFromGridForm } from '../../lib/paymentStatus';

const STATUS_OPTIONS = [
  { value: 'paid', label: 'Pago' },
  { value: 'awaiting', label: 'Aguardando' },
  { value: 'partial', label: 'Parcial' },
  { value: 'pending', label: 'Pendente' },
];

export default function PaymentStatusPopover({
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
  const [status, setStatus] = useState(initialStatus === 'soon' || initialStatus === 'none' ? 'pending' : initialStatus);
  const [paidAmount, setPaidAmount] = useState('');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState(initialNote || '');

  useEffect(() => {
    const amt = initialPaidAmount > 0 ? initialPaidAmount : expectedAmount;
    setPaidAmount(maskCurrency(String(Math.round(amt * 100))));
    setStatus(initialStatus === 'soon' || initialStatus === 'none' ? 'pending' : initialStatus);
    setNote(initialNote || '');
    setPaidAt(initialPaidAt ? String(initialPaidAt).slice(0, 10) : new Date().toISOString().slice(0, 10));
  }, [initialStatus, initialPaidAmount, expectedAmount, initialNote, initialPaidAt]);

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
    const paidNum = parseCurrencyBRL(paidAmount);
    const dbStatus = mapDbStatusFromGridForm(status);
    if ((dbStatus === 'paid' || dbStatus === 'partial') && (!Number.isFinite(paidNum) || paidNum < 0)) {
      return;
    }
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
          onChange={(e) => setStatus(e.target.value)}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {showAmount ? (
          <div>
            <label className="text-xs payment-status-popover__field-label">Valor recebido</label>
            <input
              className="form-input payment-status-popover__input--amount"
              value={paidAmount}
              onChange={(e) => setPaidAmount(maskCurrency(e.target.value))}
            />
            {status === 'partial' && expectedAmount > 0 ? (
              <p className="text-xs text-muted payment-status-popover__hint">
                Esperado: {expectedAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            ) : null}
          </div>
        ) : null}

        {status !== 'awaiting' ? (
          <div>
            <label className="text-xs payment-status-popover__field-label">Data</label>
            <DateInputField
              type="date"
              className="form-input payment-status-popover__input--compact"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
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
