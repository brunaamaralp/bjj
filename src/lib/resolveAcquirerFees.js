/**
 * Resolve taxas da maquininha (acquirerFees) por conta bancária ou método.
 */
import {
  computeAcquirerFee,
  defaultAcquirerFees,
  forecastInflowAmountsFromFees,
  mirrorAmountsForPayment,
  normalizeAcquirerFees,
} from './acquirerFees.js';
import {
  filterBankAccountsWithBank,
  formatBankAccountLabel,
} from './bankAccounts.js';
import { resolveInitialBankAccountForPayment } from './paymentMethodBankDefaults.js';

/** @param {object|null|undefined} financeConfig */
export function findBankAccountByLabel(financeConfig, label) {
  const target = String(label || '').trim();
  if (!target) return null;
  const list = filterBankAccountsWithBank(financeConfig?.bankAccounts);
  return list.find((acc) => formatBankAccountLabel(acc) === target) || null;
}

/**
 * Taxas efetivas para um rótulo de conta.
 * @param {object|null|undefined} financeConfig
 * @param {string} [bankAccountLabel]
 */
export function resolveAcquirerFeesForAccount(financeConfig, bankAccountLabel = '') {
  const global = normalizeAcquirerFees(financeConfig?.acquirerFees || defaultAcquirerFees());
  const acc = findBankAccountByLabel(financeConfig, bankAccountLabel);
  if (!acc || acc.useDefaultAcquirerFees !== false) return global;
  return normalizeAcquirerFees(acc.acquirerFees || defaultAcquirerFees());
}

/**
 * @param {object|null|undefined} financeConfig
 * @param {string} method
 */
export function resolveAcquirerFeesForMethod(financeConfig, method) {
  const label = resolveInitialBankAccountForPayment(financeConfig, '', method);
  return resolveAcquirerFeesForAccount(financeConfig, label);
}

/**
 * Conta explícita ou conta padrão do método, depois fallback global.
 * @param {object|null|undefined} financeConfig
 * @param {{ bankAccount?: string, method?: string }} [opts]
 */
export function resolveAcquirerFeesForPayment(financeConfig, { bankAccount = '', method = '' } = {}) {
  const accountLabel = String(bankAccount || '').trim();
  if (accountLabel) return resolveAcquirerFeesForAccount(financeConfig, accountLabel);
  const methodKey = String(method || '').trim();
  if (methodKey) return resolveAcquirerFeesForMethod(financeConfig, methodKey);
  return normalizeAcquirerFees(financeConfig?.acquirerFees || defaultAcquirerFees());
}

export function computeAcquirerFeeForPayment({
  financeConfig,
  bankAccount = '',
  gross,
  planBase,
  method,
  installments = 1,
}) {
  const acquirerFees = resolveAcquirerFeesForPayment(financeConfig, { bankAccount, method });
  return computeAcquirerFee({
    gross,
    planBase,
    policy: financeConfig?.acquirerFeePolicy,
    method,
    installments,
    acquirerFees,
  });
}

export function mirrorAmountsForPaymentWithAccount({
  financeConfig,
  bankAccount = '',
  gross,
  planBase,
  policy,
  method,
  installments = 1,
}) {
  const acquirerFees = resolveAcquirerFeesForPayment(financeConfig, { bankAccount, method });
  return mirrorAmountsForPayment({
    gross,
    planBase,
    policy: policy ?? financeConfig?.acquirerFeePolicy,
    method,
    installments,
    acquirerFees,
  });
}

/** Previsão de entrada com resolução por conta ou método padrão. */
export function forecastInflowAmounts(
  gross,
  method,
  installments,
  financeConfig,
  planBase,
  bankAccount = ''
) {
  const acquirerFees = resolveAcquirerFeesForPayment(financeConfig, { bankAccount, method });
  return forecastInflowAmountsFromFees(
    gross,
    method,
    installments,
    acquirerFees,
    financeConfig?.acquirerFeePolicy,
    planBase
  );
}
