/**
 * Helpers de formulário para meio de captura (Recebido via).
 */
import { canonicalPaymentMethodKey } from './paymentMethods.js';
import {
  countActiveCaptureMethods,
  listActiveCaptureMethods,
  resolveBankAccountForCaptureMethod,
} from './captureMethods.js';
import { accountWhenPaymentMethodChanges } from './paymentMethodBankDefaults.js';

const CARD_METHODS = new Set(['cartao_credito', 'cartao_debito']);

export function isCardPaymentMethod(method) {
  return CARD_METHODS.has(canonicalPaymentMethodKey(method));
}

export function needsCaptureMethodSelect(financeConfig, method) {
  if (!isCardPaymentMethod(method)) return false;
  return countActiveCaptureMethods(financeConfig, method) > 1;
}

export function singleActiveCaptureMethod(financeConfig, method) {
  const list = listActiveCaptureMethods(financeConfig, method);
  return list.length === 1 ? list[0] : null;
}

export function resolveCaptureFieldsForPayment(financeConfig, method, captureMethodId = '') {
  if (!isCardPaymentMethod(method)) {
    return { capture_method_id: '', capture_method_name: '' };
  }
  const single = singleActiveCaptureMethod(financeConfig, method);
  const id = String(captureMethodId || single?.id || '').trim();
  const cap = id
    ? listActiveCaptureMethods(financeConfig, method).find((c) => c.id === id)
    : single;
  return {
    capture_method_id: id,
    capture_method_name: cap?.name || '',
  };
}

export function whenPaymentMethodChangesWithCapture(financeConfig, method) {
  const { capture_method_id, capture_method_name } = resolveCaptureFieldsForPayment(
    financeConfig,
    method
  );
  const capAccount = resolveBankAccountForCaptureMethod(financeConfig, capture_method_id);
  const account = capAccount || accountWhenPaymentMethodChanges(financeConfig, method) || '';
  return { capture_method_id, capture_method_name, account };
}

export function whenCaptureMethodChanges(financeConfig, captureMethodId, method) {
  const id = String(captureMethodId || '').trim();
  const cap = listActiveCaptureMethods(financeConfig, method).find((c) => c.id === id);
  const capAccount = resolveBankAccountForCaptureMethod(financeConfig, id);
  return {
    capture_method_id: id,
    capture_method_name: cap?.name || '',
    ...(capAccount ? { account: capAccount } : {}),
  };
}

export function validateCaptureMethodForSubmit(financeConfig, method, captureMethodId) {
  if (!isCardPaymentMethod(method)) return null;
  const count = countActiveCaptureMethods(financeConfig, method);
  if (count <= 1) return null;
  if (!String(captureMethodId || '').trim()) {
    return 'Selecione por qual meio o pagamento foi recebido.';
  }
  return null;
}
