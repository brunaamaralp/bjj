import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DateInput } from '../DateInput';
import ModalShell from '../shared/ModalShell.jsx';
import PaymentFormErrorBanner from '../shared/PaymentFormErrorBanner.jsx';
import PaymentModalFooterHint from '../shared/PaymentModalFooterHint.jsx';
import FieldError from '../shared/FieldError.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import BankAccountSelect from '../finance/BankAccountSelect.jsx';
import { PAYMENT_CATEGORY, normalizePaymentCategory } from '../../lib/studentPayments.js';
import { BUNDLE_DURATION_OPTIONS } from '../../lib/paymentCategories.js';
import StudentProductSaleStep, { STUDENT_PRODUCT_SALE_FORM_ID } from './StudentProductSaleStep.jsx';
import PlanSelect from '../shared/PlanSelect.jsx';
import { hasConfiguredBankAccounts, resolveBankAccountForPayment } from '../../lib/bankAccounts.js';
import { pickFinanceConfigForPayments } from '../../lib/financeConfigForPayments.js';
import { useLeadStore } from '../../store/useLeadStore';
import { EMPRESA_FINANCE_ACCOUNTS_PATH } from '../../lib/financeiroHubTabs.js';
import { STUDENT_PAY_FIELD_IDS } from '../../lib/mensalidadesPaymentForm.js';
import {
  pickInitialBankAccountForPayment,
  accountWhenPaymentMethodChanges,
} from '../../lib/paymentMethodBankDefaults.js';
import {
  whenCaptureMethodChanges,
  whenPaymentMethodChangesWithCapture,
} from '../../lib/captureMethodPaymentForm.js';
import CaptureMethodSelect from '../finance/CaptureMethodSelect.jsx';
import { orderedActiveStorageDialectMethodsForModal } from '../../lib/paymentMethodSettings.js';
import { formatBRLFromCents, numberToCents, parseMaskToCents, centsToNumber } from '../../lib/moneyBr';
import CashTrocoFields from '../finance/CashTrocoFields.jsx';
import { isCashPaymentMethod } from '../../lib/studentPaymentTroco.js';
import { useSalesStore } from '../../store/useSalesStore';
import PaymentReceiptDateBanner from '../finance/PaymentReceiptDateBanner.jsx';
import { suggestPaidAtYmd } from '../../lib/paymentReceiptDate.js';
import { resolveStudentPlanFinalPrice } from '../../lib/planBilling.js';

export const PAYMENT_MODAL_PRODUCT = 'product';


export function paymentFormFromDoc(payment, student, financeConfig = null) {
  const base = buildDefaultPayForm(student, financeConfig);
  if (!payment) return base;
  const cat = normalizePaymentCategory(payment);
  const explicitAmount = Object.prototype.hasOwnProperty.call(payment || {}, 'amount')
    ? payment.amount
    : payment.paid_amount;
  const cents = numberToCents(explicitAmount);
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
    capture_method_id: payment.capture_method_id || base.capture_method_id,
    capture_method_name: payment.capture_method_name || base.capture_method_name,
    plan_name: payment.plan_name || base.plan_name,
    note: payment.note || '',
  };
}

export function buildDefaultPayForm(student, financeConfig = null) {
  const ym = new Date().toISOString().slice(0, 7);
  const preferredAccount = student?.preferredPaymentAccount || '';
  const method = student?.preferredPaymentMethod || 'pix';
  const defaultPlanAmount = resolveStudentPlanFinalPrice(student, financeConfig);
  return {
    payment_type: PAYMENT_CATEGORY.PLAN,
    reference_month: ym,
    bundle_start_month: ym,
    bundle_months: 12,
    amount:
      student?.plan_price != null && student.plan_price !== ''
        ? formatBRLFromCents(numberToCents(student.plan_price) ?? 0)
        : defaultPlanAmount > 0
          ? formatBRLFromCents(numberToCents(defaultPlanAmount) ?? 0)
        : '',
    method,
    account: financeConfig
      ? pickInitialBankAccountForPayment(financeConfig, preferredAccount, method)
      : preferredAccount,
    status: 'paid',
    paid_at: suggestPaidAtYmd({ coverageMonth: ym }),
    due_date: '',
    plan_name: student?.plan || '',
    note: '',
    capture_method_id: '',
    capture_method_name: '',
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
  fieldErrors = null,
  requireBankAccountForSave = false,
  canConfigureBankAccounts = false,
}) {
  const navigate = useNavigate();
  const creatingSale = useSalesStore((s) => s.creating);
  const [productStep, setProductStep] = useState(false);
  const [showProductDeferHint, setShowProductDeferHint] = useState(false);
  const [productDirty, setProductDirty] = useState(false);
  const [productVariantPickerOpen, setProductVariantPickerOpen] = useState(false);
  const [showDiscardProductDialog, setShowDiscardProductDialog] = useState(false);
  const [productSubmitState, setProductSubmitState] = useState({
    canSubmit: false,
    busy: false,
    label: 'Confirmar venda',
    footerHint: null,
    footerError: null,
  });
  const paidAtTouchedRef = useRef(false);

  useEffect(() => {
    if (open) paidAtTouchedRef.current = false;
  }, [open, editingPaymentId]);

  const syncPaidAtFromCoverage = useCallback(
    (coverageYm) => {
      if (paidAtTouchedRef.current) return;
      setPayForm((p) => ({ ...p, paid_at: suggestPaidAtYmd({ coverageMonth: coverageYm }) }));
    },
    [setPayForm]
  );

  const applyCoveragePaidAt = useCallback(() => {
    const isBundleType = payForm.payment_type === PAYMENT_CATEGORY.BUNDLE;
    const coverageYm = isBundleType
      ? String(payForm.bundle_start_month || '').trim()
      : String(payForm.reference_month || '').trim();
    paidAtTouchedRef.current = false;
    setPayForm((p) => ({ ...p, paid_at: suggestPaidAtYmd({ coverageMonth: coverageYm }) }));
  }, [payForm.payment_type, payForm.bundle_start_month, payForm.reference_month, setPayForm]);

  const handleClose = useCallback(() => {
    setProductStep(false);
    setShowProductDeferHint(false);
    setProductDirty(false);
    onClose();
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (saving || creatingSale) return;
    const isProductFlow = payForm.payment_type === PAYMENT_MODAL_PRODUCT || productStep;
    if (isProductFlow && productDirty) {
      setShowDiscardProductDialog(true);
      return;
    }
    handleClose();
  }, [saving, creatingSale, payForm.payment_type, productStep, productDirty, handleClose]);

  const handleProductNavigateAway = useCallback(
    (path) => {
      handleClose();
      navigate(path);
    },
    [handleClose, navigate]
  );

  const storeFinanceConfig = useLeadStore((s) => s.financeConfig);
  const effectiveFinanceConfig = useMemo(
    () => pickFinanceConfigForPayments(storeFinanceConfig, financeConfig),
    [storeFinanceConfig, financeConfig]
  );

  if (!open || !student) return null;

  const isProduct = payForm.payment_type === PAYMENT_MODAL_PRODUCT || productStep;
  const isPlan = payForm.payment_type === PAYMENT_CATEGORY.PLAN;
  const isBundle = payForm.payment_type === PAYMENT_CATEGORY.BUNDLE;
  const isFee = payForm.payment_type === PAYMENT_CATEGORY.FEE;
  const isOther = payForm.payment_type === PAYMENT_CATEGORY.OTHER;
  const showPaidDate = payForm.status === 'paid' || isFee || isBundle || isOther;
  const showPlanFields = isPlan || isBundle;
  const amountNum = centsToNumber(parseMaskToCents(payForm.amount));
  const payFieldErrors = fieldErrors && typeof fieldErrors === 'object' ? fieldErrors : {};
  const hasBankAccounts = hasConfiguredBankAccounts(effectiveFinanceConfig);
  const saveBlockedByBank =
    requireBankAccountForSave && !hasBankAccounts && (isPlan || isBundle);

  const typeOptions = [
    { value: PAYMENT_CATEGORY.PLAN, label: 'Mensalidade' },
    { value: PAYMENT_CATEGORY.BUNDLE, label: 'Plano com cobertura' },
    ...(salesEnabled ? [{ value: PAYMENT_MODAL_PRODUCT, label: 'Produto' }] : []),
    { value: PAYMENT_CATEGORY.FEE, label: 'Taxa / avulso' },
    { value: PAYMENT_CATEGORY.OTHER, label: 'Outro' },
  ];

  const modalTitle = isProduct ? 'Venda de produto' : editingPaymentId ? 'Editar pagamento' : 'Registrar pagamento';

  return (
    <>
    <ModalShell
      open={open && Boolean(student)}
      title={modalTitle}
      onClose={requestClose}
      closeOnOverlay={!isProduct && !saving}
      closeOnEsc={!saving && !(isProduct && productVariantPickerOpen)}
      showCloseButton={!saving && !creatingSale}
      maxWidth={isProduct ? 560 : 480}
      className="navi-modal-overlay--form"
      dialogClassName="student-payment-modal"
      ariaLabelledBy="student-payment-modal-title"
      footer={
        isProduct ? (
          <div className="sales-modal-footer">
            {productSubmitState.footerError || productSubmitState.footerHint ? (
              <p
                className={`sales-modal-footer__hint${productSubmitState.footerError ? ' sales-modal-footer__hint--error' : ''}`}
                role={productSubmitState.footerError ? 'alert' : 'status'}
              >
                {productSubmitState.footerError || productSubmitState.footerHint}
              </p>
            ) : null}
            <div className="student-payment-modal__footer">
              <button
                type="button"
                className="btn-outline"
                disabled={creatingSale}
                onClick={requestClose}
              >
                Cancelar
              </button>
              <button
                type="submit"
                form={STUDENT_PRODUCT_SALE_FORM_ID}
                className="btn-primary"
                disabled={creatingSale || !productSubmitState.canSubmit}
              >
                {productSubmitState.busy ? 'Registrando…' : 'Confirmar venda'}
              </button>
            </div>
          </div>
        ) : (
          <div className="payment-modal-footer">
            {saveBlockedByBank ? (
              <PaymentModalFooterHint variant="error" id="student-pay-footer-hint">
                {canConfigureBankAccounts ? (
                  <>
                    Cadastre uma conta de recebimento antes de confirmar.{' '}
                    <Link to={EMPRESA_FINANCE_ACCOUNTS_PATH}>Configurar agora →</Link>
                  </>
                ) : (
                  'Peça ao titular ou administrador que cadastre uma conta em Minha academia → Financeiro → Recebimento.'
                )}
              </PaymentModalFooterHint>
            ) : null}
            <div className="payment-modal-footer__actions">
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
                disabled={saving || saveBlockedByBank}
                onClick={() => void onSave()}
                className="btn-primary"
                style={{ flex: 1 }}
                aria-describedby={saveBlockedByBank ? 'student-pay-footer-hint' : undefined}
              >
                {saving ? 'Salvando...' : editingPaymentId ? 'Salvar alterações' : 'Registrar'}
              </button>
            </div>
          </div>
        )
      }
    >
        {formError ? <PaymentFormErrorBanner message={formError} /> : null}
        {!isProduct && showPaidDate ? (
          <PaymentReceiptDateBanner
            payForm={payForm}
            onUseCoverageDate={applyCoveragePaidAt}
          />
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
            hideSubmitButton
            onVariantPickerChange={setProductVariantPickerOpen}
            onDirtyChange={setProductDirty}
            onSubmitStateChange={setProductSubmitState}
            onNavigateAway={handleProductNavigateAway}
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
                    label="Mês de referência (cobertura)"
                    type="month"
                    className="form-input"
                    style={{ width: '100%' }}
                    value={payForm.reference_month}
                    onChange={(e) => {
                      const ym = e.target.value;
                      setPayForm((p) => ({ ...p, reference_month: ym }));
                      syncPaidAtFromCoverage(ym);
                    }}
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
                      id={STUDENT_PAY_FIELD_IDS.bundle_start_month}
                      label="Início da cobertura"
                      type="month"
                      className="form-input"
                      style={{ width: '100%' }}
                      value={payForm.bundle_start_month}
                      onChange={(e) => {
                        const ym = e.target.value;
                        setPayForm((p) => ({ ...p, bundle_start_month: ym }));
                        syncPaidAtFromCoverage(ym);
                      }}
                      required
                    />
                    <FieldError id="student-pay-bundle-start-error">
                      {payFieldErrors.bundle_start_month}
                    </FieldError>
                  </div>
                </>
              ) : null}

              {isFee || isOther ? (
                <div className="form-group">
                  <label className="form-label" htmlFor={STUDENT_PAY_FIELD_IDS.note}>
                    Descrição{isFee ? ' *' : ''}
                  </label>
                  <input
                    id={STUDENT_PAY_FIELD_IDS.note}
                    type="text"
                    className="form-input"
                    style={{ ...inputStyle, width: '100%' }}
                    placeholder={isFee ? 'Ex.: Taxa de competição' : 'Descrição do pagamento'}
                    value={payForm.note}
                    onChange={(e) => setPayForm((p) => ({ ...p, note: e.target.value }))}
                    required={isFee}
                  />
                  <FieldError id="student-pay-note-error">{payFieldErrors.note}</FieldError>
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
                <label className="form-label" htmlFor={STUDENT_PAY_FIELD_IDS.amount}>
                  Valor (R$)
                </label>
                <input
                  id={STUDENT_PAY_FIELD_IDS.amount}
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
                <FieldError id="student-pay-amount-error">{payFieldErrors.amount}</FieldError>
              </div>

              {showPaidDate ? (
                <div>
                  <DateInput
                    id={STUDENT_PAY_FIELD_IDS.paid_at}
                    label="Data em que o dinheiro entrou na conta"
                    type="date"
                    className="form-input"
                    style={{ width: '100%' }}
                    value={payForm.paid_at}
                    onChange={(e) => {
                      paidAtTouchedRef.current = true;
                      setPayForm((p) => ({ ...p, paid_at: e.target.value }));
                    }}
                    required
                  />
                  <FieldError id="student-pay-paid-at-error">{payFieldErrors.paid_at}</FieldError>
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
                      ...whenPaymentMethodChangesWithCapture(effectiveFinanceConfig, method),
                      ...(isCashPaymentMethod(method) && !p.cash_received
                        ? { cash_received: p.amount || '' }
                        : !isCashPaymentMethod(method)
                          ? { cash_received: '', formaTroco: 'pix', trocoAccount: '' }
                          : {}),
                    }));
                  }}
                >
                  {orderedActiveStorageDialectMethodsForModal(effectiveFinanceConfig).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <CaptureMethodSelect
                financeConfig={effectiveFinanceConfig}
                method={payForm.method}
                value={payForm.capture_method_id}
                id={STUDENT_PAY_FIELD_IDS.capture_method}
                style={{ ...inputStyle, width: '100%' }}
                disabled={saving}
                error={payFieldErrors?.capture_method_id}
                onChange={(captureId) =>
                  setPayForm((p) => ({
                    ...p,
                    ...whenCaptureMethodChanges(effectiveFinanceConfig, captureId, p.method),
                  }))
                }
              />

              {showPaidDate && isCashPaymentMethod(payForm.method) ? (
                <>
                  <CashTrocoFields
                    payForm={payForm}
                    setPayForm={setPayForm}
                    amountNum={amountNum}
                    academyId={academyId}
                    financeConfig={effectiveFinanceConfig}
                    disabled={saving}
                    inputClassName="form-input"
                    labelClassName="form-label"
                    cashReceivedId={STUDENT_PAY_FIELD_IDS.cash_received}
                    trocoAccountId={STUDENT_PAY_FIELD_IDS.trocoAccount}
                  />
                  <FieldError id="student-pay-cash-received-error">
                    {payFieldErrors.cash_received}
                  </FieldError>
                  <FieldError id="student-pay-troco-account-error">
                    {payFieldErrors.trocoAccount}
                  </FieldError>
                </>
              ) : null}

              <BankAccountSelect
                id={STUDENT_PAY_FIELD_IDS.account}
                academyId={academyId}
                financeConfig={effectiveFinanceConfig}
                value={payForm.account}
                onChange={(v) => setPayForm((p) => ({ ...p, account: v }))}
                label="Conta"
                required
                className="form-input"
                style={{ width: '100%' }}
              />
              <FieldError id="student-pay-account-error">{payFieldErrors.account}</FieldError>

              {showPlanFields ? (
                <div className="form-group">
                  <label className="form-label">Plano</label>
                  <PlanSelect
                    id="student-pay-plan"
                    financeConfig={effectiveFinanceConfig}
                    value={payForm.plan_name}
                    onChange={(v) => setPayForm((p) => ({ ...p, plan_name: v }))}
                    onPlanPick={(pl) => {
                      if (!pl) return;
                      const amtNum = resolveStudentPlanFinalPrice(
                        { ...student, plan: pl.name },
                        effectiveFinanceConfig
                      );
                      const amt = amtNum > 0 ? formatBRLFromCents(numberToCents(amtNum) ?? 0) : '';
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

    <ConfirmDialog
      open={showDiscardProductDialog}
      title="Descartar venda?"
      description="Os produtos no carrinho serão perdidos."
      confirmLabel="Descartar"
      confirmVariant="danger"
      onConfirm={() => {
        setShowDiscardProductDialog(false);
        handleClose();
      }}
      onClose={() => setShowDiscardProductDialog(false)}
    />
    </>
  );
}
