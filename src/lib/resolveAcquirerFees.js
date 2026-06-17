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
import {
  captureMethodFeesToAcquirerFees,
  computeAcquirerFeeFromCaptureRow,
  findCaptureMethodById,
  resolveCaptureInstallmentFee,
} from './captureMethods.js';

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
 * Taxas do meio de captura; fallback conta do meio → global.
 * @param {object|null|undefined} financeConfig
 * @param {string} [captureMethodId]
 */
export function resolveAcquirerFeesForCaptureMethod(financeConfig, captureMethodId = '') {
  const cap = findCaptureMethodById(financeConfig, captureMethodId);
  if (!cap || cap.useDefaultFees !== false) {
    const label = cap?.bankAccountLabel || '';
    if (label) return resolveAcquirerFeesForAccount(financeConfig, label);
    return resolveAcquirerFeesForMethod(financeConfig, cap?.paymentMethod || '');
  }
  return captureMethodFeesToAcquirerFees(cap, cap.fees);
}

/**
 * Conta explícita ou conta padrão do método, depois fallback global.
 * Precedência: capture_method_id → conta → global.
 * @param {object|null|undefined} financeConfig
 * @param {{ bankAccount?: string, method?: string, captureMethodId?: string }} [opts]
 */
export function resolveAcquirerFeesForPayment(
  financeConfig,
  { bankAccount = '', method = '', captureMethodId = '' } = {}
) {
  const capId = String(captureMethodId || '').trim();
  if (capId) return resolveAcquirerFeesForCaptureMethod(financeConfig, capId);

  const accountLabel = String(bankAccount || '').trim();
  if (accountLabel) return resolveAcquirerFeesForAccount(financeConfig, accountLabel);
  const methodKey = String(method || '').trim();
  if (methodKey) return resolveAcquirerFeesForMethod(financeConfig, methodKey);
  return normalizeAcquirerFees(financeConfig?.acquirerFees || defaultAcquirerFees());
}

export function computeAcquirerFeeForPayment({
  financeConfig,
  bankAccount = '',
  captureMethodId = '',
  gross,
  planBase,
  method,
  installments = 1,
}) {
  const capId = String(captureMethodId || '').trim();
  const cap = capId ? findCaptureMethodById(financeConfig, capId) : null;
  if (cap && cap.useDefaultFees === false) {
    const row = resolveCaptureInstallmentFee(cap, installments);
    return computeAcquirerFeeFromCaptureRow({
      gross,
      planBase,
      policy: financeConfig?.acquirerFeePolicy,
      row,
    });
  }

  const acquirerFees = resolveAcquirerFeesForPayment(financeConfig, {
    bankAccount,
    method,
    captureMethodId: capId,
  });
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
  captureMethodId = '',
  gross,
  planBase,
  policy,
  method,
  installments = 1,
}) {
  return computeAcquirerFeeForPayment({
    financeConfig,
    bankAccount,
    captureMethodId,
    gross,
    planBase,
    method,
    installments,
    policy,
  });
}

/** Previsão de entrada com resolução por conta ou método padrão. */
export function forecastInflowAmounts(
  gross,
  method,
  installments,
  financeConfig,
  planBase,
  bankAccount = '',
  captureMethodId = ''
) {
  const acquirerFees = resolveAcquirerFeesForPayment(financeConfig, {
    bankAccount,
    method,
    captureMethodId,
  });
  return forecastInflowAmountsFromFees(
    gross,
    method,
    installments,
    acquirerFees,
    financeConfig?.acquirerFeePolicy,
    planBase
  );
}
