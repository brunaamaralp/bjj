import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolveFinanceCategory,
  normalizeFinanceCategory,
  dreGroupForCategory,
  defaultCategoryForTxType,
  defaultCategoryKeyForTxType,
  isFinancialCategory,
  categoryIsUnclassified,
  getCategoriesByGroup,
  getExpenseCategories,
  getRevenueCategories,
  isKnownDreGroup,
  buildDreDisplayRows,
  UNCLASSIFIED_DRE_GROUP,
  defaultCategoryForDirection,
  getCategoryOptionsByNature,
  EXPENSE_CATEGORY_GROUP_ORDER,
  operationalBucketForTx,
  isOperationalInflowTx,
} from '../../../src/lib/financeCategories.js';

describe('financeCategories', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('BLOCO 1 — resolveFinanceCategory', () => {
    it("chave exata 'MENSALIDADE' → retorna objeto com label 'Mensalidades'", () => {
      const cat = resolveFinanceCategory('MENSALIDADE');
      expect(cat).not.toBeNull();
      expect(cat.label).toBe('Mensalidades');
    });

    it("label exato 'Mensalidades' → retorna o mesmo objeto", () => {
      const byKey = resolveFinanceCategory('MENSALIDADE');
      const byLabel = resolveFinanceCategory('Mensalidades');
      expect(byLabel).toEqual(byKey);
    });

    it("label case insensitive 'mensalidades' → resolve", () => {
      const cat = resolveFinanceCategory('mensalidades');
      expect(cat?.label).toBe('Mensalidades');
    });

    it("chave com espaços 'OUTRAS DESPESAS' (formato alternativo) → resolve", () => {
      const cat = resolveFinanceCategory('OUTRAS DESPESAS');
      expect(cat?.label).toBe('Outras despesas');
    });

    it("valor desconhecido 'Xyz123' → retorna null", () => {
      expect(resolveFinanceCategory('Xyz123')).toBeNull();
    });

    it('valor vazio/null → retorna null', () => {
      expect(resolveFinanceCategory('')).toBeNull();
      expect(resolveFinanceCategory(null)).toBeNull();
    });
  });

  describe('BLOCO 2 — normalizeFinanceCategory', () => {
    it("'MENSALIDADE' → 'Mensalidades'", () => {
      expect(normalizeFinanceCategory('MENSALIDADE')).toBe('Mensalidades');
    });

    it("label já correto 'Salários e encargos' → retorna igual", () => {
      expect(normalizeFinanceCategory('Salários e encargos')).toBe('Salários e encargos');
    });

    it("desconhecido não vazio → preserva o valor trimado (sem categoria conhecida)", () => {
      expect(normalizeFinanceCategory('Xyz123')).toBe('Xyz123');
    });

    it("vazio → retorna 'Outras despesas'", () => {
      expect(normalizeFinanceCategory('')).toBe('Outras despesas');
    });
  });

  describe('BLOCO 3 — dreGroupForCategory', () => {
    it("'Mensalidades' → 'Receita Bruta'", () => {
      expect(dreGroupForCategory('Mensalidades')).toBe('Receita Bruta');
    });

    it("'Salários e encargos' → 'Despesas Operacionais'", () => {
      expect(dreGroupForCategory('Salários e encargos')).toBe('Despesas Operacionais');
    });

    it("'Taxas de cartão' → 'Resultado Financeiro'", () => {
      expect(dreGroupForCategory('Taxas de cartão')).toBe('Resultado Financeiro');
    });

    it('desconhecido → UNCLASSIFIED_DRE_GROUP', () => {
      expect(dreGroupForCategory('Xyz123')).toBe(UNCLASSIFIED_DRE_GROUP);
    });
  });

  describe('BLOCO 4 — defaultCategoryForTxType', () => {
    it("'plan' → 'Mensalidades'", () => {
      expect(defaultCategoryForTxType('plan')).toBe('Mensalidades');
    });

    it("'product' → 'Vendas de produtos'", () => {
      expect(defaultCategoryForTxType('product')).toBe('Vendas de produtos');
    });

    it("'expense' → 'Outras despesas'", () => {
      expect(defaultCategoryForTxType('expense')).toBe('Outras despesas');
    });

    it("'refund' → 'Cancelamentos'", () => {
      expect(defaultCategoryForTxType('refund')).toBe('Cancelamentos');
    });

    it("'card_fee' → 'Taxas de cartão'", () => {
      expect(defaultCategoryForTxType('card_fee')).toBe('Taxas de cartão');
    });

    it("tipo desconhecido → 'Outras receitas'", () => {
      expect(defaultCategoryForTxType('xyz')).toBe('Outras receitas');
    });

    it("defaultCategoryKeyForTxType('plan') → 'MENSALIDADE'", () => {
      expect(defaultCategoryKeyForTxType('plan')).toBe('MENSALIDADE');
    });
  });

  describe('BLOCO 5 — isFinancialCategory / categoryIsUnclassified', () => {
    it("'Taxas de cartão' → isFinancialCategory true", () => {
      expect(isFinancialCategory('Taxas de cartão')).toBe(true);
    });

    it("'Mensalidades' → isFinancialCategory false", () => {
      expect(isFinancialCategory('Mensalidades')).toBe(false);
    });

    it("'AlgumaCoisa' (desconhecida, não vazia) → categoryIsUnclassified true", () => {
      expect(categoryIsUnclassified('AlgumaCoisa')).toBe(true);
    });

    it("'Mensalidades' → categoryIsUnclassified false", () => {
      expect(categoryIsUnclassified('Mensalidades')).toBe(false);
    });

    it("'' → categoryIsUnclassified false", () => {
      expect(categoryIsUnclassified('')).toBe(false);
    });
  });

  describe('BLOCO 6 — getCategoriesByGroup / getExpenseCategories / getRevenueCategories', () => {
    it("getCategoriesByGroup('Receita Bruta') → array não vazio, todos com dreGroup='Receita Bruta'", () => {
      const group = getCategoriesByGroup('Receita Bruta');
      expect(group.length).toBeGreaterThan(0);
      expect(group.every((c) => c.dreGroup === 'Receita Bruta')).toBe(true);
    });

    it('getExpenseCategories() → types expense_operational, expense_financial ou stock_purchase', () => {
      const allowed = new Set(['expense_operational', 'expense_financial', 'stock_purchase']);
      const items = getExpenseCategories();
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((c) => allowed.has(c.type))).toBe(true);
    });

    it("getRevenueCategories() → types plan, product, enrollment, rental ou other", () => {
      const allowed = new Set(['plan', 'product', 'enrollment', 'rental', 'other']);
      const items = getRevenueCategories();
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((c) => allowed.has(c.type))).toBe(true);
    });

    it("isKnownDreGroup('Receita Bruta') → true", () => {
      expect(isKnownDreGroup('Receita Bruta')).toBe(true);
    });

    it('isKnownDreGroup desconhecido → false', () => {
      expect(isKnownDreGroup('Grupo Inexistente')).toBe(false);
    });
  });

  describe('BLOCO 7 — buildDreDisplayRows', () => {
    const dreData = {
      'Receita Bruta': 10000,
      'Despesas Operacionais': 3000,
      [UNCLASSIFIED_DRE_GROUP]: 500,
    };

    it('retorna array com grupos corretos', () => {
      const rows = buildDreDisplayRows(dreData);
      expect(Array.isArray(rows)).toBe(true);
      const groups = rows.map((r) => r.group);
      expect(groups).toContain('Receita Bruta');
      expect(groups).toContain('Despesas Operacionais');
    });

    it("grupo 'Despesas Operacionais' tem value negativo (-3000)", () => {
      const row = buildDreDisplayRows(dreData).find((r) => r.group === 'Despesas Operacionais');
      expect(row?.value).toBe(-3000);
    });

    it("grupo 'Receita Bruta' tem value positivo (10000)", () => {
      const row = buildDreDisplayRows(dreData).find((r) => r.group === 'Receita Bruta');
      expect(row?.value).toBe(10000);
    });

    it('grupos subtotal (Receita Líquida etc.) aparecem com isTotal=true', () => {
      const rows = buildDreDisplayRows(dreData);
      const receitaLiquida = rows.find((r) => r.group === 'Receita Líquida');
      const lucroBruto = rows.find((r) => r.group === 'Lucro Bruto');
      expect(receitaLiquida?.isTotal).toBe(true);
      expect(lucroBruto?.isTotal).toBe(true);
    });

    it('grupo UNCLASSIFIED com valor > 0 → warn=true', () => {
      const row = buildDreDisplayRows(dreData).find((r) => r.group === UNCLASSIFIED_DRE_GROUP);
      expect(row?.warn).toBe(true);
      expect(row?.unclassified).toBe(true);
    });
  });

  describe('BLOCO 8 — plano de contas / categorias no lançamento', () => {
    it('defaultCategoryForDirection out → Outras despesas', () => {
      expect(defaultCategoryForDirection('out').label).toBe('Outras despesas');
    });

    it('defaultCategoryForDirection in → Mensalidades', () => {
      expect(defaultCategoryForDirection('in').label).toBe('Mensalidades');
    });

    it('getCategoryOptionsByNature oculta conta 4.1.1 duplicando Mensalidades', () => {
      const accounts = [
        { code: '4.1.1', name: 'Receita de Vendas', type: 'receita', dreGrupo: 'Receita Bruta', isActive: true },
        { code: '4.1.2', name: 'Mensalidades premium', type: 'receita', dreGrupo: 'Receita Bruta', isActive: true },
      ];
      const groups = getCategoryOptionsByNature('in', accounts);
      const flat = [...groups.values()].flat();
      const values = flat.map((c) => c.value || c.label);
      expect(values).toContain('Mensalidades');
      expect(values).not.toContain('acct:4.1.1');
      expect(values).toContain('acct:4.1.2');
    });

    it('getCategoryOptionsByNature entrada inclui fluxo patrimonial', () => {
      const groups = getCategoryOptionsByNature('in', []);
      const flat = [...groups.values()].flat().map((c) => c.label);
      expect(flat).toContain('Aporte de capital');
      expect(flat).toContain('Receitas financeiras');
      expect(flat).toContain('Empréstimo recebido');
    });

    it('operationalBucketForTx exclui aporte do operacional', () => {
      const doc = { type: 'equity_injection', category: 'Aporte de capital', status: 'settled', gross: 50000 };
      expect(operationalBucketForTx(doc)).toBe('financing');
      expect(isOperationalInflowTx(doc)).toBe(false);
    });

    it('getCategoryOptionsByNature saída ordena Despesas Operacionais antes de CMV/CPV', () => {
      const groups = getCategoryOptionsByNature('out', []);
      const keys = [...groups.keys()];
      const opIdx = keys.indexOf('Despesas Operacionais');
      const cmvIdx = keys.indexOf('CMV/CPV');
      expect(opIdx).toBeGreaterThanOrEqual(0);
      expect(cmvIdx).toBeGreaterThanOrEqual(0);
      expect(opIdx).toBeLessThan(cmvIdx);
      expect(EXPENSE_CATEGORY_GROUP_ORDER[0]).toBe('Despesas Operacionais');
    });
  });
});
