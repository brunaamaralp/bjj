/**
 * Regras de elegibilidade para antecipação (cliente + servidor).
 */
import { isAcquirerFeeEligibleMethod } from './acquirerFees.js';
import { canonicalPaymentMethodKey } from './paymentMethods.js';
import { txDirection } from './financeTxDisplay.js';

export function canRegisterAnticipation(tx, { hasChild = false } = {}) {
  if (!tx) return false;
  if (String(tx.status || '').toLowerCase() !== 'settled') return false;
  if (txDirection(tx) !== 'in') return false;
  const originType = String(tx.origin_type || '').toLowerCase();
  if (originType === 'anticipation_fee' || originType === 'reversal') return false;
  if (!isAcquirerFeeEligibleMethod(canonicalPaymentMethodKey(tx.method))) return false;
  if (hasChild) return false;
  return true;
}
