import { parseCurrencyBRL } from './masks.js';
import {
  isStorageCreditMethod,
  normalizeToStorageDialect,
  STORAGE_CREDIT_METHOD,
} from './paymentMethods.js';
import { PAYMENT_CATEGORY, normalizePaymentCategory } from './studentPayments.js';
import { validateBankAccountForPayment, hasConfiguredBankAccounts } from './bankAccounts.js';
import {
  computeTrocoFromPayForm,
  isCashPaymentMethod,
  parseCashReceivedAmount,
  defaultTrocoAccount,
} from './studentPaymentTroco.js';
import { validateCaptureMethodForSubmit } from './captureMethodPaymentForm.js';

// Backwards-compatible re-export:
// `MensalidadesPanel.jsx` (and older code) expects this symbol from this module.
export { isStorageCreditMethod };

/** @deprecated Use STORAGE_CREDIT_METHOD from paymentMethods.js */
export const MENSALIDADES_CREDIT_METHOD = STORAGE_CREDIT_METHOD;

/**
 * Parcelas enviadas na API: 1–12 só para crédito; demais métodos = 1.
 * @param {string|null|undefined} method
 * @param {number|string|null|undefined} installments
 */
export function normalizeMensalidadesInstallments(method, installments) {
  if (!isStorageCreditMethod(method)) return 1;
  return Math.min(12, Math.max(1, Number(installments) || 1));
}

export function isMensalidadesCreditMethod(method) {
  return isStorageCreditMethod(method);
}

/** Garante dialect de storage ao salvar pagamento de mensalidade. */
export function normalizeMensalidadesPaymentMethod(method) {
  return normalizeToStorageDialect(method, 'pix');
}

export const MENSALIDADES_PAY_FIELD_IDS = {
  bundle_start_month: 'mensal-bundle-start-month',
  amount: 'mensal-pay-amount',
  paid_at: 'mensal-pay-paid-at',
  due_day: 'mensal-pay-due-day',
  cash_received: 'mensal-pay-cash-received',
  trocoAccount: 'mensal-pay-troco-account',
  account: 'mensal-pay-account',
  capture_method_id: 'mensal-pay-capture-method',
};

const MENSALIDADES_ERROR_FOCUS_ORDER = [
  'bundle_start_month',
  'amount',
  'paid_at',
  'due_day',
  'cash_received',
  'trocoAccount',
  'account',
  'capture_method_id',
];

/** Valor informado no formulário — sem ajuste automático pelo preço do plano. */
export function resolveMensalidadesPaymentAmount(payForm) {
  return parseCurrencyBRL(payForm?.amount);
}

/**
 * Validação do modal de pagamento em Mensalidades (espelha regras do submit).
 * @returns {{ errors: Record<string, string>, amountNum: number, paymentAccount: string }}
 */
export function validateMensalidadesPaymentForm({
  payForm,
  financeConfig,
  student,
  existingPayment = null,
}) {
  const errors = {};
  const isBundle = payForm?.payment_type === PAYMENT_CATEGORY.BUNDLE;

  if (isBundle) {
    const coverageStart = String(payForm?.bundle_start_month || '').trim();
    if (!/^\d{4}-\d{2}$/.test(coverageStart)) {
      errors.bundle_start_month = 'Informe o início da cobertura.';
    }
  }

  const amountNum = resolveMensalidadesPaymentAmount(
    payForm,
    student,
    financeConfig,
    existingPayment
  );
  if (!Number.isFinite(amountNum) || amountNum < 0) {
    errors.amount = 'Informe um valor igual ou maior que zero.';
  }

  const paidAtMs = new Date(String(payForm?.paid_at || '').trim()).getTime();
  if (String(payForm?.status || '').toLowerCase() !== 'pending') {
    if (!Number.isFinite(paidAtMs)) {
      errors.paid_at = 'Informe uma data de pagamento válida.';
    }
  }

  if (!isBundle && String(payForm?.due_day || '').trim()) {
    const dueDayNum = Number(String(payForm.due_day || '').replace(/[^\d]/g, ''));
    if (!Number.isFinite(dueDayNum) || dueDayNum < 1 || dueDayNum > 31) {
      errors.due_day = 'Informe um dia de vencimento entre 1 e 31.';
    }
  }

  if (isCashPaymentMethod(payForm?.method) && Number.isFinite(amountNum) && amountNum > 0) {
    const received = parseCashReceivedAmount(payForm);
    if (received != null && received + 0.004 < amountNum) {
      errors.cash_received = 'Valor recebido em dinheiro é menor que o valor da mensalidade.';
    }
    const troco = computeTrocoFromPayForm(payForm, amountNum);
    if (troco > 0 && hasConfiguredBankAccounts(financeConfig)) {
      const trocoAccount = String(
        payForm?.trocoAccount || payForm?.troco_account || defaultTrocoAccount(payForm, financeConfig)
      ).trim();
      const trocoCheck = validateBankAccountForPayment(trocoAccount, financeConfig);
      if (!trocoCheck.ok) {
        errors.trocoAccount =
          trocoCheck.message || 'Selecione a conta de onde saiu o troco.';
      }
    }
  }

  const accountCheck = validateBankAccountForPayment(payForm?.account, financeConfig);
  if (!accountCheck.ok) {
    errors.account = accountCheck.message;
  }

  const captureErr = validateCaptureMethodForSubmit(
    financeConfig,
    payForm?.method,
    payForm?.capture_method_id
  );
  if (captureErr) errors.capture_method_id = captureErr;

  return {
    errors,
    amountNum,
    paymentAccount: accountCheck.ok ? accountCheck.account || payForm?.account || '' : '',
  };
}

export function focusFirstMensalidadesPaymentError(errors, fieldIds = MENSALIDADES_PAY_FIELD_IDS) {
  if (!errors || typeof document === 'undefined') return;
  for (const key of MENSALIDADES_ERROR_FOCUS_ORDER) {
    if (!errors[key]) continue;
    const id = fieldIds[key];
    const el = id ? document.getElementById(id) : null;
    if (el && typeof el.focus === 'function') {
      el.focus();
      return;
    }
  }
}

export const STUDENT_PAY_FIELD_IDS = {
  note: 'student-pay-note',
  bundle_start_month: 'student-pay-bundle-start',
  amount: 'student-pay-amount',
  paid_at: 'student-pay-paid-at',
  cash_received: 'student-pay-cash-received',
  trocoAccount: 'student-pay-troco-account',
  account: 'student-pay-account',
  capture_method: 'student-pay-capture-method',
};

const STUDENT_PAY_ERROR_FOCUS_ORDER = [
  'note',
  'bundle_start_month',
  'amount',
  'paid_at',
  'cash_received',
  'trocoAccount',
  'account',
  'capture_method_id',
];

export function focusFirstStudentPaymentError(errors) {
  if (!errors || typeof document === 'undefined') return;
  for (const key of STUDENT_PAY_ERROR_FOCUS_ORDER) {
    if (!errors[key]) continue;
    const id = STUDENT_PAY_FIELD_IDS[key];
    const el = id ? document.getElementById(id) : null;
    if (el && typeof el.focus === 'function') {
      el.focus();
      return;
    }
  }
}
