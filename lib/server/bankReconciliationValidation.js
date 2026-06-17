/**
 * Validação de FINANCIAL_TX para conciliação bancária (multi-tenant + integridade).
 */
import {
  mapFinanceTxDoc,
  txDirection,
  financeCategoryLabelFromDoc,
  financeBankAccountFromDoc,
  financeUserNoteFromStored,
  financeNoteForStorage,
} from './financeTxFields.js';
import { bankAccountMatchLevel } from './bankReconciliationMatcher.js';
import { roundMoney } from '../money.js';

export const RECON_AMOUNT_TOLERANCE = 0.02;
/** Mesma tolerância percentual usada pelo matcher para sugestões (score 50). */
export const RECON_AMOUNT_PERCENT_TOLERANCE = 0.05;

export function roundReconMoney(n) {
  return roundMoney(Math.abs(Number(n) || 0));
}

export function amountsReconcileEqual(a, b) {
  return Math.abs(roundReconMoney(a) - roundReconMoney(b)) < RECON_AMOUNT_TOLERANCE;
}

export function amountsReconcileWithinPercent(a, b, pct = RECON_AMOUNT_PERCENT_TOLERANCE) {
  const base = roundReconMoney(a);
  const other = roundReconMoney(b);
  if (base < 0.01) return false;
  return Math.abs(base - other) / base <= pct;
}

export function bankItemDirectionMatchesTx(item, txOrDoc) {
  const naviDir = txDirection(txOrDoc);
  const bankDir = String(item?.direction || '').toLowerCase() === 'credit' ? 'in' : 'out';
  return naviDir === bankDir;
}

export function bankItemAmountMatchesTx(item, txOrDoc) {
  const itemAmt = roundReconMoney(item?.amount);
  const gross = roundReconMoney(txOrDoc?.gross);
  const net = roundReconMoney(Math.abs(Number(txOrDoc?.net) || gross));
  return (
    amountsReconcileEqual(itemAmt, gross)
    || amountsReconcileEqual(itemAmt, net)
    || amountsReconcileWithinPercent(itemAmt, gross)
    || amountsReconcileWithinPercent(itemAmt, net)
  );
}

/**
 * @param {object} txDoc — documento FINANCIAL_TX (Appwrite)
 * @param {object} opts
 * @param {string} opts.academyId
 * @param {{ amount?: number, direction?: string }|null} [opts.item]
 * @param {boolean} [opts.allowAlreadyReconciled]
 * @param {boolean} [opts.skipAmountCheck] — conciliação manual com justificativa
 */
export function validateTxForBankReconciliation(
  txDoc,
  { academyId, item = null, allowAlreadyReconciled = false, skipAmountCheck = false } = {}
) {
  if (!txDoc) return { ok: false, error: 'tx_not_found' };
  if (String(txDoc.academyId || '') !== String(academyId || '')) {
    return { ok: false, error: 'forbidden' };
  }

  const st = String(txDoc.status || '').toLowerCase();
  if (st !== 'settled') return { ok: false, error: 'tx_not_settled' };
  if (txDoc.reconciled === true && !allowAlreadyReconciled) {
    return { ok: false, error: 'tx_already_reconciled' };
  }

  if (item && !skipAmountCheck) {
    if (!bankItemDirectionMatchesTx(item, txDoc)) {
      return { ok: false, error: 'direction_mismatch' };
    }
    if (!bankItemAmountMatchesTx(item, txDoc)) {
      return { ok: false, error: 'amount_mismatch' };
    }
    const itemBank = String(item.bank_account || item.bankAccount || '').trim();
    if (itemBank) {
      const txBank = financeBankAccountFromDoc(txDoc);
      if (bankAccountMatchLevel(itemBank, txBank) === 'mismatch') {
        return { ok: false, error: 'bank_account_mismatch' };
      }
    }
  }

  return { ok: true, mapped: mapFinanceTxDoc(txDoc) };
}

export async function fetchAndValidateTxForReconciliation(
  databases,
  dbId,
  financialTxCol,
  txId,
  options
) {
  if (!financialTxCol || !txId) return { ok: false, error: 'tx_not_found' };
  try {
    const doc = await databases.getDocument(dbId, financialTxCol, String(txId));
    const result = validateTxForBankReconciliation(doc, options);
    return { ...result, doc };
  } catch {
    return { ok: false, error: 'tx_not_found' };
  }
}

/** Preserva @cat: e @bank: ao anexar justificativa de conciliação manual. */
export function reconciliationNoteWithJustification(prevDoc, justification) {
  const text = String(justification || '').trim().slice(0, 500);
  if (!text) return null;
  const cat = financeCategoryLabelFromDoc(prevDoc);
  const bank = financeBankAccountFromDoc(prevDoc);
  const userNote = financeUserNoteFromStored(prevDoc?.note);
  const body = userNote ? `${userNote}\n${text}` : text;
  return financeNoteForStorage(cat, body, bank);
}
