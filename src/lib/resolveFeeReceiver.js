/**
 * Resolve recebedor e taxas por bandeira.
 */
import {
  computeAcquirerFee,
  defaultAcquirerFees,
  forecastInflowAmountsFromFees,
  normalizeAcquirerFees,
  resolveMdrGross,
} from './acquirerFees.js';
import { findCaptureMethodById } from './captureMethods.js';
import { canonicalPaymentMethodKey } from './paymentMethods.js';
import { readPaymentMethodSettings } from './paymentMethodSettings.js';
import {
  feeReceiverTableToLegacyAcquirerFees,
  findFeeReceiverById,
  hasBrandFeeDivergence,
  pickFeeRow,
  readFeeReceivers,
} from './feeReceivers.js';
import { migrateFinanceConfigToFeeReceivers } from './migrateFeeReceivers.js';
import { findBankAccountByLabel } from './resolveAcquirerFees.js';

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function ensureMigrated(financeConfig) {
  if (!financeConfig || typeof financeConfig !== 'object') return financeConfig;
  if (readFeeReceivers(financeConfig).length > 0) return financeConfig;
  return migrateFinanceConfigToFeeReceivers(financeConfig);
}

export function resolveEffectiveFeeReceiver(financeConfig, receiver) {
  if (!receiver) return null;
  if (!receiver.useDefaultFees) return receiver;
  const cfg = ensureMigrated(financeConfig);
  const defaultId = String(cfg.defaultFeeReceiverId || '').trim();
  return findFeeReceiverById(cfg, defaultId);
}

/**
 * Precedência: feeReceiverId → captureMethod.feeReceiverId → bankAccount.feeReceiverId
 * → paymentMethodSettings[method].defaultFeeReceiverId → defaultFeeReceiverId
 */
export function resolveFeeReceiverForPayment(
  financeConfig,
  {
    feeReceiverId = '',
    captureMethodId = '',
    bankAccount = '',
    method = '',
  } = {}
) {
  const cfg = ensureMigrated(financeConfig);
  const explicit = String(feeReceiverId || '').trim();
  if (explicit) {
    return resolveEffectiveFeeReceiver(cfg, findFeeReceiverById(cfg, explicit));
  }

  const capId = String(captureMethodId || '').trim();
  if (capId) {
    const cap = findCaptureMethodById(cfg, capId);
    const capRecvId = String(cap?.feeReceiverId || '').trim();
    if (capRecvId) {
      return resolveEffectiveFeeReceiver(cfg, findFeeReceiverById(cfg, capRecvId));
    }
  }

  const accountLabel = String(bankAccount || '').trim();
  if (accountLabel) {
    const acc = findBankAccountByLabel(cfg, accountLabel);
    const accRecvId = String(acc?.feeReceiverId || '').trim();
    if (accRecvId) {
      return resolveEffectiveFeeReceiver(cfg, findFeeReceiverById(cfg, accRecvId));
    }
  }

  const methodKey = canonicalPaymentMethodKey(method);
  if (methodKey) {
    const settings = readPaymentMethodSettings(cfg)[methodKey];
    const methodRecvId = String(settings?.defaultFeeReceiverId || '').trim();
    if (methodRecvId) {
      return resolveEffectiveFeeReceiver(cfg, findFeeReceiverById(cfg, methodRecvId));
    }
  }

  const defaultId = String(cfg.defaultFeeReceiverId || '').trim();
  if (defaultId) {
    return resolveEffectiveFeeReceiver(cfg, findFeeReceiverById(cfg, defaultId));
  }

  return null;
}

export function requiresCardBrandForPayment(
  financeConfig,
  { feeReceiverId = '', captureMethodId = '', bankAccount = '', method = '', installments = 1 } = {}
) {
  const receiver = resolveFeeReceiverForPayment(financeConfig, {
    feeReceiverId,
    captureMethodId,
    bankAccount,
    method,
  });
  if (!receiver) return false;
  return hasBrandFeeDivergence(receiver, method, installments);
}

export function resolveLegacyAcquirerFeesForPayment(
  financeConfig,
  { cardBrand = '', method = '', installments = 1, ...opts } = {}
) {
  const receiver = resolveFeeReceiverForPayment(financeConfig, { method, ...opts });
  if (!receiver?.fees) {
    return normalizeAcquirerFees(financeConfig?.acquirerFees || defaultAcquirerFees());
  }
  return feeReceiverTableToLegacyAcquirerFees(receiver.fees, method, installments, cardBrand);
}

export function computeFeeFromRow({ gross, planBase, policy, row }) {
  const g = roundMoney(gross);
  if (g < 0.01) return { gross: 0, fee: 0, net: 0 };
  const pct = Number(row?.percent) || 0;
  const fixed = Number(row?.fixed) || 0;
  if (!(pct > 0) && !(fixed > 0)) return { gross: g, fee: 0, net: g };
  const mdrGross = resolveMdrGross({ gross: g, planBase, policy });
  const fee = roundMoney(mdrGross * (pct / 100) + fixed);
  const net = roundMoney(Math.max(0, g - fee));
  return { gross: g, fee, net };
}

export function computeFeeReceiverFeeForPayment({
  financeConfig,
  feeReceiverId = '',
  bankAccount = '',
  captureMethodId = '',
  gross,
  planBase,
  policy,
  method,
  installments = 1,
  cardBrand = '',
}) {
  const receiver = resolveFeeReceiverForPayment(financeConfig, {
    feeReceiverId,
    bankAccount,
    captureMethodId,
    method,
  });
  if (!receiver?.fees) {
    const acquirerFees = normalizeAcquirerFees(financeConfig?.acquirerFees || defaultAcquirerFees());
    return computeAcquirerFee({
      gross,
      planBase,
      policy,
      method,
      installments,
      acquirerFees,
    });
  }
  const row = pickFeeRow(receiver.fees, method, installments, cardBrand);
  return computeFeeFromRow({
    gross,
    planBase,
    policy: policy ?? financeConfig?.acquirerFeePolicy,
    row,
  });
}

export function forecastInflowAmountsWithReceiver(
  gross,
  method,
  installments,
  financeConfig,
  planBase,
  opts = {}
) {
  const acquirerFees = resolveLegacyAcquirerFeesForPayment(financeConfig, {
    method,
    installments,
    cardBrand: opts.cardBrand || '',
    ...opts,
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
