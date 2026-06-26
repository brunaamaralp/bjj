/**
 * Resolve códigos canônicos do espelho contábil (1.1.1, 6.2.1, …)
 * para contas reais do plano da academia (ex.: GBLP).
 */
import { findAccountByCode } from './financeAccountCategories.js';

export const CANONICAL_CASH_CODE = '1.1.1';

function normalizeLabel(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/**
 * @param {object[]} accounts
 * @param {string} label
 * @param {{ types?: string[] }} [options]
 * @returns {string|null}
 */
export function findAccountCodeByCategoryLabel(accounts, label, { types = ['despesa', 'custo', 'receita'] } = {}) {
  const needle = normalizeLabel(label);
  if (!needle) return null;

  const typeSet = new Set(types.map((t) => String(t).toLowerCase()));
  const candidates = (Array.isArray(accounts) ? accounts : []).filter((a) => {
    if (a?.isActive === false) return false;
    const t = String(a?.type || '').toLowerCase();
    return typeSet.has(t);
  });

  let bestCode = null;
  let bestScore = 0;

  for (const account of candidates) {
    const name = normalizeLabel(account.name);
    if (!name) continue;

    let score = 0;
    if (name === needle) score = 100;
    else if (name.includes(needle)) score = 80;
    else if (needle.includes(name)) score = 70;
    else {
      const words = needle.split(/\s+/).filter((w) => w.length > 3);
      if (words.some((w) => name.includes(w))) score = 50;
    }

    if (score > bestScore) {
      bestScore = score;
      bestCode = String(account.code || '').trim() || null;
    }
  }

  return bestScore >= 50 ? bestCode : null;
}

/**
 * Conta de caixa / banco para o lado monetário do lançamento.
 * @param {object[]} accounts
 * @returns {string|null}
 */
export function resolveCashAccountCode(accounts) {
  const list = Array.isArray(accounts) ? accounts : [];

  const ativoCash = list.find(
    (a) => a?.cash === true && String(a.type || '').toLowerCase() === 'ativo'
  );
  if (ativoCash?.code) return String(ativoCash.code).trim();

  const byName = list.find((a) => /caixa|banco|conta\s+corrente/i.test(String(a.name || '')));
  if (byName?.code) return String(byName.code).trim();

  const canonical = findAccountByCode(list, CANONICAL_CASH_CODE);
  if (canonical && String(canonical.type || '').toLowerCase() === 'ativo') {
    return CANONICAL_CASH_CODE;
  }

  const anyCash = list.find((a) => a?.cash === true);
  if (anyCash?.code) return String(anyCash.code).trim();

  return canonical?.code ? String(canonical.code).trim() : null;
}

/**
 * @param {object[]} accounts
 * @param {string} canonicalCode
 * @param {string} [categoryLabel]
 * @returns {string|null}
 */
export function resolveExpenseAccountCode(accounts, canonicalCode, categoryLabel) {
  const code = String(canonicalCode || '').trim();
  if (code && findAccountByCode(accounts, code)) return code;
  return findAccountCodeByCategoryLabel(accounts, categoryLabel, { types: ['despesa', 'custo'] });
}

/**
 * @param {object[]} accounts
 * @param {string} canonicalCode
 * @param {string} [categoryLabel]
 * @returns {string|null}
 */
export function resolveRevenueAccountCode(accounts, canonicalCode, categoryLabel) {
  const code = String(canonicalCode || '').trim();
  if (code && findAccountByCode(accounts, code)) return code;
  return findAccountCodeByCategoryLabel(accounts, categoryLabel, { types: ['receita'] });
}

/**
 * @param {object[]} accounts
 * @param {string} canonicalCode
 * @param {{ categoryLabel?: string, side?: 'cash' | 'expense' | 'revenue' | 'balance' }} [options]
 * @returns {string|null}
 */
export function resolveLedgerAccountCode(accounts, canonicalCode, options = {}) {
  const code = String(canonicalCode || '').trim();
  const { categoryLabel, side = 'balance' } = options;

  if (side === 'cash' || code === CANONICAL_CASH_CODE) {
    const existing = code ? findAccountByCode(accounts, code) : null;
    if (side === 'cash' || code === CANONICAL_CASH_CODE) {
      if (existing && String(existing.type || '').toLowerCase() === 'ativo') return code;
      const cash = resolveCashAccountCode(accounts);
      if (cash) return cash;
    }
    if (existing) return code;
  }

  if (code && findAccountByCode(accounts, code)) return code;

  if (side === 'expense') {
    return resolveExpenseAccountCode(accounts, code, categoryLabel);
  }
  if (side === 'revenue') {
    return resolveRevenueAccountCode(accounts, code, categoryLabel);
  }
  if (categoryLabel) {
    return (
      findAccountCodeByCategoryLabel(accounts, categoryLabel, { types: ['despesa', 'custo', 'receita', 'passivo', 'pl'] }) ||
      null
    );
  }

  return null;
}
