/**
 * Estrutura de abas do hub /financeiro (navegação apenas).
 * Slugs de conteúdo legados (movimentacoes, plano, …) permanecem em ?tab= onde aplicável.
 */

export const FINANCEIRO_SECTIONS = {
  OVERVIEW: 'visao-geral',
  MENSALIDADES: 'mensalidades',
  CAIXA: 'caixa',
  CONTABILIDADE: 'contabilidade',
  CONFIG: 'configuracao',
};

/** Destino das configurações financeiras (Minha academia). */
export const EMPRESA_FINANCE_TAB = 'financeiro';
export const EMPRESA_FINANCE_CONFIG_PATH = `/empresa?tab=${EMPRESA_FINANCE_TAB}`;

/** Abas folha sob a seção Operações (legado; hub usa abas planas). */
export const FINANCEIRO_CAIXA_LEAF_TABS = ['movimentacoes', 'previsao', 'fechamento', 'conciliacao'];

/** Abas contábeis owner — conteúdo em Configuração (não mais abas soltas). */
export const FINANCEIRO_CONTABILIDADE_LEAF_TABS = ['plano', 'razao', 'dre'];

const REDIRECT_TO_CONFIG_TABS = new Set([
  'plano',
  'razao',
  'dre',
  'contabilidade',
  ...FINANCEIRO_CONTABILIDADE_LEAF_TABS,
]);

const TAB_TO_SECTION = {
  [FINANCEIRO_SECTIONS.OVERVIEW]: FINANCEIRO_SECTIONS.OVERVIEW,
  [FINANCEIRO_SECTIONS.MENSALIDADES]: FINANCEIRO_SECTIONS.MENSALIDADES,
  [FINANCEIRO_SECTIONS.CONFIG]: FINANCEIRO_SECTIONS.CONFIG,
  movimentacoes: 'movimentacoes',
  previsao: 'previsao',
  fechamento: 'fechamento',
  conciliacao: 'conciliacao',
  plano: FINANCEIRO_SECTIONS.CONFIG,
  razao: FINANCEIRO_SECTIONS.CONFIG,
  dre: FINANCEIRO_SECTIONS.CONFIG,
  contabilidade: FINANCEIRO_SECTIONS.CONFIG,
};

/** Mapeia ?tab= legado do hub (ex-/caixa) para slug folha. */
export function financeiroLegacyTabToSlug(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (t === 'transactions') return 'movimentacoes';
  if (t === 'closing') return 'fechamento';
  if (REDIRECT_TO_CONFIG_TABS.has(t)) return FINANCEIRO_SECTIONS.CONFIG;
  return t;
}

/** Slugs de ?tab= que pertencem às configurações (agora em Minha academia). */
export function isFinanceiroConfigTabSlug(tab) {
  const t = String(tab || '').trim().toLowerCase();
  return t === FINANCEIRO_SECTIONS.CONFIG || REDIRECT_TO_CONFIG_TABS.has(t);
}

/** Mapeia /finance legado — redirecionado para Minha academia → Financeiro. */
export function financeLegacyTabToFinanceiro() {
  return EMPRESA_FINANCE_TAB;
}

export function getFinanceiroSectionForTab(tab) {
  const id = String(tab || '').toLowerCase();
  return TAB_TO_SECTION[id] || FINANCEIRO_SECTIONS.OVERVIEW;
}

export function buildFinanceiroMemberLeafTabs({ financeModule }) {
  const tabs = ['movimentacoes'];
  if (financeModule) tabs.push('previsao', 'fechamento');
  return tabs;
}

export function buildFinanceiroOwnerLeafTabs({ financeModule }) {
  const tabs = buildFinanceiroMemberLeafTabs({ financeModule });
  if (financeModule) tabs.push('conciliacao');
  return tabs;
}

export function buildFinanceiroAllowedLeafTabs({ isOwner, financeModule }) {
  const base = [FINANCEIRO_SECTIONS.OVERVIEW, FINANCEIRO_SECTIONS.MENSALIDADES];
  const operational = isOwner
    ? buildFinanceiroOwnerLeafTabs({ financeModule })
    : buildFinanceiroMemberLeafTabs({ financeModule });
  return [...base, ...operational];
}

export function buildFinanceiroManagerLeafTabs({ isOwner, financeModule }) {
  const base = [FINANCEIRO_SECTIONS.OVERVIEW, FINANCEIRO_SECTIONS.MENSALIDADES];
  const operational = isOwner
    ? buildFinanceiroOwnerLeafTabs({ financeModule })
    : buildFinanceiroMemberLeafTabs({ financeModule });
  return [...base, ...operational];
}
