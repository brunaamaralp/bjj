import React, { useMemo } from 'react';
import { formatBRLFromCents, parseMaskToCents } from '../../lib/moneyBr.js';
import { TROCO_FORM_OPTIONS } from '../../lib/salePayments.js';
import {
  computeTrocoFromPayForm,
  isCashPaymentMethod,
  parseCashReceivedAmount,
} from '../../lib/studentPaymentTroco.js';

/**
 * Campos de troco para pagamento em dinheiro (mensalidade / matrícula).
 */
export default function CashTrocoFields({
  payForm,
  setPayForm,
  amountNum,
  disabled = false,
  className = '',
  inputClassName = 'form-input',
  labelClassName = 'form-label',
}) {
  const method = payForm?.method;
  if (!isCashPaymentMethod(method)) return null;

  const amount = Number(amountNum);
  const troco = useMemo(() => computeTrocoFromPayForm(payForm, amount), [payForm, amount]);
  const received = parseCashReceivedAmount(payForm);
  const insuficiente =
    Number.isFinite(amount) && amount > 0 && received != null && received + 0.004 < amount;

  const cashReceivedDisplay = payForm?.cash_received ?? '';

  return (
    <div className={`cash-troco-fields${className ? ` ${className}` : ''}`}>
      <div className="form-group">
        <label className={labelClassName}>Valor recebido em dinheiro</label>
        <input
          type="text"
          className={inputClassName}
          inputMode="decimal"
          placeholder="0,00"
          disabled={disabled}
          value={cashReceivedDisplay}
          onChange={(e) =>
            setPayForm((p) => ({
              ...p,
              cash_received: formatBRLFromCents(parseMaskToCents(e.target.value)),
            }))
          }
        />
      </div>
      <p className="text-small" style={{ margin: '0 0 10px' }}>
        Troco:{' '}
        <strong style={{ color: insuficiente ? 'var(--danger)' : 'var(--text)' }}>
          {formatBRLFromCents(Math.round(troco * 100))}
        </strong>
        {insuficiente ? (
          <span style={{ color: 'var(--danger)', marginLeft: 8 }}>Valor insuficiente</span>
        ) : null}
      </p>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className={labelClassName}>Devolver troco via</label>
        <select
          className={inputClassName}
          disabled={disabled}
          value={payForm?.formaTroco || 'pix'}
          onChange={(e) => setPayForm((p) => ({ ...p, formaTroco: e.target.value }))}
        >
          {TROCO_FORM_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
