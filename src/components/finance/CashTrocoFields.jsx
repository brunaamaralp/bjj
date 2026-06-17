import React, { useEffect, useMemo } from 'react';
import { formatBRLFromCents, parseMaskToCents } from '../../lib/moneyBr.js';
import { trocoFormOptionsForFinance } from '../../lib/salePayments.js';
import {
  computeTrocoFromPayForm,
  defaultTrocoAccount,
  isCashPaymentMethod,
  parseCashReceivedAmount,
} from '../../lib/studentPaymentTroco.js';
import { accountWhenPaymentMethodChanges } from '../../lib/paymentMethodBankDefaults.js';
import { hasConfiguredBankAccounts } from '../../lib/bankAccounts.js';
import BankAccountSelect from './BankAccountSelect.jsx';

/**
 * Campos de troco para pagamento em dinheiro (mensalidade / matrícula).
 */
export default function CashTrocoFields(props) {
  if (!isCashPaymentMethod(props.payForm?.method)) return null;
  return <CashTrocoFieldsInner {...props} />;
}

function CashTrocoFieldsInner({
  payForm,
  setPayForm,
  amountNum,
  academyId = '',
  financeConfig = null,
  disabled = false,
  className = '',
  inputClassName = 'form-input',
  labelClassName = 'form-label',
  cashReceivedId = '',
  trocoAccountId = 'troco-account',
}) {
  const amount = Number(amountNum);
  const troco = useMemo(() => computeTrocoFromPayForm(payForm, amount), [payForm, amount]);
  const trocoFormOptions = useMemo(
    () => trocoFormOptionsForFinance(financeConfig),
    [financeConfig]
  );
  const received = parseCashReceivedAmount(payForm);
  const insuficiente =
    Number.isFinite(amount) && amount > 0 && received != null && received + 0.004 < amount;
  const showTrocoAccount = troco > 0 && hasConfiguredBankAccounts(financeConfig);

  const cashReceivedDisplay = payForm?.cash_received ?? '';

  useEffect(() => {
    if (troco <= 0 || payForm?.trocoAccount) return;
    const suggested = defaultTrocoAccount(payForm, financeConfig);
    if (!suggested) return;
    setPayForm((p) => ({ ...p, trocoAccount: suggested }));
  }, [troco, payForm?.trocoAccount, payForm, financeConfig, setPayForm]);

  return (
    <div className={`cash-troco-fields${className ? ` ${className}` : ''}`}>
      <div className="form-group">
        <label className={labelClassName}>Valor recebido em dinheiro</label>
        <input
          id={cashReceivedId || undefined}
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
      <div className="form-group">
        <label className={labelClassName}>Devolver troco via</label>
        <select
          className={inputClassName}
          disabled={disabled}
          value={payForm?.formaTroco || 'pix'}
          onChange={(e) => {
            const formaTroco = e.target.value;
            setPayForm((p) => ({
              ...p,
              formaTroco,
              trocoAccount:
                accountWhenPaymentMethodChanges(financeConfig, formaTroco) || p.trocoAccount || p.account || '',
            }));
          }}
        >
          {trocoFormOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {showTrocoAccount ? (
        <BankAccountSelect
          id={trocoAccountId}
          academyId={academyId}
          financeConfig={financeConfig}
          value={payForm?.trocoAccount || ''}
          onChange={(v) => setPayForm((p) => ({ ...p, trocoAccount: v }))}
          label="Conta do troco"
          required
          disabled={disabled}
          className={inputClassName}
        />
      ) : null}
    </div>
  );
}
