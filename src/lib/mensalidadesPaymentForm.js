import {
  isStorageCreditMethod,
  normalizeToStorageDialect,
  STORAGE_CREDIT_METHOD,
} from './paymentMethods.js';

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
