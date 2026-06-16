/**
 * Categorias fixas de FINANCIAL_TX — fonte de verdade para type, DRE e contas.
 * Campo `category` na transação armazena o label (ex.: "Mensalidades")
 * ou valor `acct:CODE` para contas do plano de contas.
 */

import {
  getAccountCategoryOptionsByNature,
  mergeCategoryOptionGroups,
  resolveAccountFinanceCategory,
} from './financeAccountCategories.js';

export const UNCLASSIFIED_DRE_GROUP = 'Não classificado';

export const FINANCE_CATEGORIES = {
  MENSALIDADE: {
    label: 'Mensalidades',
    type: 'plan',
    dreGroup: 'Receita Bruta',
    dreAccount: '4.1.1',
  },
  VENDA_PRODUTO: {
    label: 'Vendas de produtos',
    type: 'product',
    dreGroup: 'Receita Bruta',
    dreAccount: '4.1.1',
  },
  MATRICULA: {
    label: 'Matrículas',
    type: 'enrollment',
    dreGroup: 'Receita Bruta',
    dreAccount: '4.1.1',
  },
  ALUGUEL_RECEITA: {
    label: 'Aluguéis recebidos',
    type: 'plan',
    dreGroup: 'Receita Bruta',
    dreAccount: '4.1.1',
  },
  OUTROS_RECEITA: {
    label: 'Outras receitas',
    type: 'other',
    dreGroup: 'Receita Bruta',
    dreAccount: '4.1.1',
  },
  CANCELAMENTO: {
    label: 'Cancelamentos',
    type: 'refund',
    dreGroup: 'Deduções',
    dreAccount: '4.9.1',
  },
  DESCONTO: {
    label: 'Descontos concedidos',
    type: 'refund',
    dreGroup: 'Deduções',
    dreAccount: '4.9.1',
  },
  CUSTO_ESTOQUE: {
    label: 'Custo de estoque',
    type: 'stock_purchase',
    dreGroup: 'CMV/CPV',
    dreAccount: '5.1.1',
  },
  CUSTO_SERVICO: {
    label: 'Custo do serviço',
    type: 'stock_purchase',
    dreGroup: 'CMV/CPV',
    dreAccount: '5.1.1',
  },
  ALUGUEL_ESPACO: {
    label: 'Aluguel do espaço',
    type: 'expense_operational',
    dreGroup: 'Despesas Operacionais',
    dreAccount: '6.2.1',
  },
  SALARIOS: {
    label: 'Salários e encargos',
    type: 'expense_operational',
    dreGroup: 'Despesas Operacionais',
    dreAccount: '6.2.1',
  },
  MARKETING: {
    label: 'Marketing',
    type: 'expense_operational',
    dreGroup: 'Despesas Operacionais',
    dreAccount: '6.2.1',
  },
  SISTEMAS: {
    label: 'Sistemas / Software',
    type: 'expense_operational',
    dreGroup: 'Despesas Operacionais',
    dreAccount: '6.2.1',
  },
  MANUTENCAO: {
    label: 'Manutenção',
    type: 'expense_operational',
    dreGroup: 'Despesas Operacionais',
    dreAccount: '6.2.1',
  },
  OUTRAS_DESPESAS: {
    label: 'Outras despesas',
    type: 'expense_operational',
    dreGroup: 'Despesas Operacionais',
    dreAccount: '6.2.1',
  },
  TARIFAS_BANCARIAS: {
    label: 'Tarifas bancárias',
    type: 'expense_financial',
    dreGroup: 'Resultado Financeiro',
    dreAccount: '7.1.1',
  },
  JUROS: {
    label: 'Juros',
    type: 'expense_financial',
    dreGroup: 'Resultado Financeiro',
    dreAccount: '7.1.1',
  },
  TAXA_CARTAO: {
    label: 'Taxas de cartão',
    type: 'card_fee',
    dreGroup: 'Resultado Financeiro',
    dreAccount: '7.1.1',
  },
};

const BY_KEY = FINANCE_CATEGORIES;
const BY_LABEL = new Map(
  Object.values(FINANCE_CATEGORIES).map((c) => [c.label.trim().toLowerCase(), c])
);
const BY_TYPE_DEFAULT = new Map(
  Object.values(FINANCE_CATEGORIES).map((c) => [c.type, c])
);

/** Ordem de exibição na DRE (inclui subtotais calculados no store). */
export const DRE_DISPLAY_GROUPS = [
  'Receita Bruta',
  'Deduções',
  'Receita Líquida',
  'CMV/CPV',
  'Lucro Bruto',
  'Despesas Operacionais',
  'Resultado Operacional',
  'Depreciação/Amortização',
  'EBITDA',
  'Resultado Financeiro',
  UNCLASSIFIED_DRE_GROUP,
  'Imposto s/ Lucro',
  'Resultado Líquido',
];

export const KNOWN_DRE_GROUPS = [
  ...new Set(Object.values(FINANCE_CATEGORIES).map((c) => c.dreGroup)),
  'Depreciação/Amortização',
  'Imposto s/ Lucro',
];

/** Códigos de conta usados por categorias fixas — ocultos no select de lançamento. */
export const CATEGORY_SELECT_HIDDEN_ACCOUNT_CODES = new Set(
  Object.values(FINANCE_CATEGORIES)
    .map((c) => String(c.dreAccount || '').trim())
    .filter(Boolean)
);

function filterAccountsForCategorySelect(accounts) {
  return (Array.isArray(accounts) ? accounts : []).filter((a) => {
    if (a.isActive === false) return false;
    const code = String(a.code || '').trim();
    return code && !CATEGORY_SELECT_HIDDEN_ACCOUNT_CODES.has(code);
  });
}

export function isKnownDreGroup(group) {
  const g = String(group || '').trim();
  return KNOWN_DRE_GROUPS.includes(g);
}

export function getCategoriesByGroup(group) {
  return Object.values(FINANCE_CATEGORIES).filter((c) => c.dreGroup === group);
}

const EXPENSE_TYPES_MANUAL = new Set(['expense_operational', 'expense_financial', 'stock_purchase']);

/** Ordem de exibição no select de saída (operacional antes de CMV). */
export const EXPENSE_CATEGORY_GROUP_ORDER = [
  'Despesas Operacionais',
  'Resultado Financeiro',
  'CMV/CPV',
];

export function getExpenseCategories() {
  return Object.values(FINANCE_CATEGORIES).filter((c) => EXPENSE_TYPES_MANUAL.has(c.type));
}

/** Chips e default ao trocar direção no modal de lançamento. */
export const FREQUENT_TX_CATEGORY_LABELS = {
  in: [
    FINANCE_CATEGORIES.MENSALIDADE.label,
    FINANCE_CATEGORIES.VENDA_PRODUTO.label,
    FINANCE_CATEGORIES.OUTROS_RECEITA.label,
  ],
  out: [
    FINANCE_CATEGORIES.OUTRAS_DESPESAS.label,
    FINANCE_CATEGORIES.MARKETING.label,
    FINANCE_CATEGORIES.SALARIOS.label,
  ],
};

export function defaultCategoryForDirection(direction) {
  return direction === 'out'
    ? FINANCE_CATEGORIES.OUTRAS_DESPESAS
    : FINANCE_CATEGORIES.MENSALIDADE;
}

function sortCategoryGroupMap(map, nature) {
  if (nature !== 'out') return map;
  const order = EXPENSE_CATEGORY_GROUP_ORDER;
  const sorted = new Map();
  for (const key of order) {
    if (map.has(key)) sorted.set(key, map.get(key));
  }
  for (const [key, val] of map) {
    if (!sorted.has(key)) sorted.set(key, val);
  }
  return sorted;
}

const REVENUE_TYPES = new Set(['plan', 'product', 'enrollment', 'other']);

export function getRevenueCategories() {
  return Object.values(FINANCE_CATEGORIES).filter((c) => REVENUE_TYPES.has(c.type));
}

/** Agrupa categorias por dreGroup para optgroup no select. */
export function getCategoryOptionsByNature(nature, accounts = null) {
  const list = nature === 'out' ? getExpenseCategories() : getRevenueCategories();
  const map = new Map();
  for (const c of list) {
    if (!map.has(c.dreGroup)) map.set(c.dreGroup, []);
    map.get(c.dreGroup).push(c);
  }
  let merged = map;
  if (accounts?.length) {
    const filtered = filterAccountsForCategorySelect(accounts);
    if (filtered.length) {
      merged = mergeCategoryOptionGroups(map, getAccountCategoryOptionsByNature(filtered, nature));
    }
  }
  return sortCategoryGroupMap(merged, nature);
}

export function findCategoryKey(entry) {
  if (!entry) return null;
  for (const [key, cat] of Object.entries(BY_KEY)) {
    if (cat === entry) return key;
  }
  return null;
}

/**
 * Resolve categoria por chave (MENSALIDADE), label, acct:CODE ou type legado.
 * @returns {typeof FINANCE_CATEGORIES.MENSALIDADE | null}
 */
export function resolveFinanceCategory(value, accounts = null) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (BY_KEY[raw]) return BY_KEY[raw];
  const byLabel = BY_LABEL.get(raw.toLowerCase());
  if (byLabel) return byLabel;
  const keyUpper = raw.toUpperCase().replace(/\s+/g, '_');
  if (BY_KEY[keyUpper]) return BY_KEY[keyUpper];
  if (accounts?.length) {
    const fromAccount = resolveAccountFinanceCategory(raw, accounts);
    if (fromAccount) return fromAccount;
  }
  return null;
}

/** Label persistido em FINANCIAL_TX.category */
export function normalizeFinanceCategory(value, accounts = null) {
  const resolved = resolveFinanceCategory(value, accounts);
  if (resolved) return resolved.isAccountCategory ? value : resolved.label;
  return String(value || '').trim() || FINANCE_CATEGORIES.OUTRAS_DESPESAS.label;
}

export function defaultCategoryForTxType(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'plan') return FINANCE_CATEGORIES.MENSALIDADE.label;
  if (t === 'product') return FINANCE_CATEGORIES.VENDA_PRODUTO.label;
  if (t === 'enrollment') return FINANCE_CATEGORIES.MATRICULA.label;
  if (t === 'refund') return FINANCE_CATEGORIES.CANCELAMENTO.label;
  if (t === 'stock_purchase') return FINANCE_CATEGORIES.CUSTO_ESTOQUE.label;
  if (t === 'card_fee') return FINANCE_CATEGORIES.TAXA_CARTAO.label;
  if (t === 'expense_financial') return FINANCE_CATEGORIES.TARIFAS_BANCARIAS.label;
  if (t === 'expense' || t === 'expense_operational') return FINANCE_CATEGORIES.OUTRAS_DESPESAS.label;
  return FINANCE_CATEGORIES.OUTROS_RECEITA.label;
}

export function defaultCategoryKeyForTxType(type) {
  const label = defaultCategoryForTxType(type);
  return findCategoryKey(resolveFinanceCategory(label)) || 'OUTROS_RECEITA';
}

export function isFinancialCategory(value) {
  const cat = resolveFinanceCategory(value);
  return cat?.type === 'expense_financial' || cat?.type === 'card_fee';
}

export function categoryIsUnclassified(value) {
  return resolveFinanceCategory(value) == null && String(value || '').trim() !== '';
}

export function dreGroupForCategory(value) {
  const cat = resolveFinanceCategory(value);
  return cat?.dreGroup || UNCLASSIFIED_DRE_GROUP;
}

const DRE_EXPENSE_GROUPS = new Set([
  'Deduções',
  'CMV/CPV',
  'Despesas Operacionais',
  'Depreciação/Amortização',
  'Resultado Financeiro',
  'Imposto s/ Lucro',
  UNCLASSIFIED_DRE_GROUP,
]);

/** Linhas da DRE para exibição (valor com sinal de despesa quando aplicável). */
export function buildDreDisplayRows(dreData) {
  const totals = new Set([
    'Receita Líquida',
    'Lucro Bruto',
    'Resultado Operacional',
    'EBITDA',
    'Resultado Líquido',
  ]);
  return DRE_DISPLAY_GROUPS.filter((g) => dreData[g] !== undefined || totals.has(g)).map((g) => {
    const raw = Number(dreData[g] || 0);
    const expenseLike = DRE_EXPENSE_GROUPS.has(g);
    const display = totals.has(g) ? raw : expenseLike ? -Math.abs(raw) : raw;
    return {
      group: g,
      value: display,
      isTotal: totals.has(g),
      unclassified: g === UNCLASSIFIED_DRE_GROUP,
      warn: g === UNCLASSIFIED_DRE_GROUP && Math.abs(raw) > 0.009,
    };
  });
}
