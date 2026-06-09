import { parseMaskToCents, centsToNumber } from './moneyBr.js';
import {
  hasConfiguredBankAccounts,
  validateBankAccountForPayment,
} from './bankAccounts.js';
import { accountWhenPaymentMethodChanges } from './paymentMethodBankDefaults.js';

export function isCashPaymentMethod(method) {
  return String(method || '').trim().toLowerCase() === 'dinheiro';
}

export function parseCashReceivedAmount(payForm) {
  const raw = payForm?.cash_received ?? payForm?.cashReceived ?? '';
  if (raw === '' || raw == null) return null;
  const cents = parseMaskToCents(raw);
  if (cents == null) return null;
  return centsToNumber(cents);
}

/** Troco em reais (recebido − valor da mensalidade). */
export function computeTrocoFromPayForm(payForm, amountNum) {
  if (!isCashPaymentMethod(payForm?.method)) return 0;
  const amount = Number(amountNum);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const received = parseCashReceivedAmount(payForm);
  if (received == null) return 0;
  return Math.max(0, Math.round((received - amount) * 100) / 100);
}

export function defaultTrocoAccount(payForm, financeConfig) {
  const formaTroco = String(payForm?.formaTroco || payForm?.forma_troco || 'pix').trim() || 'pix';
  const fromMethod = accountWhenPaymentMethodChanges(financeConfig, formaTroco);
  if (fromMethod) return fromMethod;
  return String(payForm?.trocoAccount || payForm?.troco_account || payForm?.account || '').trim();
}

export function validateStudentPaymentTroco(payForm, amountNum, financeConfig = null) {
  if (!isCashPaymentMethod(payForm?.method)) return { ok: true };
  const amount = Number(amountNum);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: true };
  const received = parseCashReceivedAmount(payForm);
  if (received == null) return { ok: true };
  if (received + 0.004 < amount) {
    return { ok: false, message: 'Valor recebido em dinheiro é menor que o valor da mensalidade.' };
  }

  const troco = computeTrocoFromPayForm(payForm, amount);
  if (troco > 0 && hasConfiguredBankAccounts(financeConfig)) {
    const trocoAccount = String(
      payForm?.trocoAccount || payForm?.troco_account || defaultTrocoAccount(payForm, financeConfig)
    ).trim();
    const accountCheck = validateBankAccountForPayment(trocoAccount, financeConfig);
    if (!accountCheck.ok) {
      return {
        ok: false,
        message: accountCheck.message || 'Selecione a conta de onde saiu o troco.',
      };
    }
  }

  return { ok: true };
}

export function trocoFieldsForPaymentPayload(payForm, amountNum, financeConfig = null) {
  const troco = computeTrocoFromPayForm(payForm, amountNum);
  if (troco <= 0) return {};
  const formaTroco = String(payForm?.formaTroco || payForm?.forma_troco || 'pix').trim() || 'pix';
  const trocoAccountRaw = String(
    payForm?.trocoAccount || payForm?.troco_account || defaultTrocoAccount(payForm, financeConfig)
  ).trim();
  const accountCheck = validateBankAccountForPayment(trocoAccountRaw, financeConfig);
  const trocoAccount = accountCheck.ok ? accountCheck.account || trocoAccountRaw : trocoAccountRaw;

  return {
    troco,
    forma_troco: formaTroco,
    ...(trocoAccount ? { troco_account: trocoAccount } : {}),
  };
}
