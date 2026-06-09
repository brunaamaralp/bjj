import React from 'react';
import { DateInput, DateInputField } from './DateInput';
import BankAccountSelect from './finance/BankAccountSelect.jsx';
import PlanSelect from './shared/PlanSelect.jsx';
import { PAYMENT_CATEGORY } from '../lib/studentPayments.js';
import { BUNDLE_DURATION_OPTIONS } from '../lib/paymentCategories.js';
import { PAYMENT_METHODS } from '../lib/paymentMethods.js';
import { accountWhenPaymentMethodChanges } from '../lib/bankAccounts.js';
import { findPlanByName, planPriceToPayAmountString } from '../lib/academyPlans.js';
import CashTrocoFields from './finance/CashTrocoFields.jsx';
import { isCashPaymentMethod } from '../lib/studentPaymentTroco.js';
import { centsToNumber, parseMaskToCents } from '../lib/moneyBr.js';

/**
 * Pagamento opcional pós-matrícula (mensalidade ou pacote).
 */
export default function MatriculaPaymentStep({
  payForm,
  setPayForm,
  financeConfig,
  academyId,
  enrollmentPlan,
  onPlanChange,
  disabled = false,
  paymentError = '',
}) {
  if (!payForm) return null;

  const isPlan = payForm.payment_type === PAYMENT_CATEGORY.PLAN;
  const isBundle = payForm.payment_type === PAYMENT_CATEGORY.BUNDLE;
  const showPaidDate = payForm.status === 'paid' || isBundle;

  const handleTypeChange = (value) => {
    setPayForm((p) => ({
      ...p,
      payment_type: value,
      status: value === PAYMENT_CATEGORY.BUNDLE ? 'paid' : p.status,
    }));
  };

  const handlePlanSelect = (name) => {
    onPlanChange?.(name);
    const plan = findPlanByName(financeConfig, name);
    setPayForm((p) => ({
      ...p,
      plan_name: name,
      amount: plan ? planPriceToPayAmountString(plan) : p.amount,
    }));
  };

  return (
    <div className="matricula-payment-step">
      {paymentError ? (
        <p className="matricula-payment-step__error" role="alert">
          {paymentError}
        </p>
      ) : null}

      <div className="form-group">
        <label className="form-label">Plano</label>
        <PlanSelect
          financeConfig={financeConfig}
          value={enrollmentPlan || payForm.plan_name || ''}
          onChange={handlePlanSelect}
          disabled={disabled}
          emptyLabel="Selecione o plano…"
        />
      </div>

      <fieldset className="matricula-payment-step__types" disabled={disabled}>
        <legend className="form-label">Tipo de pagamento</legend>
        <label className="matricula-payment-step__type-option">
          <input
            type="radio"
            name="matricula_payment_type"
            checked={isPlan}
            onChange={() => handleTypeChange(PAYMENT_CATEGORY.PLAN)}
          />
          Mensalidade
        </label>
        <label className="matricula-payment-step__type-option">
          <input
            type="radio"
            name="matricula_payment_type"
            checked={isBundle}
            onChange={() => handleTypeChange(PAYMENT_CATEGORY.BUNDLE)}
          />
          Plano com cobertura (anual / pacote)
        </label>
      </fieldset>

      {isPlan ? (
        <DateInput
          label="Mês de referência"
          type="month"
          className="form-input"
          value={payForm.reference_month}
          onChange={(e) => setPayForm((p) => ({ ...p, reference_month: e.target.value }))}
          disabled={disabled}
          required
        />
      ) : null}

      {isBundle ? (
        <>
          <div className="form-group">
            <label className="form-label">Duração</label>
            <select
              className="form-input"
              value={payForm.bundle_months}
              disabled={disabled}
              onChange={(e) => setPayForm((p) => ({ ...p, bundle_months: Number(e.target.value) }))}
            >
              {BUNDLE_DURATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <DateInput
            label="Início da cobertura"
            type="month"
            className="form-input"
            value={payForm.bundle_start_month}
            disabled={disabled}
            onChange={(e) => setPayForm((p) => ({ ...p, bundle_start_month: e.target.value }))}
            required
          />
        </>
      ) : null}

      <div className="form-group">
        <label className="form-label">Valor (R$)</label>
        <input
          className="form-input"
          inputMode="decimal"
          placeholder="0,00"
          value={payForm.amount}
          disabled={disabled}
          onChange={(e) => setPayForm((p) => ({ ...p, amount: e.target.value }))}
        />
      </div>

      {!isBundle ? (
        <div className="form-group">
          <label className="form-label">Situação</label>
          <select
            className="form-input"
            value={payForm.status}
            disabled={disabled}
            onChange={(e) => setPayForm((p) => ({ ...p, status: e.target.value }))}
          >
            <option value="paid">Pago</option>
            <option value="pending">Pendente</option>
          </select>
        </div>
      ) : null}

      {showPaidDate ? (
        <DateInputField
          label="Data do pagamento"
          type="date"
          className="form-input"
          value={payForm.paid_at}
          disabled={disabled}
          onChange={(e) => setPayForm((p) => ({ ...p, paid_at: e.target.value }))}
        />
      ) : null}

      {payForm.status === 'pending' && isPlan ? (
        <DateInputField
          label="Vencimento"
          type="date"
          className="form-input"
          value={payForm.due_date}
          disabled={disabled}
          onChange={(e) => setPayForm((p) => ({ ...p, due_date: e.target.value }))}
        />
      ) : null}

      <div className="form-group">
        <label className="form-label">Forma de pagamento</label>
        <select
          className="form-input"
          value={payForm.method}
          disabled={disabled}
          onChange={(e) => {
            const method = e.target.value;
            setPayForm((p) => ({
              ...p,
              method,
              account: accountWhenPaymentMethodChanges(financeConfig, method) || p.account,
              ...(isCashPaymentMethod(method) && !p.cash_received
                ? { cash_received: p.amount || '' }
                : !isCashPaymentMethod(method)
                  ? { cash_received: '', formaTroco: 'pix' }
                  : {}),
            }));
          }}
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {showPaidDate && isCashPaymentMethod(payForm.method) ? (
        <CashTrocoFields
          payForm={payForm}
          setPayForm={setPayForm}
          amountNum={centsToNumber(parseMaskToCents(payForm.amount))}
          disabled={disabled}
        />
      ) : null}

      {financeConfig ? (
        <BankAccountSelect
          academyId={academyId}
          financeConfig={financeConfig}
          id="matricula-payment-bank"
          label="Conta bancária"
          required={payForm.status === 'paid'}
          value={payForm.account || ''}
          disabled={disabled}
          onChange={(v) => setPayForm((p) => ({ ...p, account: v }))}
        />
      ) : null}

      <div className="form-group">
        <label className="form-label">Observação (opcional)</label>
        <input
          className="form-input"
          value={payForm.note || ''}
          disabled={disabled}
          onChange={(e) => setPayForm((p) => ({ ...p, note: e.target.value }))}
          placeholder="Ex.: 1ª mensalidade na matrícula"
        />
      </div>
    </div>
  );
}
