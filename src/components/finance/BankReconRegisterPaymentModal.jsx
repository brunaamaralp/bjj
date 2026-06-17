import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ModalShell from '../shared/ModalShell.jsx';
import FieldError from '../shared/FieldError.jsx';
import PaymentFormErrorBanner from '../shared/PaymentFormErrorBanner.jsx';
import BankAccountSelect from './BankAccountSelect.jsx';
import { buildBankReconPaymentHintPath } from '../../lib/bankReconPaymentHintLink.js';
import { registerBankReconPayment } from '../../lib/bankReconciliationApi.js';
import { resolveBankAccountForPayment } from '../../lib/bankAccounts.js';
import { accountWhenPaymentMethodChanges } from '../../lib/paymentMethodBankDefaults.js';
import {
  normalizeMensalidadesPaymentMethod,
  validateMensalidadesPaymentForm,
} from '../../lib/mensalidadesPaymentForm.js';
import { PAYMENT_CATEGORY } from '../../lib/studentPayments.js';
import { orderedActiveStorageDialectMethodsForModal } from '../../lib/paymentMethodSettings.js';

function fmtMonth(ym) {
  const p = String(ym || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(p)) return ym || '—';
  const [y, m] = p.split('-');
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${months[Number(m) - 1]}/${y}`;
}

export default function BankReconRegisterPaymentModal({
  open,
  hint,
  bankItem,
  statementId,
  academyId,
  financeConfig,
  busy = false,
  onClose,
  onSuccess,
}) {
  const [form, setForm] = useState({
    method: 'pix',
    account: '',
    paid_at: '',
    amount: '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const methodOptions = useMemo(
    () => orderedActiveStorageDialectMethodsForModal(financeConfig),
    [financeConfig]
  );

  useEffect(() => {
    if (!open || !hint) return;
    const paidAt = String(bankItem?.date || '').slice(0, 10);
    const amount = Number(hint.expected_amount ?? bankItem?.amount);
    const method = 'pix';
    setForm({
      method,
      account: accountWhenPaymentMethodChanges(financeConfig, method) || resolveBankAccountForPayment('', financeConfig),
      paid_at: paidAt,
      amount: Number.isFinite(amount) && amount > 0 ? String(amount).replace('.', ',') : '',
    });
    setErrors({});
    setFormError('');
  }, [open, hint, bankItem, financeConfig]);

  const studentStub = useMemo(
    () => ({
      id: hint?.lead_id,
      name: hint?.lead_name,
      plan: '',
    }),
    [hint]
  );

  const payForm = useMemo(
    () => ({
      payment_type: PAYMENT_CATEGORY.PLAN,
      method: form.method,
      account: form.account,
      paid_at: form.paid_at,
      amount: form.amount,
      status: 'paid',
      installments: 1,
    }),
    [form]
  );

  const fallbackPath = hint
    ? buildBankReconPaymentHintPath(hint, { reconStatementId: statementId })
    : null;

  const handleSubmit = async () => {
    if (!academyId || !hint || !bankItem?.id || saving) return;
    const { errors: nextErrors, amountNum, paymentAccount } = validateMensalidadesPaymentForm({
      payForm,
      financeConfig,
      student: studentStub,
    });
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setFormError('');
      return;
    }
    setErrors({});
    setFormError('');
    setSaving(true);
    try {
      const result = await registerBankReconPayment(academyId, {
        item_id: bankItem.id,
        payment_id: hint.payment_id || undefined,
        lead_id: hint.lead_id,
        reference_month: hint.reference_month,
        amount: amountNum,
        paid_at: String(form.paid_at).slice(0, 10),
        method: normalizeMensalidadesPaymentMethod(form.method),
        bank_account_id: paymentAccount,
      });
      onSuccess?.(result);
      onClose?.();
    } catch (e) {
      setFormError(String(e?.message || 'Não foi possível registrar o pagamento.'));
    } finally {
      setSaving(false);
    }
  };

  const isBusy = busy || saving;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Registrar mensalidade e conciliar"
      description="O pagamento será registrado e a linha do extrato vinculada automaticamente."
      footer={
        <>
          <button type="button" className="btn-outline" disabled={isBusy} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" disabled={isBusy} onClick={() => void handleSubmit()}>
            {isBusy ? 'Salvando…' : 'Registrar e conciliar'}
          </button>
        </>
      }
    >
      {hint ? (
        <>
          <dl className="bank-recon-register-dl mb-3">
            <div>
              <dt>Aluno</dt>
              <dd>{hint.lead_name}</dd>
            </div>
            <div>
              <dt>Referência</dt>
              <dd>{fmtMonth(hint.reference_month)}</dd>
            </div>
            <div>
              <dt>Linha do extrato</dt>
              <dd>{bankItem?.description || '—'}</dd>
            </div>
          </dl>

          <PaymentFormErrorBanner message={formError} className="mb-3" />

          <div className="form-group">
            <label htmlFor="bank-recon-reg-amount">Valor (R$)</label>
            <input
              id="bank-recon-reg-amount"
              className={`form-input${errors.amount ? ' form-input--error' : ''}`}
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              disabled={isBusy}
            />
            {errors.amount ? <FieldError message={errors.amount} /> : null}
          </div>

          <div className="form-group">
            <label htmlFor="bank-recon-reg-paid-at">Data do pagamento</label>
            <input
              id="bank-recon-reg-paid-at"
              type="date"
              className={`form-input${errors.paid_at ? ' form-input--error' : ''}`}
              value={form.paid_at}
              onChange={(e) => setForm((f) => ({ ...f, paid_at: e.target.value }))}
              disabled={isBusy}
            />
            {errors.paid_at ? <FieldError message={errors.paid_at} /> : null}
          </div>

          <div className="form-group">
            <label htmlFor="bank-recon-reg-method">Forma de pagamento</label>
            <select
              id="bank-recon-reg-method"
              className="form-input"
              value={form.method}
              disabled={isBusy}
              onChange={(e) => {
                const method = e.target.value;
                setForm((f) => ({
                  ...f,
                  method,
                  account: accountWhenPaymentMethodChanges(financeConfig, method) || f.account,
                }));
              }}
            >
              {methodOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="bank-recon-reg-account">Conta bancária</label>
            <BankAccountSelect
              id="bank-recon-reg-account"
              academyId={academyId}
              financeConfig={financeConfig}
              value={form.account}
              disabled={isBusy}
              onChange={(account) => setForm((f) => ({ ...f, account }))}
            />
            {errors.account ? <FieldError message={errors.account} /> : null}
          </div>

          {fallbackPath ? (
            <p className="text-xs text-muted mt-3 mb-0">
              Caso complexo (pacote, parcelas)?{' '}
              <Link to={fallbackPath} className="btn-text btn-sm p-0" onClick={onClose}>
                Abrir em Mensalidades
              </Link>
            </p>
          ) : null}
        </>
      ) : null}
    </ModalShell>
  );
}
