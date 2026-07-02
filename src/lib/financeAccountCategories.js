/**
 * Categorias de lançamento vinculadas a contas do plano de contas (acct:CODE).
 */

import { PATRIMONIAL_FLOW_GROUP, UNCLASSIFIED_DRE_GROUP } from './financeCategories.js';

/** Label amigável no select (código só no title). */
export function accountCategoryDisplayLabel(account) {
  const name = String(account?.name || '').trim();
  const code = String(account?.code || '').trim();
  return name || code || '';
}

export function accountCategoryDisplayTitle(account) {
  const code = String(account?.code || '').trim();
  const name = String(account?.name || '').trim();
  if (!code) return name || '';
  return name ? `${code} · ${name}` : code;
}

export const ACCOUNT_CATEGORY_PREFIX = 'acct:';

const ACCOUNT_TYPE_LABELS = {
  receita: 'Receitas',
  custo: 'Custos',
  despesa: 'Despesas',
  passivo: 'Passivo',
  pl: 'Patrimônio Líquido',
};

const REVENUE_ACCOUNT_TYPES = new Set(['receita']);
const EXPENSE_ACCOUNT_TYPES = new Set(['custo', 'despesa']);
const BALANCE_SHEET_ACCOUNT_TYPES = new Set(['passivo', 'pl']);

export function encodeAccountCategoryValue(code) {
  const c = String(code || '').trim();
  return c ? `${ACCOUNT_CATEGORY_PREFIX}${c}` : '';
}

export function parseAccountCategoryValue(value) {
  const raw = String(value || '').trim();
  if (!raw.startsWith(ACCOUNT_CATEGORY_PREFIX)) return null;
  const code = raw.slice(ACCOUNT_CATEGORY_PREFIX.length).trim();
  return code || null;
}

export function findAccountByCode(accounts, code) {
  const target = String(code || '').trim();
  if (!target) return null;
  return (Array.isArray(accounts) ? accounts : []).find((a) => String(a.code || '').trim() === target) || null;
}

export function accountCategoryLabel(account) {
  const code = String(account?.code || '').trim();
  const name = String(account?.name || '').trim();
  if (!code) return name || '';
  return name ? `${code} · ${name}` : code;
}

function accountTypeToTxType(accountType, dreGrupo, nature = 'in') {
  if (accountType === 'receita') return 'other';
  if (accountType === 'passivo' || accountType === 'pl') {
    return nature === 'out' ? 'balance_sheet_out' : 'balance_sheet_in';
  }
  if (accountType === 'custo') return 'stock_purchase';
  if (accountType === 'despesa') {
    return String(dreGrupo || '').trim() === 'Resultado Financeiro'
      ? 'expense_financial'
      : 'expense_operational';
  }
  return 'expense_operational';
}

export function accountToFinanceCategory(account, nature = 'in') {
  if (!account) return null;
  const code = String(account.code || '').trim();
  if (!code) return null;
  const accountType = String(account.type || '').trim().toLowerCase();
  const dreGroup = String(account.dreGrupo || '').trim() || UNCLASSIFIED_DRE_GROUP;
  const isBalanceSheet = BALANCE_SHEET_ACCOUNT_TYPES.has(accountType);
  const operationalBucket = isBalanceSheet ? 'financing' : 'operational';
  return {
    label: accountCategoryLabel(account),
    type: accountTypeToTxType(accountType, dreGroup, nature),
    dreGroup: isBalanceSheet ? '' : dreGroup,
    dreAccount: code,
    accountCode: code,
    isAccountCategory: true,
    isRevenue: REVENUE_ACCOUNT_TYPES.has(accountType),
    isBalanceSheetCategory: isBalanceSheet,
    operationalBucket,
  };
}

export function resolveAccountFinanceCategory(value, accounts, nature = 'in') {
  const code = parseAccountCategoryValue(value);
  if (!code) return null;
  const account = findAccountByCode(accounts, code);
  return account ? accountToFinanceCategory(account, nature) : null;
}

export function listSelectableAccounts(accounts, nature) {
  const list = Array.isArray(accounts) ? accounts : [];
  const wantRevenue = nature !== 'out';
  return list
    .filter((a) => a.isActive !== false)
    .filter((a) => {
      const t = String(a.type || '').trim().toLowerCase();
      return wantRevenue ? REVENUE_ACCOUNT_TYPES.has(t) : EXPENSE_ACCOUNT_TYPES.has(t);
    })
    .sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''), 'pt-BR'));
}

export function listBalanceSheetAccounts(accounts) {
  return (Array.isArray(accounts) ? accounts : [])
    .filter((a) => a.isActive !== false)
    .filter((a) => BALANCE_SHEET_ACCOUNT_TYPES.has(String(a.type || '').trim().toLowerCase()))
    .sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''), 'pt-BR'));
}

export function getAccountCategoryOptionsByNature(accounts, nature) {
  const map = new Map();
  for (const account of listSelectableAccounts(accounts, nature)) {
    const dre = String(account.dreGrupo || '').trim();
    const type = String(account.type || '').trim().toLowerCase();
    const group = dre || ACCOUNT_TYPE_LABELS[type] || 'Plano de contas';
    if (!map.has(group)) map.set(group, []);
    const cat = accountToFinanceCategory(account, nature);
    map.get(group).push({
      label: accountCategoryDisplayLabel(account),
      title: accountCategoryDisplayTitle(account),
      value: encodeAccountCategoryValue(account.code),
      type: cat.type,
      dreGroup: cat.dreGroup,
      dreAccount: cat.dreAccount,
      accountCode: cat.accountCode,
      isAccountCategory: true,
      isRevenue: cat.isRevenue,
      isBalanceSheetCategory: cat.isBalanceSheetCategory,
      operationalBucket: cat.operationalBucket,
    });
  }
  return map;
}

export function getBalanceSheetCategoryOptionsByNature(accounts, nature) {
  const map = new Map();
  const items = [];
  for (const account of listBalanceSheetAccounts(accounts)) {
    const cat = accountToFinanceCategory(account, nature);
    items.push({
      label: accountCategoryDisplayLabel(account),
      title: accountCategoryDisplayTitle(account),
      value: encodeAccountCategoryValue(account.code),
      type: cat.type,
      dreGroup: cat.dreGroup,
      dreAccount: cat.dreAccount,
      accountCode: cat.accountCode,
      isAccountCategory: true,
      isRevenue: false,
      isBalanceSheetCategory: true,
      operationalBucket: 'financing',
    });
  }
  if (items.length) map.set(PATRIMONIAL_FLOW_GROUP, items);
  return map;
}

export function mergeCategoryOptionGroups(fixedGroups, accountGroups) {
  const merged = new Map(fixedGroups);
  for (const [group, items] of accountGroups) {
    if (!items.length) continue;
    if (group === PATRIMONIAL_FLOW_GROUP && merged.has(group)) {
      merged.set(group, [...(merged.get(group) || []), ...items]);
      continue;
    }
    const key = merged.has(group) ? `${group} (contas)` : group;
    merged.set(key, [...(merged.get(key) || []), ...items]);
  }
  return merged;
}

/** Profundidade hierárquica pelo código (ex.: 4.1.2 → 2). */
export function accountCodeDepth(code) {
  const trimmed = String(code || '').trim();
  if (!trimmed) return 0;
  return (trimmed.match(/\./g) || []).length;
}
