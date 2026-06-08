/**
 * Atribuição de conta bancária em lançamentos já liquidados (sem alterar valores).
 */
import {
  financeBankAccountFromDoc,
  financeCategoryLabelFromDoc,
  financeNoteForStorage,
  financeUserNoteFromStored,
  isExpenseType,
  txDirection,
} from './financeTxFields.js';

export function assignBankAccountEligibilityError(doc) {
  const st = String(doc?.status || '').toLowerCase();
  if (st === 'cancelled') return 'already_cancelled';
  if (st !== 'settled') return 'only_settled_can_assign_bank';
  return '';
}

/** Member pode atribuir conta em entradas; despesa exige gestor. */
export function canAssignBankAccountRole(doc, isAdmin) {
  if (isAdmin) return true;
  if (txDirection(doc) === 'out') return false;
  return !isExpenseType(doc?.type);
}

export function buildAssignBankAccountPatch(doc, bankAccountLabel) {
  const bank = String(bankAccountLabel || '').trim().slice(0, 128);
  const cat = financeCategoryLabelFromDoc(doc);
  const userNote = financeUserNoteFromStored(doc?.note);
  const patch = { bank_account: bank };
  const nextNote = financeNoteForStorage(cat, userNote, bank);
  if (nextNote !== String(doc?.note || '')) {
    patch.note = nextNote;
  }
  return patch;
}

export function currentBankAccountLabel(doc) {
  return financeBankAccountFromDoc(doc);
}
