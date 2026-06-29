import { canonicalPaymentMethodKey } from '../../src/lib/paymentMethods.js';
import {
  findCaptureMethodById,
  listActiveCaptureMethods,
  resolveBankAccountForCaptureMethod,
} from '../../src/lib/captureMethods.js';
import { resolveBankAccountForPayment } from '../../src/lib/bankAccounts.js';
import { resolveInitialBankAccountForPayment } from '../../src/lib/paymentMethodBankDefaults.js';
import { validateCardBrandForSubmit } from '../../src/lib/captureMethodPaymentForm.js';

const CARD_METHODS = new Set(['cartao_credito', 'cartao_debito']);

function clampInstallments(value) {
  return Math.min(12, Math.max(1, Math.trunc(Number(value) || 1)));
}

export function validateAndNormalizeSalePayment(financeConfig, payment) {
  const method = canonicalPaymentMethodKey(payment?.forma);
  const installments = method === 'cartao_credito' ? clampInstallments(payment?.installments) : 1;
  const normalized = {
    ...(payment && typeof payment === 'object' ? payment : {}),
    installments,
  };

  if (!CARD_METHODS.has(method)) {
    delete normalized.capture_method_id;
    return { ok: true, payment: normalized };
  }

  const activeCaptureMethods = listActiveCaptureMethods(financeConfig, method);
  let captureMethodId = String(payment?.capture_method_id || '').trim();
  let captureMethod = captureMethodId ? findCaptureMethodById(financeConfig, captureMethodId) : null;

  if (captureMethodId) {
    if (!captureMethod || captureMethod.active === false || captureMethod.paymentMethod !== method) {
      return {
        ok: false,
        error: 'invalid_capture_method',
        capture_method_id: captureMethodId,
      };
    }
  } else if (activeCaptureMethods.length === 1) {
    captureMethod = activeCaptureMethods[0];
    captureMethodId = captureMethod.id;
  } else if (activeCaptureMethods.length > 1) {
    return {
      ok: false,
      error: 'capture_method_required',
    };
  }

  if (method === 'cartao_credito' && captureMethod) {
    const maxInstallments = clampInstallments(captureMethod.maxInstallments || 12);
    if (installments > maxInstallments) {
      return {
        ok: false,
        error: 'installments_exceeds_capture_max',
        capture_method_id: captureMethodId,
        max_installments: maxInstallments,
      };
    }
  }

  if (captureMethodId) normalized.capture_method_id = captureMethodId;
  else delete normalized.capture_method_id;

  const feeReceiverId = String(
    payment?.fee_receiver_id || captureMethod?.feeReceiverId || ''
  ).trim();
  if (feeReceiverId) normalized.fee_receiver_id = feeReceiverId;
  else delete normalized.fee_receiver_id;

  const cardBrand = String(payment?.card_brand || '').trim();
  if (cardBrand) normalized.card_brand = cardBrand;
  else delete normalized.card_brand;

  const bankAccount = resolveBankAccountForCaptureMethod(financeConfig, captureMethodId);
  const brandErr = validateCardBrandForSubmit(financeConfig, {
    method,
    installments,
    captureMethodId,
    feeReceiverId,
    bankAccount,
    cardBrand: normalized.card_brand,
  });
  if (brandErr) {
    return { ok: false, error: 'card_brand_required', message: brandErr };
  }

  return { ok: true, payment: normalized };
}

export function validateAndNormalizeSalePayments(financeConfig, payments) {
  const out = [];
  for (const payment of Array.isArray(payments) ? payments : []) {
    const result = validateAndNormalizeSalePayment(financeConfig, payment);
    if (!result.ok) return result;
    out.push(result.payment);
  }
  return { ok: true, payments: out };
}

export function resolveSaleMirrorBankAccountForPayment(financeConfig, payment, explicitBankAccount = '') {
  const captureAccount = resolveBankAccountForCaptureMethod(financeConfig, payment?.capture_method_id);
  if (captureAccount) return captureAccount;

  const explicit = String(explicitBankAccount || '').trim();
  if (explicit) {
    const resolvedExplicit = resolveBankAccountForPayment(explicit, financeConfig);
    if (resolvedExplicit === explicit) return resolvedExplicit;
  }

  const methodDefault = resolveInitialBankAccountForPayment(financeConfig, '', payment?.forma || '');
  if (methodDefault) return methodDefault;

  return resolveBankAccountForPayment('', financeConfig);
}
