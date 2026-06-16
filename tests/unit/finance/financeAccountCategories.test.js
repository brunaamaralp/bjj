import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  encodeAccountCategoryValue,
  parseAccountCategoryValue,
  findAccountByCode,
  accountCategoryLabel,
  accountCategoryDisplayLabel,
  accountCategoryDisplayTitle,
  accountToFinanceCategory,
  resolveAccountFinanceCategory,
  listSelectableAccounts,
  accountCodeDepth,
  mergeCategoryOptionGroups,
} from '../../../src/lib/financeAccountCategories.js';

describe('financeAccountCategories', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('BLOCO 1 — encode/parse', () => {
    it("encodeAccountCategoryValue('4.1.1') → 'acct:4.1.1'", () => {
      expect(encodeAccountCategoryValue('4.1.1')).toBe('acct:4.1.1');
    });

    it("encodeAccountCategoryValue('') → ''", () => {
      expect(encodeAccountCategoryValue('')).toBe('');
    });

    it("parseAccountCategoryValue('acct:4.1.1') → '4.1.1'", () => {
      expect(parseAccountCategoryValue('acct:4.1.1')).toBe('4.1.1');
    });

    it("parseAccountCategoryValue('Mensalidades') → null (sem prefixo)", () => {
      expect(parseAccountCategoryValue('Mensalidades')).toBeNull();
    });

    it("parseAccountCategoryValue('acct:') → null (código vazio)", () => {
      expect(parseAccountCategoryValue('acct:')).toBeNull();
    });
  });

  describe('BLOCO 2 — findAccountByCode / accountCategoryLabel', () => {
    const accounts = [{ code: '4.1.1', name: 'Receitas' }];

    it("findAccountByCode([{code:'4.1.1', name:'Receitas'}], '4.1.1') → retorna o objeto", () => {
      expect(findAccountByCode(accounts, '4.1.1')).toEqual(accounts[0]);
    });

    it("findAccountByCode([], '4.1.1') → null", () => {
      expect(findAccountByCode([], '4.1.1')).toBeNull();
    });

    it("accountCategoryLabel({code:'4.1.1', name:'Receitas'}) → '4.1.1 · Receitas'", () => {
      expect(accountCategoryLabel({ code: '4.1.1', name: 'Receitas' })).toBe('4.1.1 · Receitas');
    });

    it("accountCategoryLabel({code:'', name:'Receitas'}) → 'Receitas'", () => {
      expect(accountCategoryLabel({ code: '', name: 'Receitas' })).toBe('Receitas');
    });

    it('accountCategoryDisplayLabel mostra só nome', () => {
      expect(accountCategoryDisplayLabel({ code: '4.1.2', name: 'Marketing digital' })).toBe('Marketing digital');
    });

    it('accountCategoryDisplayTitle inclui código', () => {
      expect(accountCategoryDisplayTitle({ code: '4.1.2', name: 'Marketing digital' })).toBe(
        '4.1.2 · Marketing digital'
      );
    });
  });

  describe('BLOCO 3 — accountToFinanceCategory', () => {
    it("conta type='receita' → isRevenue=true, type='other'", () => {
      const cat = accountToFinanceCategory({
        code: '4.1.1',
        name: 'Receitas',
        type: 'receita',
        dreGrupo: 'Receita Bruta',
      });
      expect(cat.isRevenue).toBe(true);
      expect(cat.type).toBe('other');
    });

    it("conta type='custo' → type='stock_purchase'", () => {
      const cat = accountToFinanceCategory({
        code: '5.1.1',
        name: 'CMV',
        type: 'custo',
        dreGrupo: 'CMV/CPV',
      });
      expect(cat.type).toBe('stock_purchase');
    });

    it("conta type='despesa', dreGrupo='Resultado Financeiro' → type='expense_financial'", () => {
      const cat = accountToFinanceCategory({
        code: '7.1.1',
        name: 'Juros',
        type: 'despesa',
        dreGrupo: 'Resultado Financeiro',
      });
      expect(cat.type).toBe('expense_financial');
    });

    it("conta type='despesa', dreGrupo='Despesas Operacionais' → type='expense_operational'", () => {
      const cat = accountToFinanceCategory({
        code: '6.2.1',
        name: 'Despesas',
        type: 'despesa',
        dreGrupo: 'Despesas Operacionais',
      });
      expect(cat.type).toBe('expense_operational');
    });

    it('conta null → retorna null', () => {
      expect(accountToFinanceCategory(null)).toBeNull();
    });
  });

  describe('BLOCO 4 — listSelectableAccounts', () => {
    const accounts = [
      { code: '6.2.2', name: 'Marketing', type: 'despesa', dreGrupo: 'Despesas Operacionais', isActive: true },
      { code: '6.2.1', name: 'Salários', type: 'despesa', dreGrupo: 'Despesas Operacionais', isActive: true },
      { code: '4.1.1', name: 'Receitas', type: 'receita', dreGrupo: 'Receita Bruta', isActive: true },
      { code: '5.1.1', name: 'CMV', type: 'custo', dreGrupo: 'CMV/CPV', isActive: true },
      { code: '9.9.9', name: 'Inativa', type: 'despesa', isActive: false },
    ];

    it('filtra contas inativas (isActive=false)', () => {
      const out = listSelectableAccounts(accounts, 'out');
      expect(out.some((a) => a.code === '9.9.9')).toBe(false);
    });

    it("nature='out' → retorna só contas tipo custo/despesa", () => {
      const out = listSelectableAccounts(accounts, 'out');
      const types = new Set(out.map((a) => a.type));
      expect(types.has('receita')).toBe(false);
      expect(types.has('despesa') || types.has('custo')).toBe(true);
    });

    it("nature='in' → retorna só contas tipo receita", () => {
      const inflow = listSelectableAccounts(accounts, 'in');
      expect(inflow.every((a) => a.type === 'receita')).toBe(true);
    });

    it('ordena por code (localeCompare pt-BR)', () => {
      const out = listSelectableAccounts(accounts, 'out');
      const codes = out.map((a) => a.code);
      const sorted = [...codes].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      expect(codes).toEqual(sorted);
    });
  });

  describe('BLOCO 5 — accountCodeDepth / mergeCategoryOptionGroups', () => {
    it("'4' → 0", () => {
      expect(accountCodeDepth('4')).toBe(0);
    });

    it("'4.1' → 1", () => {
      expect(accountCodeDepth('4.1')).toBe(1);
    });

    it("'4.1.1' → 2", () => {
      expect(accountCodeDepth('4.1.1')).toBe(2);
    });

    it("'' → 0", () => {
      expect(accountCodeDepth('')).toBe(0);
    });

    it('mergeCategoryOptionGroups combina grupos fixos com grupos de contas', () => {
      const fixed = new Map([['Receita Bruta', [{ label: 'Mensalidades' }]]]);
      const accountGroups = new Map([
        ['Receita Bruta', [{ label: '4.1.1 · Receitas', value: 'acct:4.1.1' }]],
      ]);
      const merged = mergeCategoryOptionGroups(fixed, accountGroups);
      expect(merged.get('Receita Bruta (contas)')).toHaveLength(1);
      expect(merged.get('Receita Bruta')).toHaveLength(1);
    });

    it("resolveAccountFinanceCategory('acct:4.1.1', accounts) resolve conta", () => {
      const sample = [{ code: '4.1.1', name: 'Receitas', type: 'receita', dreGrupo: 'Receita Bruta' }];
      const cat = resolveAccountFinanceCategory('acct:4.1.1', sample);
      expect(cat?.accountCode).toBe('4.1.1');
    });
  });
});
