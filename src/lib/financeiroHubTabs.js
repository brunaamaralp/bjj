/**
 * Estrutura de abas do hub /financeiro (navegação apenas).
 * Slugs de conteúdo legados (movimentacoes, plano, …) permanecem em ?tab=.
 */

export const FINANCEIRO_SECTIONS = {
  OVERVIEW: 'visao-geral',
  MENSALIDADES: 'mensalidades',
  CAIXA: 'caixa',
  CONTABILIDADE: 'contabilidade',
  CONFIG: 'configuracao',
};

/** Abas folha sob o grupo Caixa. */
export const FINANCEIRO_CAIXA_LEAF_TABS = ['movimentacoes', 'previsao', 'fechamento', 'conciliacao'];

/** Abas folha sob Contabilidade (owner). */
export const FINANCEIRO_CONTABILIDADE_LEAF_TABS = ['plano', 'razao', 'dre'];

/** @deprecated Nenhuma aba do hub usa placeholder — mantido para compat. */
export const FINANCEIRO_PLACEHOLDER_TABS = new Set();

const TAB_TO_SECTION = {
  [FINANCEIRO_SECTIONS.OVERVIEW]: FINANCEIRO_SECTIONS.OVERVIEW,
  [FINANCEIRO_SECTIONS.MENSALIDADES]: FINANCEIRO_SECTIONS.MENSALIDADES,
  [FINANCEIRO_SECTIONS.CONFIG]: FINANCEIRO_SECTIONS.CONFIG,
  movimentacoes: FINANCEIRO_SECTIONS.CAIXA,
  previsao: FINANCEIRO_SECTIONS.CAIXA,
  fechamento: FINANCEIRO_SECTIONS.CAIXA,
  conciliacao: FINANCEIRO_SECTIONS.CAIXA,
  plano: FINANCEIRO_SECTIONS.CONTABILIDADE,
  razao: FINANCEIRO_SECTIONS.CONTABILIDADE,
  dre: FINANCEIRO_SECTIONS.CONTABILIDADE,
  /** Legado: ?tab=contabilidade abria plano de contas */
  contabilidade: FINANCEIRO_SECTIONS.CONTABILIDADE,
};

const SECTION_DEFAULT_LEAF = {
  [FINANCEIRO_SECTIONS.OVERVIEW]: FINANCEIRO_SECTIONS.OVERVIEW,
  [FINANCEIRO_SECTIONS.MENSALIDADES]: FINANCEIRO_SECTIONS.MENSALIDADES,
  [FINANCEIRO_SECTIONS.CAIXA]: 'movimentacoes',
  [FINANCEIRO_SECTIONS.CONTABILIDADE]: 'plano',
  [FINANCEIRO_SECTIONS.CONFIG]: FINANCEIRO_SECTIONS.CONFIG,
};

/** Mapeia ?tab= legado do hub (ex-/caixa) para slug folha. */
export function financeiroLegacyTabToSlug(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (t === 'transactions') return 'movimentacoes';
  if (t === 'closing') return 'fechamento';
  if (t === 'contabilidade') return 'plano';
  return t;
}

/** @deprecated alias */
export const caixaLegacyTabToSlug = financeiroLegacyTabToSlug;

/** Mapeia /finance legado para aba folha do hub financeiro. */
export function financeLegacyTabToFinanceiro(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (t === 'lancamentos') return 'razao';
  if (t === 'relatorios') return 'dre';
  if (t === 'plano') return 'plano';
  return 'plano';
}

/** @deprecated alias */
export const financeLegacyTabToCaixa = financeLegacyTabToFinanceiro;

export function getFinanceiroSectionForTab(tab) {
  const id = String(tab || '').toLowerCase();
  return TAB_TO_SECTION[id] || FINANCEIRO_SECTIONS.CAIXA;
}

export function defaultLeafTabForSection(section) {
  return SECTION_DEFAULT_LEAF[section] || 'movimentacoes';
}

export function buildFinanceiroMemberLeafTabs({ financeModule }) {
  const tabs = ['movimentacoes'];
  if (financeModule) tabs.push('previsao', 'fechamento');
  return tabs;
}

export function buildFinanceiroOwnerLeafTabs({ financeModule }) {
  const tabs = buildFinanceiroMemberLeafTabs({ financeModule });
  if (financeModule) tabs.push('conciliacao');
  tabs.push(...FINANCEIRO_CONTABILIDADE_LEAF_TABS);
  return tabs;
}

export function buildFinanceiroAllowedLeafTabs({ isOwner, financeModule }) {
  const base = [FINANCEIRO_SECTIONS.OVERVIEW, FINANCEIRO_SECTIONS.MENSALIDADES];
  if (isOwner) base.push(FINANCEIRO_SECTIONS.CONFIG);
  const operational = isOwner
    ? buildFinanceiroOwnerLeafTabs({ financeModule })
    : buildFinanceiroMemberLeafTabs({ financeModule });
  return [...base, ...operational];
}
