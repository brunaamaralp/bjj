import React, { useCallback, useState } from 'react';
import { DateInput } from '../DateInput';
import ModalShell from '../shared/ModalShell.jsx';
import BankAccountSelect from '../finance/BankAccountSelect.jsx';
import { PAYMENT_CATEGORY, normalizePaymentCategory } from '../../lib/studentPayments.js';
import { BUNDLE_DURATION_OPTIONS } from '../../lib/paymentCategories.js';
import StudentProductSaleStep from './StudentProductSaleStep.jsx';
import PlanSelect from '../shared/PlanSelect.jsx';
import { planPriceToPayAmountString } from '../../lib/academyPlans.js';
import { resolveBankAccountForPayment } from '../../lib/bankAccounts.js';
import {
  pickInitialBankAccountForPayment,
  accountWhenPaymentMethodChanges,
} from '../../lib/paymentMethodBankDefaults.js';
import { PAYMENT_METHODS } from '../../lib/paymentMethods.js';
import { formatBRLFromCents, numberToCents, parseMaskToCents, centsToNumber } from '../../lib/moneyBr';
import CashTrocoFields from '../finance/CashTrocoFields.jsx';
import { isCashPaymentMethod } from '../../lib/studentPaymentTroco.js';

export const PAYMENT_MODAL_PRODUCT = 'product';


export function paymentFormFromDoc(payment, student, financeConfig = null) {
  const base = buildDefaultPayForm(student, financeConfig);
  if (!payment) return base;
  const cat = normalizePaymentCategory(payment);
  const cents = numberToCents(payment.amount ?? payment.paid_amount);
  const paidSlice = payment.paid_at ? String(payment.paid_at).slice(0, 10) : base.paid_at;
  const dueSlice = payment.due_date ? String(payment.due_date).slice(0, 10) : '';
  const rawAccount = payment.account || base.account;
  return {
    ...base,
    payment_type: cat,
    reference_month: payment.reference_month || base.reference_month,
    bundle_start_month: payment.reference_month || base.bundle_start_month,
    bundle_months: Number(payment.bundle_months) || base.bundle_months,
    amount: cents != null ? formatBRLFromCents(cents) : base.amount,
    method: payment.method || base.method,
    account: financeConfig
      ? resolveBankAccountForPayment(rawAccount, financeConfig)
      : rawAccount,
    status: payment.status || base.status,
    paid_at: paidSlice,
    due_date: dueSlice,
    plan_name: payment.plan_name || base.plan_name,
    note: payment.note || '',
  };
}

export function buildDefaultPayForm(student, financeConfig = null) {
  const ym = new Date().toISOString().slice(0, 7);
  const preferredAccount = student?.preferredPaymentAccount || '';
  const method = student?.preferredPaymentMethod || 'pix';
  return {
    payment_type: PAYMENT_CATEGORY.PLAN,
    reference_month: ym,
    bundle_start_month: ym,
    bundle_months: 12,
    amount:
      student?.plan_price != null && student.plan_price !== ''
        ? formatBRLFromCents(numberToCents(student.plan_price) ?? 0)
        : '',
    method,
    account: financeConfig
      ? pickInitialBankAccountForPayment(financeConfig, preferredAccount, method)
      : preferredAccount,
    status: 'paid',
    paid_at: new Date().toISOString().slice(0, 10),
    due_date: '',
    plan_name: student?.plan || '',
    note: '',
    cash_received: '',
    formaTroco: 'pix',
    trocoAccount: '',
  };
}

export default function StudentPaymentModal({
  open,
  student,
  academyId,
  financeConfig,
  payForm,
  setPayForm,
  saving,
  inputStyle,
  onClose,
  onSave,
  salesEnabled = false,
  onSaleComplete,
  editingPaymentId = null,
  formError = '',
}) {
  const [productStep, setProductStep] = useState(false);
  const [showProductDeferHint, setShowProductDeferHint] = useState(false);

  const handleClose = useCallback(() => {
    setProductStep(false);
    setShowProductDeferHint(false);
    onClose();
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (saving) return;
    handleClose();
  }, [saving, handleClose]);

  if (!open || !student) return null;

  const isProduct = payForm.payment_type === PAYMENT_MODAL_PRODUCT || productStep;
  const isPlan = payForm.payment_type === PAYMENT_CATEGORY.PLAN;
  const isBundle = payForm.payment_type === PAYMENT_CATEGORY.BUNDLE;
  const isFee = payForm.payment_type === PAYMENT_CATEGORY.FEE;
  const isOther = payForm.payment_type === PAYMENT_CATEGORY.OTHER;
  const showPaidDate = payForm.status === 'paid' || isFee || isBundle || isOther;
  const showPlanFields = isPlan || isBundle;
  const amountNum = centsToNumber(parseMaskToCents(payForm.amount));

  const typeOptions = [
    { value: PAYMENT_CATEGORY.PLAN, label: 'Mensalidade' },
    { value: PAYMENT_CATEGORY.BUNDLE, label: 'Plano com cobertura' },
    ...(salesEnabled ? [{ value: PAYMENT_MODAL_PRODUCT, label: 'Produto' }] : []),
    { value: PAYMENT_CATEGORY.FEE, label: 'Taxa / avulso' },
    { value: PAYMENT_CATEGORY.OTHER, label: 'Outro' },
  ];

  const modalTitle = isProduct ? 'Venda de produto' : editingPaymentId ? 'Editar pagamento' : 'Registrar pagamento';

  return (
    <ModalShell
      open={open && Boolean(student)}
      title={modalTitle}
      onClose={requestClose}
      closeOnOverlay={!isProduct && !saving}
      closeOnEsc={!saving}
      showCloseButton={!saving}
      maxWidth={isProduct ? 560 : 480}
      className="navi-modal-overlay--form"
      dialogClassName="student-payment-modal"
      ariaLabelledBy="student-payment-modal-title"
      footer={
        !isProduct ? (
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <button
              type="button"
              disabled={saving}
              onClick={handleClose}
              className="btn-outline"
              style={{ flex: 1 }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void onSave()}
              className="btn-primary"
              style={{ flex: 1 }}
            >
              {saving ? 'Salvando...' : editingPaymentId ? 'Salvar alterações' : 'Registrar'}
            </button>
          </div>
        ) : null
      }
    >
        {formError ? (
          <p
            role="alert"
            style={{
              margin: '0 0 12px',
              padding: '10px 12px',
              borderRadius: 8,
              background: 'var(--danger-light, #fcebeb)',
              color: 'var(--danger)',
              fontSize: 13,
              lineHeight: 1.45,
            }}
          >
            {formError}
          </p>
        ) : null}

        {isProduct ? (
          <>
            {showProductDeferHint ? (
              <p
                role="status"
                style={{
                  margin: '0 0 12px',
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'var(--surface-2, rgba(148,163,184,0.12))',
                  color: 'var(--text-secondary)',
                  fontSize: 13,
                  lineHeight: 1.45,
                }}
              >
                Para venda de produto com pagamento posterior, use &quot;Registrar venda&quot; e marque
                &quot;Receber depois&quot;.
              </p>
            ) : null}
            <StudentProductSaleStep
            student={student}
            onBack={() => {
              setProductStep(false);
              setShowProductDeferHint(false);
              setPayForm((p) => ({ ...p, payment_type: PAYMENT_CATEGORY.PLAN }));
            }}
            onComplete={() => {
              setProductStep(false);
              onSaleComplete?.();
              handleClose();
            }}
          />
          </>
        ) : (
          <>
            <div className="form-section">
              <fieldset style={{ border: 'none', margin: 0, padding: 0 }} disabled={Boolean(editingPaymentId)}>
                <legend className="form-label">Tipo de pagamento</legend>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {typeOptions.map((opt) => (
                    <label
                      key={opt.value}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 14,
                        cursor: editingPaymentId ? 'default' : 'pointer',
                        color: 'var(--text)',
                        opacity: editingPaymentId && payForm.payment_type !== opt.value ? 0.45 : 1,
                      }}
                    >
                      <input
                        type="radio"
                        name="payment_type"
                        value={opt.value}
                        checked={payForm.payment_type === opt.value}
                        disabled={Boolean(editingPaymentId)}
                        onChange={() => {
                          if (opt.value === PAYMENT_MODAL_PRODUCT) {
                            setProductStep(true);
                            setShowProductDeferHint(true);
                            setPayForm((p) => ({ ...p, payment_type: PAYMENT_MODAL_PRODUCT }));
                            return;
                          }
                          setShowProductDeferHint(false);
                          setPayForm((p) => ({
                            ...p,
                            payment_type: opt.value,
                            status:
                              opt.value === PAYMENT_CATEGORY.FEE || opt.value === PAYMENT_CATEGORY.BUNDLE
                                ? 'paid'
                                : p.status,
                          }));
                        }}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              {isPlan ? (
                <div>
                  <DateInput
                    label="Mês de referência"
                    type="month"
                    className="form-input"
                    style={{ width: '100%' }}
                    value={payForm.reference_month}
                    onChange={(e) => setPayForm((p) => ({ ...p, reference_month: e.target.value }))}
                    required
                  />
                </div>
              ) : null}

              {isBundle ? (
                <>
                  <div className="form-group">
                    <label className="form-label">Duração</label>
                    <select
                      className="form-input"
                      style={{ ...inputStyle, width: '100%' }}
                      value={payForm.bundle_months}
                      onChange={(e) =>
                        setPayForm((p) => ({ ...p, bundle_months: Number(e.target.value) }))
                      }
                    >
                      {BUNDLE_DURATION_OPTIONS.map((o) => (
                        <option key={o.months} value={o.months}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <DateInput
                      label="Início da cobertura"
                      type="month"
                      className="form-input"
                      style={{ width: '100%' }}
                      value={payForm.bundle_start_month}
                      onChange={(e) =>
                        setPayForm((p) => ({ ...p, bundle_start_month: e.target.value }))
                      }
                      required
                    />
                  </div>
                </>
              ) : null}

              {isFee || isOther ? (
                <div className="form-group">
                  <label className="form-label">Descrição{isFee ? ' *' : ''}</label>
                  <input
                    type="text"
                    className="form-input"
                    style={{ ...inputStyle, width: '100%' }}
                    placeholder={isFee ? 'Ex.: Taxa de competição' : 'Descrição do pagamento'}
                    value={payForm.note}
                    onChange={(e) => setPayForm((p) => ({ ...p, note: e.target.value }))}
                    required={isFee}
                  />
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                    Não aparece na grade de Mensalidades.
                  </p>
                </div>
              ) : null}

              {isPlan ? (
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select
                    className="form-input"
                    style={{ ...inputStyle, width: '100%' }}
                    value={payForm.status}
                    onChange={(e) => setPayForm((p) => ({ ...p, status: e.target.value }))}
                  >
                    <option value="paid">Pago</option>
                    <option value="pending">Pendente</option>
                  </select>
                </div>
              ) : null}

              <div className="form-group">
                <label className="form-label">Valor (R$)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="R$ 0,00"
                  className="form-input"
                  style={{ ...inputStyle, width: '100%' }}
                  value={payForm.amount}
                  onChange={(e) =>
                    setPayForm((p) => ({
                      ...p,
                      amount: formatBRLFromCents(parseMaskToCents(e.target.value)),
                    }))
                  }
                />
              </div>

              {showPaidDate ? (
                <div>
                  <DateInput
                    label="Data do pagamento"
                    type="date"
                    className="form-input"
                    style={{ width: '100%' }}
                    value={payForm.paid_at}
                    onChange={(e) => setPayForm((p) => ({ ...p, paid_at: e.target.value }))}
                    required
                  />
                </div>
              ) : null}

              {payForm.status === 'pending' && isPlan ? (
                <div>
                  <DateInput
                    label="Data de vencimento"
                    type="date"
                    className="form-input"
                    style={{ width: '100%' }}
                    value={payForm.due_date}
                    onChange={(e) => setPayForm((p) => ({ ...p, due_date: e.target.value }))}
                    required
                  />
                </div>
              ) : null}

              <div className="form-group">
                <label className="form-label">Forma de pagamento</label>
                <select
                  className="form-input"
                  style={{ ...inputStyle, width: '100%' }}
                  value={payForm.method}
                  onChange={(e) => {
                    const method = e.target.value;
                    setPayForm((p) => ({
                      ...p,
                      method,
                      account: accountWhenPaymentMethodChanges(financeConfig, method) || p.account,
                      ...(isCashPaymentMethod(method) && !p.cash_received
                        ? { cash_received: p.amount || '' }
                        : !isCashPaymentMethod(method)
                          ? { cash_received: '', formaTroco: 'pix', trocoAccount: '' }
                          : {}),
                    }));
                  }}
                >
                  {PAYMENT_METHODS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {showPaidDate && isCashPaymentMethod(payForm.method) ? (
                <CashTrocoFields
                  payForm={payForm}
                  setPayForm={setPayForm}
                  amountNum={amountNum}
                  academyId={academyId}
                  financeConfig={financeConfig}
                  disabled={saving}
                  inputClassName="form-input"
                  labelClassName="form-label"
                />
              ) : null}

              <BankAccountSelect
                id="student-pay-account"
                academyId={academyId}
                financeConfig={financeConfig}
                value={payForm.account}
                onChange={(v) => setPayForm((p) => ({ ...p, account: v }))}
                label="Conta"
                required
                className="form-input"
                style={{ width: '100%' }}
              />

              {showPlanFields ? (
                <div className="form-group">
                  <label className="form-label">Plano</label>
                  <PlanSelect
                    id="student-pay-plan"
                    financeConfig={financeConfig}
                    value={payForm.plan_name}
                    onChange={(v) => setPayForm((p) => ({ ...p, plan_name: v }))}
                    onPlanPick={(pl) => {
                      if (!pl) return;
                      const amt = planPriceToPayAmountString(pl);
                      if (amt) setPayForm((p) => ({ ...p, plan_name: pl.name, amount: amt }));
                    }}
                    className="form-input"
                    style={{ ...inputStyle, width: '100%' }}
                    showConfigHint={false}
                  />
                </div>
              ) : null}

              {showPlanFields ? (
                <div className="form-group">
                  <label className="form-label">Observação</label>
                  <textarea
                    rows={2}
                    className="form-input"
                    style={{ ...inputStyle, width: '100%', resize: 'vertical', minHeight: 64 }}
                    value={payForm.note}
                    onChange={(e) => setPayForm((p) => ({ ...p, note: e.target.value }))}
                  />
                </div>
              ) : null}
            </div>
          </>
        )}
    </ModalShell>
  );
}
