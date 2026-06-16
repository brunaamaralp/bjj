import { PAYMENT_METHODS, paymentMethodLabel, canonicalPaymentMethodKey, storageDialectMethodLabel } from './paymentMethods.js';

/** Labels de exibição para `method` (snake_case ou variantes legadas). */
const PAYMENT_METHOD_LABELS = Object.fromEntries(PAYMENT_METHODS.map((o) => [o.value, o.label]));
Object.assign(PAYMENT_METHOD_LABELS, {
  link_pagamento: 'Link de pagamento',
  boleto: 'Boleto',
});

const CREDIT_METHOD_KEYS = new Set(['cartao_credito', 'credito_parcelado']);

/**
 * @param {string|null|undefined} method
 * @param {number|null|undefined} [installments]
 */
export function formatPaymentMethod(method, installments) {
  const raw = String(method || '').trim();
  if (!raw) return '—';
  const canonical = canonicalPaymentMethodKey(raw);
  const base = paymentMethodLabel(canonical) || PAYMENT_METHOD_LABELS[canonical] || storageDialectMethodLabel(raw) || raw;
  const inst = Number(installments);
  if (inst > 1 && (CREDIT_METHOD_KEYS.has(canonical) || /cr[eé]dito/i.test(base))) {
    return `${base} ${inst}x`;
  }
  return base;
}
