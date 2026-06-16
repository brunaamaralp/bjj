/**
 * Deduplicação de linhas bancárias entre extratos com período sobreposto.
 */
import { roundMoney } from '../money.js';

const TOLERANCE = 0.02;

export const DEDUP_SOURCE_STATUSES = new Set(['matched', 'ignored']);

export function amountsEqualRecon(a, b) {
  return Math.abs(roundMoney(a) - roundMoney(b)) < TOLERANCE;
}

export function normalizeBankForDedup(value) {
  return String(value || '').trim().toLowerCase();
}

/** Contas compatíveis para dedup (regra de ambiguidade da spec). */
export function bankAccountsCompatibleForDedup(newBank, existingBank) {
  const nb = normalizeBankForDedup(newBank);
  const eb = normalizeBankForDedup(existingBank);
  if (nb && eb && nb !== eb) return false;
  if (nb && !eb) return false;
  if (!nb && eb) return false;
  return true;
}

export function originalStatusEligibleForDedup(status) {
  return DEDUP_SOURCE_STATUSES.has(String(status || '').toLowerCase());
}

export function bankStatementItemFingerprint(item, statementBank = '') {
  const bank = normalizeBankForDedup(item.bank_account || item.bankAccount || statementBank);
  const amt = roundMoney(item.amount);
  const dir = String(item.direction || '').toLowerCase();
  const date = String(item.date || '').slice(0, 10);
  return `${date}|${dir}|${amt}|${bank}`;
}

export function itemsAreDuplicates(newItem, existingItem, { newStatementBank = '', existingStatementBank = '' } = {}) {
  if (String(newItem.date || '').slice(0, 10) !== String(existingItem.date || '').slice(0, 10)) {
    return false;
  }
  if (String(newItem.direction || '').toLowerCase() !== String(existingItem.direction || '').toLowerCase()) {
    return false;
  }
  if (!amountsEqualRecon(newItem.amount, existingItem.amount)) return false;

  const newBank = newItem.bank_account || newItem.bankAccount || newStatementBank;
  const existBank =
    existingItem.bank_account || existingItem.bankAccount || existingItem.statement_bank || existingStatementBank;
  return bankAccountsCompatibleForDedup(newBank, existBank);
}

/**
 * @param {Array<{ id: string, statement_id?: string, date: string, amount: number, direction: string, status: string, statement_bank?: string, bank_account?: string }>} existingRows
 */
export function buildDedupIndex(existingRows) {
  const index = new Map();
  for (const row of existingRows || []) {
    if (!originalStatusEligibleForDedup(row.status)) continue;
    const fp = bankStatementItemFingerprint(row, row.statement_bank || '');
    if (index.has(fp)) continue;
    index.set(fp, { itemId: row.id, statementId: row.statement_id || '' });
  }
  return index;
}

/**
 * @param {object} item — linha do novo extrato
 * @param {Map<string, { itemId: string, statementId: string }>} index
 * @param {{ newStatementBank?: string, existingItems?: Array }} [ctx]
 */
export function classifyImportItem(item, index, ctx = {}) {
  const { newStatementBank = '', existingItems = [] } = ctx;
  const fp = bankStatementItemFingerprint(item, newStatementBank);

  const hit = index.get(fp);
  if (hit) {
    return { status: 'duplicate', duplicate_of: hit.itemId };
  }

  for (const existing of existingItems) {
    if (!originalStatusEligibleForDedup(existing.status)) continue;
    if (
      itemsAreDuplicates(item, existing, {
        newStatementBank,
        existingStatementBank: existing.statement_bank || '',
      })
    ) {
      return { status: 'duplicate', duplicate_of: existing.id };
    }
  }

  return null;
}

export function statementPeriodsOverlap(periodStart, periodEnd, otherStart, otherEnd) {
  const ps = String(periodStart || '').slice(0, 10);
  const pe = String(periodEnd || '').slice(0, 10);
  const os = String(otherStart || '').slice(0, 10);
  const oe = String(otherEnd || '').slice(0, 10);
  if (!ps || !pe || !os || !oe) return false;
  return ps <= oe && pe >= os;
}
