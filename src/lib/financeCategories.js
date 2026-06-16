/**
 * Categorias fixas de FINANCIAL_TX — fonte de verdade para type, DRE e contas.
 * Campo `category` na transação armazena o label (ex.: "Mensalidades")
 * ou valor `acct:CODE` para contas do plano de contas.
 */

import {
  getAccountCategoryOptionsByNature,
  getBalanceSheetCategoryOptionsByNature,
  mergeCategoryOptionGroups,
  resolveAccountFinanceCategory,
} from './financeAccountCategories.js';

export const UNCLASSIFIED_DRE_GROUP = 'Não classificado';

/** Classificação gerencial para relatório operacional e DFC. */
export const OPERATIONAL_BUCKETS = {
  OPERATIONAL: 'operational',
  FINANCIAL: 'financial',
  FINANCING: 'financing',
  NEUTRAL: 'neutral',
};

export const PATRIMONIAL_FLOW_GROUP = 'Fluxo patrimonial / financiamento';

export const FINANCE_CATEGORIES = {
  MENSALIDADE: {
    label: 'Mensalidades',
    type: 'plan',
    dreGroup: 'Receita Bruta',
    dreAccount: '4.1.1',
    operationalBucket: 'operational',
  },
  VENDA_PRODUTO: {
    label: 'Vendas de produtos',
    type: 'product',
    dreGroup: 'Receita Bruta',
    dreAccount: '4.1.1',
    operationalBucket: 'operational',
  },
  MATRICULA: {
    label: 'Matrículas',
    type: 'enrollment',
    dreGroup: 'Receita Bruta',
    dreAccount: '4.1.1',
    operationalBucket: 'operational',
  },
  ALUGUEL_RECEITA: {
    label: 'Aluguéis recebidos',
    type: 'rental',
    dreGroup: 'Receita Bruta',
    dreAccount: '4.1.1',
    operationalBucket: 'operational',
  },
  OUTROS_RECEITA: {
    label: 'Outras receitas',
    type: 'other',
    dreGroup: 'Receita Bruta',
    dreAccount: '4.1.1',
    operationalBucket: 'operational',
  },
  RECEITA_FINANCEIRA: {
    label: 'Receitas financeiras',
    type: 'financial_revenue',
    dreGroup: 'Resultado Financeiro',
    dreAccount: '7.1.2',
    operationalBucket: 'financial',
  },
  APORTE_CAPITAL: {
    label: 'Aporte de capital',
    type: 'equity_injection',
    dreGroup: '',
    dreAccount: '3.1.1',
    operationalBucket: 'financing',
  },
  EMPRESTIMO_RECEBIDO: {
    label: 'Empréstimo recebido',
    type: 'loan_proceeds',
    dreGroup: '',
    dreAccount: '2.2.1',
    operationalBucket: 'financing',
  },
  TRANSFERENCIA_RECEBIDA: {
    label: 'Transferência recebida',
    type: 'internal_transfer',
    dreGroup: '',
    dreAccount: '1.1.9',
    operationalBucket: 'neutral',
  },
  CANCELAMENTO: {
    label: 'Cancelamentos',
    type: 'refund',
    dreGroup: 'Deduções',
    dreAccount: '4.9.1',
    operationalBucket: 'operational',
  },
  DESCONTO: {
    label: 'Descontos concedidos',
    type: 'refund',
    dreGroup: 'Deduções',
    dreAccount: '4.9.1',
    operationalBucket: 'operational',
  },
  CUSTO_ESTOQUE: {
    label: 'Custo de estoque',
    type: 'stock_purchase',
    dreGroup: 'CMV/CPV',
    dreAccount: '5.1.1',
    operationalBucket: 'operational',
  },
  CUSTO_SERVICO: {
    label: 'Custo do serviço',
    type: 'stock_purchase',
    dreGroup: 'CMV/CPV',
    dreAccount: '5.1.1',
    operationalBucket: 'operational',
  },
  ALUGUEL_ESPACO: {
    label: 'Aluguel do espaço',
    type: 'expense_operational',
    dreGroup: 'Despesas Operacionais',
    dreAccount: '6.2.1',
    operationalBucket: 'operational',
  },
  SALARIOS: {
    label: 'Salários e encargos',
    type: 'expense_operational',
    dreGroup: 'Despesas Operacionais',
    dreAccount: '6.2.1',
    operationalBucket: 'operational',
  },
  MARKETING: {
    label: 'Marketing',
    type: 'expense_operational',
    dreGroup: 'Despesas Operacionais',
    dreAccount: '6.2.1',
    operationalBucket: 'operational',
  },
  SISTEMAS: {
    label: 'Sistemas / Software',
    type: 'expense_operational',
    dreGroup: 'Despesas Operacionais',
    dreAccount: '6.2.1',
    operationalBucket: 'operational',
  },
  MANUTENCAO: {
    label: 'Manutenção',
    type: 'expense_operational',
    dreGroup: 'Despesas Operacionais',
    dreAccount: '6.2.1',
    operationalBucket: 'operational',
  },
  AGUA: {
    label: 'Água e esgoto',
    type: 'expense_operational',
    dreGroup: 'Despesas Operacionais',
    dreAccount: '6.2.1',
    operationalBucket: 'operational',
  },
  LUZ: {
    label: 'Luz / energia',
    type: 'expense_operational',
    dreGroup: 'Despesas Operacionais',
    dreAccount: '6.2.1',
    operationalBucket: 'operational',
  },
  TELEFONE_INTERNET: {
    label: 'Telefone e internet',
    type: 'expense_operational',
    dreGroup: 'Despesas Operacionais',
    dreAccount: '6.2.1',
    operationalBucket: 'operational',
  },
  CONDOMINIO: {
    label: 'Condomínio',
    type: 'expense_operational',
    dreGroup: 'Despesas Operacionais',
    dreAccount: '6.2.1',
    operationalBucket: 'operational',
  },
  IMPOSTOS_TAXAS: {
    label: 'Impostos e taxas',
    type: 'expense_operational',
    dreGroup: 'Despesas Operacionais',
    dreAccount: '6.2.1',
    operationalBucket: 'operational',
  },
  OUTRAS_DESPESAS: {
    label: 'Outras despesas',
    type: 'expense_operational',
    dreGroup: 'Despesas Operacionais',
    dreAccount: '6.2.1',
    operationalBucket: 'operational',
  },
  EMPRESTIMO_PAGO: {
    label: 'Pagamento de empréstimo',
    type: 'loan_repayment',
    dreGroup: '',
    dreAccount: '2.2.1',
    operationalBucket: 'financing',
  },
  TRANSFERENCIA_ENVIADA: {
    label: 'Transferência enviada',
    type: 'internal_transfer',
    dreGroup: '',
    dreAccount: '1.1.9',
    operationalBucket: 'neutral',
  },
  TARIFAS_BANCARIAS: {
    label: 'Tarifas bancárias',
    type: 'expense_financial',
    dreGroup: 'Resultado Financeiro',
    dreAccount: '7.1.1',
    operationalBucket: 'financial',
  },
  JUROS: {
    label: 'Juros',
    type: 'expense_financial',
    dreGroup: 'Resultado Financeiro',
    dreAccount: '7.1.1',
    operationalBucket: 'financial',
  },
  TAXA_CARTAO: {
    label: 'Taxas de cartão',
    type: 'card_fee',
    dreGroup: 'Resultado Financeiro',
    dreAccount: '7.1.1',
    operationalBucket: 'financial',
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
  PATRIMONIAL_FLOW_GROUP,
];

const INFLOW_CATEGORY_GROUP_ORDER = [
  'Receita Bruta',
  'Resultado Financeiro',
  PATRIMONIAL_FLOW_GROUP,
];

export function getExpenseCategories() {
  return Object.values(FINANCE_CATEGORIES).filter((c) => EXPENSE_TYPES_MANUAL.has(c.type));
}

const UTILITY_CATEGORY_KEYS = ['AGUA', 'LUZ', 'TELEFONE_INTERNET', 'CONDOMINIO', 'IMPOSTOS_TAXAS'];

/** Categorias típicas de contas fixas (água, luz, telefone…). */
export function getUtilityExpenseCategories() {
  return UTILITY_CATEGORY_KEYS.map((k) => FINANCE_CATEGORIES[k]).filter(Boolean);
}

/** Chips e default ao trocar direção no modal de lançamento. */
export const FREQUENT_TX_CATEGORY_LABELS = {
  in: [
    FINANCE_CATEGORIES.MENSALIDADE.label,
    FINANCE_CATEGORIES.VENDA_PRODUTO.label,
    FINANCE_CATEGORIES.RECEITA_FINANCEIRA.label,
    FINANCE_CATEGORIES.APORTE_CAPITAL.label,
  ],
  out: [
    FINANCE_CATEGORIES.LUZ.label,
    FINANCE_CATEGORIES.AGUA.label,
    FINANCE_CATEGORIES.OUTRAS_DESPESAS.label,
    FINANCE_CATEGORIES.MARKETING.label,
    FINANCE_CATEGORIES.TARIFAS_BANCARIAS.label,
    FINANCE_CATEGORIES.EMPRESTIMO_PAGO.label,
  ],
};

export function defaultCategoryForDirection(direction) {
  return direction === 'out'
    ? FINANCE_CATEGORIES.OUTRAS_DESPESAS
    : FINANCE_CATEGORIES.MENSALIDADE;
}

function sortCategoryGroupMap(map, nature) {
  const order = nature === 'out' ? EXPENSE_CATEGORY_GROUP_ORDER : INFLOW_CATEGORY_GROUP_ORDER;
  const sorted = new Map();
  for (const key of order) {
    if (map.has(key)) sorted.set(key, map.get(key));
  }
  for (const [key, val] of map) {
    if (!sorted.has(key)) sorted.set(key, val);
  }
  return sorted;
}

const REVENUE_TYPES = new Set(['plan', 'product', 'enrollment', 'rental', 'other']);

const TYPE_TO_OPERATIONAL_BUCKET = {
  financial_revenue: 'financial',
  expense_financial: 'financial',
  card_fee: 'financial',
  equity_injection: 'financing',
  loan_proceeds: 'financing',
  loan_repayment: 'financing',
  balance_sheet_in: 'financing',
  balance_sheet_out: 'financing',
  internal_transfer: 'neutral',
};

export function getRevenueCategories() {
  return Object.values(FINANCE_CATEGORIES).filter((c) => REVENUE_TYPES.has(c.type));
}

function getFinancialInflowCategories() {
  return [FINANCE_CATEGORIES.RECEITA_FINANCEIRA];
}

function getPatrimonialInflowCategories() {
  return [
    FINANCE_CATEGORIES.APORTE_CAPITAL,
    FINANCE_CATEGORIES.EMPRESTIMO_RECEBIDO,
    FINANCE_CATEGORIES.TRANSFERENCIA_RECEBIDA,
  ];
}

function getPatrimonialOutflowCategories() {
  return [FINANCE_CATEGORIES.EMPRESTIMO_PAGO, FINANCE_CATEGORIES.TRANSFERENCIA_ENVIADA];
}

/** Agrupa categorias por dreGroup para optgroup no select. */
export function getCategoryOptionsByNature(nature, accounts = null) {
  let map = new Map();

  if (nature === 'out') {
    for (const c of getExpenseCategories()) {
      if (!map.has(c.dreGroup)) map.set(c.dreGroup, []);
      map.get(c.dreGroup).push(c);
    }
    map.set(PATRIMONIAL_FLOW_GROUP, [...getPatrimonialOutflowCategories()]);
  } else {
    for (const c of getRevenueCategories()) {
      if (!map.has(c.dreGroup)) map.set(c.dreGroup, []);
      map.get(c.dreGroup).push(c);
    }
    const financial = getFinancialInflowCategories();
    if (financial.length) {
      map.set('Resultado Financeiro', [...(map.get('Resultado Financeiro') || []), ...financial]);
    }
    map.set(PATRIMONIAL_FLOW_GROUP, [...getPatrimonialInflowCategories()]);
  }

  if (accounts?.length) {
    const filtered = filterAccountsForCategorySelect(accounts);
    if (filtered.length) {
      map = mergeCategoryOptionGroups(map, getAccountCategoryOptionsByNature(filtered, nature));
    }
    map = mergeCategoryOptionGroups(map, getBalanceSheetCategoryOptionsByNature(accounts, nature));
  }

  return sortCategoryGroupMap(map, nature);
}

export function operationalBucketForCategory(value, accounts = null) {
  const cat = resolveFinanceCategory(value, accounts);
  if (cat?.operationalBucket) return cat.operationalBucket;
  if (cat?.type && TYPE_TO_OPERATIONAL_BUCKET[cat.type]) return TYPE_TO_OPERATIONAL_BUCKET[cat.type];
  if (cat?.type && REVENUE_TYPES.has(cat.type)) return 'operational';
  if (cat?.type === 'refund') return 'operational';
  if (cat?.type === 'expense_financial' || cat?.type === 'card_fee') return 'financial';
  if (cat?.type === 'expense_operational' || cat?.type === 'stock_purchase') return 'operational';
  return 'operational';
}

export function operationalBucketForTx(doc, accounts = null) {
  const category = String(doc?.category || '').trim();
  if (category) {
    const fromCat = operationalBucketForCategory(category, accounts);
    if (resolveFinanceCategory(category, accounts)) return fromCat;
  }
  const type = String(doc?.type || '').toLowerCase();
  if (TYPE_TO_OPERATIONAL_BUCKET[type]) return TYPE_TO_OPERATIONAL_BUCKET[type];
  if (REVENUE_TYPES.has(type) || type === 'refund') return 'operational';
  if (type === 'expense_financial' || type === 'card_fee') return 'financial';
  if (['expense_operational', 'expense', 'stock_purchase'].includes(type)) return 'operational';
  return 'operational';
}

export function isOperationalInflowTx(doc, accounts = null) {
  return operationalBucketForTx(doc, accounts) === 'operational';
}

export function isOperationalOutflowTx(doc, accounts = null) {
  return operationalBucketForTx(doc, accounts) === 'operational';
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
export function resolveFinanceCategory(value, accounts = null, options = {}) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (BY_KEY[raw]) return BY_KEY[raw];
  const byLabel = BY_LABEL.get(raw.toLowerCase());
  if (byLabel) return byLabel;
  const keyUpper = raw.toUpperCase().replace(/\s+/g, '_');
  if (BY_KEY[keyUpper]) return BY_KEY[keyUpper];
  if (accounts?.length) {
    const nature = options.direction === 'out' ? 'out' : 'in';
    const fromAccount = resolveAccountFinanceCategory(raw, accounts, nature);
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
  if (t === 'financial_revenue') return FINANCE_CATEGORIES.RECEITA_FINANCEIRA.label;
  if (t === 'equity_injection') return FINANCE_CATEGORIES.APORTE_CAPITAL.label;
  if (t === 'loan_proceeds') return FINANCE_CATEGORIES.EMPRESTIMO_RECEBIDO.label;
  if (t === 'loan_repayment') return FINANCE_CATEGORIES.EMPRESTIMO_PAGO.label;
  if (t === 'internal_transfer') return FINANCE_CATEGORIES.TRANSFERENCIA_RECEBIDA.label;
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
