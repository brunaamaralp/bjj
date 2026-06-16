import { PAYMENT_METHODS, canonicalPaymentMethodKey } from './paymentMethods.js';
import {
  listBankAccountLabels,
  resolveDefaultBankAccountLabel,
  resolveBankAccountForPayment,
} from './bankAccounts.js';

/** @param {object|null|undefined} financeConfig */
export function readDefaultAccountByMethod(financeConfig) {
  const raw =
    financeConfig?.defaultAccountByMethod ||
    financeConfig?.methodBankDefaults ||
    {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return { ...raw };
}

/** Mantém só rótulos de contas cadastradas. */
export function normalizeDefaultAccountByMethodMap(raw, financeConfig) {
  const labels = new Set(listBankAccountLabels(financeConfig));
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const { value } of PAYMENT_METHODS) {
    const v = String(src[value] || '').trim();
    if (v && labels.has(v)) out[value] = v;
  }
  return out;
}

export function digestMethodBankDefaults(financeConfig) {
  return JSON.stringify(normalizeDefaultAccountByMethodMap(readDefaultAccountByMethod(financeConfig), financeConfig));
}

/**
 * Conta sugerida ao abrir pagamento (respeita mapa método→conta, depois preferências).
 * @param {object} financeConfig
 * @param {string} [preferredAccount]
 * @param {string} [method]
 */
export function resolveInitialBankAccountForPayment(
  financeConfig,
  preferredAccount = '',
  method = '',
) {
  const labels = listBankAccountLabels(financeConfig);
  if (!labels.length) return '';

  const methodKey = canonicalPaymentMethodKey(method);
  if (methodKey) {
    const byMethod = normalizeDefaultAccountByMethodMap(readDefaultAccountByMethod(financeConfig), financeConfig);
    const mapped = String(byMethod[methodKey] || '').trim();
    if (mapped) return mapped;
  }

  if (labels.length === 1) return labels[0];

  const defaultLabel = resolveDefaultBankAccountLabel(financeConfig);
  if (defaultLabel && labels.includes(defaultLabel)) return defaultLabel;

  return resolveBankAccountForPayment(preferredAccount, financeConfig);
}

/**
 * Conta ao trocar a forma de pagamento (ignora preferência do aluno).
 * @param {object} financeConfig
 * @param {string} method
 */
export function accountWhenPaymentMethodChanges(financeConfig, method) {
  const labels = listBankAccountLabels(financeConfig);
  if (!labels.length) return '';

  const methodKey = canonicalPaymentMethodKey(method);
  const byMethod = normalizeDefaultAccountByMethodMap(readDefaultAccountByMethod(financeConfig), financeConfig);
  const mapped = String(byMethod[methodKey] || '').trim();
  if (mapped) return mapped;

  if (labels.length === 1) return labels[0];

  const defaultLabel = resolveDefaultBankAccountLabel(financeConfig);
  if (defaultLabel && labels.includes(defaultLabel)) return defaultLabel;

  return labels[0] || '';
}

/** @deprecated Prefer import from paymentMethodBankDefaults; alias for callers legados. */
export { resolveInitialBankAccountForPayment as pickInitialBankAccountForPayment };
