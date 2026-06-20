/**
 * Estrutura de abas do hub /financeiro (navegação apenas).
 * Slugs de conteúdo legados (movimentacoes, plano, …) permanecem em ?tab= onde aplicável.
 */

export const FINANCEIRO_SECTIONS = {
  OVERVIEW: 'visao-geral',
  A_RECEBER: 'a-receber',
  A_PAGAR: 'a-pagar',
  MENSALIDADES: 'mensalidades',
  CAIXA: 'caixa',
  CONTABILIDADE: 'contabilidade',
  CONFIG: 'configuracao',
};

/** Destino das configurações financeiras (Configurações). */
export const EMPRESA_FINANCE_TAB = 'financeiro';
export const EMPRESA_FINANCE_CONFIG_PATH = `/configuracoes?tab=${EMPRESA_FINANCE_TAB}`;

/** Contas de recebimento (Configurações → Financeiro → Recebimento). */
export const EMPRESA_FINANCE_ACCOUNTS_PATH = `${EMPRESA_FINANCE_CONFIG_PATH}&section=recebimento#contas`;

/** Fornecedores (Configurações → Financeiro → Fornecedores). */
export const EMPRESA_FINANCE_VENDORS_PATH = `${EMPRESA_FINANCE_CONFIG_PATH}&section=fornecedores`;

/** Razão contábil (Configurações → Financeiro → Avançado). */
export function buildEmpresaFinanceRazaoPath({ from, txId } = {}) {
  const params = new URLSearchParams();
  params.set('tab', EMPRESA_FINANCE_TAB);
  params.set('section', 'razao-contabil');
  const fromVal = String(from || '').trim();
  const txIdVal = String(txId || '').trim();
  if (fromVal) params.set('from', fromVal);
  if (txIdVal) params.set('txId', txIdVal);
  return `/configuracoes?${params.toString()}`;
}

export const EMPRESA_FINANCE_RAZAO_PATH = buildEmpresaFinanceRazaoPath();

/** Abas folha sob a seção Operações (legado; hub usa abas planas). */
export const FINANCEIRO_CAIXA_LEAF_TABS = ['movimentacoes', 'previsao', 'fechamento', 'conciliacao'];

/** Aba operacional do hub — extrato / lançamentos contábeis (legado: razao). */
export const FINANCEIRO_EXTRATO_TAB = 'extrato';

/** Abas gerenciais ocultas para recepcionista (member); URL direta redireciona ao fallback. */
export const FINANCEIRO_MEMBER_RESTRICTED_TABS = new Set([
  FINANCEIRO_SECTIONS.A_PAGAR,
  'previsao',
  'fechamento',
  'conciliacao',
  FINANCEIRO_EXTRATO_TAB,
]);

/** Slugs legados redirecionados para Minha academia → Financeiro. */
const REDIRECT_TO_EMPRESA_CONFIG = new Set([
  FINANCEIRO_SECTIONS.CONFIG,
  'plano',
  'contabilidade',
]);

const TAB_TO_SECTION = {
  [FINANCEIRO_SECTIONS.OVERVIEW]: FINANCEIRO_SECTIONS.OVERVIEW,
  [FINANCEIRO_SECTIONS.A_RECEBER]: FINANCEIRO_SECTIONS.A_RECEBER,
  [FINANCEIRO_SECTIONS.A_PAGAR]: FINANCEIRO_SECTIONS.A_PAGAR,
  [FINANCEIRO_SECTIONS.MENSALIDADES]: FINANCEIRO_SECTIONS.A_RECEBER,
  [FINANCEIRO_SECTIONS.CONFIG]: FINANCEIRO_SECTIONS.CONFIG,
  movimentacoes: 'movimentacoes',
  previsao: 'previsao',
  fechamento: 'fechamento',
  conciliacao: 'conciliacao',
  [FINANCEIRO_EXTRATO_TAB]: FINANCEIRO_EXTRATO_TAB,
  razao: FINANCEIRO_EXTRATO_TAB,
  plano: FINANCEIRO_SECTIONS.CONFIG,
  contabilidade: FINANCEIRO_SECTIONS.CONFIG,
  dre: 'dre',
};

const HUB_TAB_LABELS = {
  [FINANCEIRO_SECTIONS.OVERVIEW]: 'Visão Geral',
  [FINANCEIRO_SECTIONS.A_RECEBER]: 'A receber',
  [FINANCEIRO_SECTIONS.A_PAGAR]: 'A pagar',
  movimentacoes: 'Lançamentos',
  previsao: 'Previsão',
  fechamento: 'Conferência do mês',
  conciliacao: 'Conciliação',
  [FINANCEIRO_EXTRATO_TAB]: 'Extrato contábil',
};

const HUB_TAB_SHORT_LABELS = {
  [FINANCEIRO_SECTIONS.OVERVIEW]: 'Visão Geral',
  [FINANCEIRO_SECTIONS.A_RECEBER]: 'A receber',
  [FINANCEIRO_SECTIONS.A_PAGAR]: 'A pagar',
  movimentacoes: 'Lançamentos',
  previsao: 'Previsão',
  fechamento: 'Conferência',
  conciliacao: 'Conciliação',
  [FINANCEIRO_EXTRATO_TAB]: 'Extrato',
};

/** Slug legado — redireciona para razão em Minha academia. */
export function isFinanceiroExtratoLegacyTab(tab) {
  const t = String(tab || '').trim().toLowerCase();
  return t === FINANCEIRO_EXTRATO_TAB || t === 'razao';
}

export function financeiroExtratoLegacyRedirect() {
  return EMPRESA_FINANCE_RAZAO_PATH;
}

/** Mapeia ?tab= legado do hub (ex-/caixa) para slug folha. */
export function financeiroLegacyTabToSlug(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (t === 'transactions') return 'movimentacoes';
  if (t === 'closing') return 'fechamento';
  if (t === 'razao') return FINANCEIRO_EXTRATO_TAB;
  if (t === 'mensalidades') return FINANCEIRO_SECTIONS.A_RECEBER;
  if (REDIRECT_TO_EMPRESA_CONFIG.has(t)) return FINANCEIRO_SECTIONS.CONFIG;
  return t;
}

/** Slugs de ?tab= que pertencem às configurações (Minha academia). */
export function isFinanceiroConfigTabSlug(tab) {
  const t = String(tab || '').trim().toLowerCase();
  return REDIRECT_TO_EMPRESA_CONFIG.has(t);
}

/** DRE legado — redirecionado para Relatórios → Financeiro. */
export function isFinanceiroDreLegacyTab(tab) {
  return String(tab || '').trim().toLowerCase() === 'dre';
}

/** Mapeia /finance legado — redirecionado para Minha academia → Financeiro. */
export function financeLegacyTabToFinanceiro() {
  return EMPRESA_FINANCE_TAB;
}

export function getFinanceiroSectionForTab(tab) {
  const id = String(tab || '').toLowerCase();
  return TAB_TO_SECTION[id] || FINANCEIRO_SECTIONS.OVERVIEW;
}

/** Indica se a URL trouxe ?tab= explícito (vs. ausência de parâmetro). */
export function hasExplicitFinanceiroTabParam(tabParam) {
  return String(tabParam ?? '').trim().length > 0;
}

/**
 * Aba padrão do hub conforme perfil (sem ?tab= ou slug inválido).
 * Aceita `navRole` ('owner' | 'admin' | 'member') ou `{ isOwner, isAdmin }`.
 */
export function getFinanceiroDefaultTab(navRoleOrAccess) {
  if (navRoleOrAccess && typeof navRoleOrAccess === 'object') {
    const { isOwner, isAdmin } = navRoleOrAccess;
    if (isOwner || isAdmin) return FINANCEIRO_SECTIONS.OVERVIEW;
    return FINANCEIRO_SECTIONS.A_RECEBER;
  }
  return navRoleOrAccess === 'member'
    ? FINANCEIRO_SECTIONS.A_RECEBER
    : FINANCEIRO_SECTIONS.OVERVIEW;
}

export function buildFinanceiroMemberLeafTabs() {
  return ['movimentacoes'];
}

export function buildFinanceiroAdminLeafTabs({ financeModule }) {
  const tabs = buildFinanceiroMemberLeafTabs();
  if (financeModule) tabs.push('previsao', 'fechamento');
  return tabs;
}

export function buildFinanceiroOwnerLeafTabs({ financeModule }) {
  const tabs = buildFinanceiroAdminLeafTabs({ financeModule });
  if (financeModule) {
    tabs.push('conciliacao');
  }
  return tabs;
}

function buildFinanceiroOperationalLeafTabs(navRole, financeModule) {
  if (navRole === 'owner') return buildFinanceiroOwnerLeafTabs({ financeModule });
  if (navRole === 'admin') return buildFinanceiroAdminLeafTabs({ financeModule });
  return buildFinanceiroMemberLeafTabs();
}

export function buildFinanceiroAllowedLeafTabs({ navRole, financeModule, isOwner }) {
  const role =
    navRole ||
    (isOwner === true ? 'owner' : isOwner === false ? 'member' : 'member');
  const base = [
    FINANCEIRO_SECTIONS.OVERVIEW,
    FINANCEIRO_SECTIONS.A_RECEBER,
  ];
  if (role === 'owner' || role === 'admin') {
    base.push(FINANCEIRO_SECTIONS.A_PAGAR);
  }
  const operational = buildFinanceiroOperationalLeafTabs(role, financeModule);
  return [...base, ...operational];
}

/** @deprecated Prefer buildFinanceiroAllowedLeafTabs({ navRole, financeModule }) */
export function buildFinanceiroManagerLeafTabs({ navRole, isOwner, financeModule }) {
  return buildFinanceiroAllowedLeafTabs({ navRole, isOwner, financeModule });
}

function orderFinanceiroHubTabIds(navRole, tabIds) {
  if (navRole === 'member') {
    const memberOrder = [
      FINANCEIRO_SECTIONS.A_RECEBER,
      'movimentacoes',
      FINANCEIRO_SECTIONS.OVERVIEW,
    ];
    const set = new Set(tabIds);
    return [
      ...memberOrder.filter((id) => set.has(id)),
      ...tabIds.filter((id) => !memberOrder.includes(id)),
    ];
  }
  return tabIds;
}

/** Itens do HubTabBar do /financeiro (ordem e visibilidade por perfil). */
export function buildFinanceiroHubTabItems({ navRole, financeModule, isOwner, tabBadges = {} }) {
  const role =
    navRole ||
    (isOwner === true ? 'owner' : isOwner === false ? 'member' : 'member');
  const ids = orderFinanceiroHubTabIds(
    role,
    buildFinanceiroAllowedLeafTabs({ navRole: role, financeModule })
  );
  return ids.map((id) => {
    const badgeCount = Number(tabBadges[id]) > 0 ? Number(tabBadges[id]) : undefined;
    return {
      id,
      label: HUB_TAB_LABELS[id] || id,
      shortLabel: HUB_TAB_SHORT_LABELS[id] || HUB_TAB_LABELS[id] || id,
      badgeCount,
      badgeAriaLabel:
        badgeCount && id === FINANCEIRO_SECTIONS.A_PAGAR
          ? `${badgeCount} conta(s) vencida(s)`
          : badgeCount
            ? `${badgeCount} pendente(s)`
            : undefined,
    };
  });
}
