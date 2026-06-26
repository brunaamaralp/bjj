import React from 'react';
import { DateInput, DateInputField } from './DateInput';
import BankAccountSelect from './finance/BankAccountSelect.jsx';
import PlanSelect from './shared/PlanSelect.jsx';
import EnrollmentDiscountFields from './shared/EnrollmentDiscountFields.jsx';
import { PAYMENT_CATEGORY } from '../lib/studentPayments.js';
import { BUNDLE_DURATION_OPTIONS } from '../lib/paymentCategories.js';
import { orderedActiveStorageDialectMethodsForModal } from '../lib/paymentMethodSettings.js';
import {
  whenCaptureMethodChanges,
  whenPaymentMethodChangesWithCapture,
} from '../lib/captureMethodPaymentForm.js';
import CaptureMethodSelect from './finance/CaptureMethodSelect.jsx';
import CashTrocoFields from './finance/CashTrocoFields.jsx';
import { isCashPaymentMethod } from '../lib/studentPaymentTroco.js';
import { isStorageCreditMethod } from '../lib/paymentMethods.js';
import { centsToNumber, formatBRL, parseMaskToCents } from '../lib/moneyBr.js';
import { DISCOUNT_TYPES, parseDiscountAmountInput } from '../lib/planBilling.js';
import { enrollmentPlanPricing } from '../lib/enrollmentPayment.js';

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
  discountType = DISCOUNT_TYPES.NONE,
  discountAmount = '',
  onDiscountTypeChange,
  onDiscountChange,
  disabled = false,
  paymentError = '',
}) {
  if (!payForm) return null;

  const isPlan = payForm.payment_type === PAYMENT_CATEGORY.PLAN;
  const isBundle = payForm.payment_type === PAYMENT_CATEGORY.BUNDLE;
  const showPaidDate = payForm.status === 'paid' || isBundle;
  const selectedPlanName = String(enrollmentPlan || payForm.plan_name || '').trim();
  const discountValue = parseDiscountAmountInput(discountAmount, discountType);
  const pricing = React.useMemo(
    () =>
      enrollmentPlanPricing(financeConfig, selectedPlanName, {
        discount_amount: discountValue,
        discount_type: discountType,
      }),
    [financeConfig, selectedPlanName, discountValue, discountType]
  );

  React.useEffect(() => {
    const nextAmount =
      pricing.finalPrice > 0 ? pricing.finalPrice.toFixed(2).replace('.', ',') : '';
    setPayForm((current) => {
      if (!current) return current;
      if (current.amount === nextAmount && current.plan_name === selectedPlanName) return current;
      return {
        ...current,
        plan_name: selectedPlanName,
        amount: nextAmount,
      };
    });
  }, [pricing.finalPrice, selectedPlanName, setPayForm, payForm.payment_type]);

  const handleTypeChange = (value) => {
    setPayForm((p) => ({
      ...p,
      payment_type: value,
      status: value === PAYMENT_CATEGORY.BUNDLE ? 'paid' : p.status,
    }));
  };

  const handlePlanSelect = (name) => {
    onPlanChange?.(name);
    const nextPricing = enrollmentPlanPricing(financeConfig, name, {
      discount_amount: discountValue,
      discount_type: discountType,
    });
    setPayForm((p) => ({
      ...p,
      plan_name: name,
      amount: nextPricing.finalPrice > 0 ? nextPricing.finalPrice.toFixed(2).replace('.', ',') : '',
    }));
  };

  const handleMethodChange = (method) => {
    setPayForm((p) => ({
      ...p,
      method,
      installments: isStorageCreditMethod(method) ? p.installments || 1 : 1,
      ...whenPaymentMethodChangesWithCapture(financeConfig, method),
      ...(isCashPaymentMethod(method) && !p.cash_received
        ? { cash_received: p.amount || '' }
        : !isCashPaymentMethod(method)
          ? { cash_received: '', formaTroco: 'pix', trocoAccount: '' }
          : {}),
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
          value={selectedPlanName}
          onChange={handlePlanSelect}
          disabled={disabled}
          emptyLabel="Selecione o plano…"
        />
      </div>

      <EnrollmentDiscountFields
        planPrice={pricing.planPrice}
        planName={selectedPlanName}
        financeConfig={financeConfig}
        discountType={discountType}
        discountAmount={discountAmount}
        onTypeChange={(nextType) => {
          onDiscountTypeChange?.(nextType);
          if (nextType === DISCOUNT_TYPES.NONE) onDiscountChange?.('');
        }}
        onAmountChange={onDiscountChange}
        disabled={disabled}
        idPrefix="matricula-payment-discount"
      />

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
        <label className="form-label" htmlFor="matricula-payment-amount">Valor (R$)</label>
        <input
          id="matricula-payment-amount"
          className="form-input"
          inputMode="decimal"
          placeholder="0,00"
          value={payForm.amount}
          disabled={disabled}
          onChange={(e) => setPayForm((p) => ({ ...p, amount: e.target.value }))}
        />
        <p className="text-small text-muted" style={{ marginTop: 6, marginBottom: 0 }}>
          Valor cobrado: {formatBRL(pricing.finalPrice)}
        </p>
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
          onChange={(e) => handleMethodChange(e.target.value)}
        >
          {orderedActiveStorageDialectMethodsForModal(financeConfig).map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {isStorageCreditMethod(payForm.method) ? (
        <div className="form-group">
          <label className="form-label" htmlFor="matricula-payment-installments">
            Parcelas
          </label>
          <select
            id="matricula-payment-installments"
            className="form-input"
            value={String(payForm.installments || 1)}
            disabled={disabled}
            onChange={(e) =>
              setPayForm((p) => ({
                ...p,
                installments: Number(e.target.value) || 1,
              }))
            }
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={String(n)}>
                {n === 1 ? '1x (à vista)' : `${n}x`}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <CaptureMethodSelect
        financeConfig={financeConfig}
        method={payForm.method}
        value={payForm.capture_method_id}
        id="matricula-pay-capture-method"
        disabled={disabled}
        onChange={(captureId) =>
          setPayForm((p) => ({
            ...p,
            ...whenCaptureMethodChanges(financeConfig, captureId, p.method),
          }))
        }
      />

      {showPaidDate && isCashPaymentMethod(payForm.method) ? (
        <CashTrocoFields
          payForm={payForm}
          setPayForm={setPayForm}
          amountNum={centsToNumber(parseMaskToCents(payForm.amount))}
          academyId={academyId}
          financeConfig={financeConfig}
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
