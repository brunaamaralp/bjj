import { describe, expect, it } from 'vitest';
import {
  accountToFinanceCategory,
  encodeAccountCategoryValue,
  getAccountCategoryOptionsByNature,
  resolveAccountFinanceCategory,
} from '../lib/financeAccountCategories.js';
import { getCategoryOptionsByNature, resolveFinanceCategory } from '../lib/financeCategories.js';

const sampleAccounts = [
  { code: '4.1.1', name: 'Receita de Vendas', type: 'receita', dreGrupo: 'Receita Bruta', isActive: true },
  { code: '6.2.2', name: 'Marketing digital', type: 'despesa', dreGrupo: 'Despesas Operacionais', isActive: true },
  { code: '1.1.1', name: 'Caixa', type: 'ativo', isActive: true },
];

describe('financeAccountCategories', () => {
  it('encodes and resolves account categories', () => {
    const value = encodeAccountCategoryValue('6.2.2');
    expect(value).toBe('acct:6.2.2');
    const cat = resolveAccountFinanceCategory(value, sampleAccounts);
    expect(cat?.accountCode).toBe('6.2.2');
    expect(cat?.isAccountCategory).toBe(true);
    expect(cat?.type).toBe('expense_operational');
  });

  it('lists receita accounts for entrada and despesa/custo for saída', () => {
    const revenue = getAccountCategoryOptionsByNature(sampleAccounts, 'in');
    const expense = getAccountCategoryOptionsByNature(sampleAccounts, 'out');
    expect([...revenue.values()].flat().some((c) => c.accountCode === '4.1.1')).toBe(true);
    expect([...revenue.values()].flat().some((c) => c.accountCode === '6.2.2')).toBe(false);
    expect([...expense.values()].flat().some((c) => c.accountCode === '6.2.2')).toBe(true);
  });

  it('merges chart accounts into category options', () => {
    const groups = getCategoryOptionsByNature('out', sampleAccounts);
    const all = [...groups.values()].flat();
    expect(all.some((c) => c.value === 'acct:6.2.2')).toBe(true);
    expect(resolveFinanceCategory('acct:6.2.2', sampleAccounts)?.label).toContain('Marketing digital');
  });

  it('maps receita accounts as revenue ledger categories', () => {
    const cat = accountToFinanceCategory(sampleAccounts[0]);
    expect(cat.isRevenue).toBe(true);
    expect(cat.accountCode).toBe('4.1.1');
  });
});
