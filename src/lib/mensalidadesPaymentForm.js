/** Dialect gravado pelo modal de Mensalidades para cartão de crédito. */
export const MENSALIDADES_CREDIT_METHOD = 'cartão_crédito';

/**
 * Parcelas enviadas na API: 1–12 só para crédito; demais métodos = 1.
 * @param {string|null|undefined} method
 * @param {number|string|null|undefined} installments
 */
export function normalizeMensalidadesInstallments(method, installments) {
  if (String(method || '').trim() !== MENSALIDADES_CREDIT_METHOD) return 1;
  return Math.min(12, Math.max(1, Number(installments) || 1));
}

export function isMensalidadesCreditMethod(method) {
  return String(method || '').trim() === MENSALIDADES_CREDIT_METHOD;
}
