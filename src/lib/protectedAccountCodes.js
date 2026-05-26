import { FINANCE_CATEGORIES } from './financeCategories.js';
import { ACCOUNT_MAP } from '../components/finance/montarLancamento.js';

/** Códigos usados pelo espelho contábil automático (categorias + montarLancamento). */
function collectProtectedAccountCodes() {
  const codes = new Set();
  for (const entry of Object.values(FINANCE_CATEGORIES)) {
    const dreAccount = String(entry?.dreAccount || '').trim();
    if (dreAccount) codes.add(dreAccount);
  }
  for (const route of Object.values(ACCOUNT_MAP)) {
    if (!route || typeof route !== 'object') continue;
    for (const key of ['debit', 'credit']) {
      const c = String(route[key] || '').trim();
      if (c) codes.add(c);
    }
  }
  return codes;
}

export const PROTECTED_CODES = collectProtectedAccountCodes();

export function isProtectedAccountCode(code) {
  return PROTECTED_CODES.has(String(code || '').trim());
}

export const PROTECTED_CODE_EDIT_WARNING =
  'Código do sistema (espelho automático). Evite alterar para não quebrar lançamentos.';

export const PROTECTED_CODE_DELETE_MESSAGE =
  'Esta conta é usada pelo sistema para lançamentos automáticos e não pode ser excluída.';
