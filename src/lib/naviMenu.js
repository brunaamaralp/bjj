/** Labels e estrutura compartilhada entre sidebar desktop e drawer mobile. */

export const NAV_ACCORDION_IDS = {
  AUTOMACOES: 'automacoes',
  LOJA: 'loja',
  CAIXA: 'caixa',
  RELATORIOS: 'relatorios',
};

/** @typedef {{ id: string, label: string, to: string, iconKey?: string, requireAgent?: boolean }} NavChildItem */
/** @typedef {{ id: string, label: string, iconKey: string, defaultTo: string, children: NavChildItem[] }} NavAccordionItem */
/** @typedef {{ to: string, label: string, iconKey: string, end?: boolean, action?: boolean }} NavDirectItem */

export function getNewLeadLabel(leadsLabel = 'Leads') {
  const basePlural = String(leadsLabel || 'Leads').trim();
  const singular =
    basePlural.toLowerCase().endsWith('s') && basePlural.length > 1
      ? basePlural.slice(0, -1)
      : basePlural.toLowerCase();
  return `Novo ${singular.slice(0, 1).toUpperCase() + singular.slice(1)}`;
}

/**
 * Compara rota atual com destino do menu (path + query).
 */
export function matchNavTarget(to, { pathname, search }) {
  const raw = String(to || '').trim();
  if (!raw) return false;
  const qIndex = raw.indexOf('?');
  const path = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
  const query = qIndex >= 0 ? raw.slice(qIndex + 1) : '';

  const pathMatch = pathname === path || (path !== '/' && pathname.startsWith(`${path}/`));
  if (!pathMatch) return false;
  if (!query) return pathname === path;

  const expected = new URLSearchParams(query);
  const current = new URLSearchParams(search || '');
  for (const [key, value] of expected.entries()) {
    if (current.get(key) !== value) return false;
  }
  return true;
}

/** Rotas diretas (sem accordion) — ao navegar aqui, accordions devem fechar. */
const DIRECT_NAV_PATHS = new Set([
  '/',
  '/pipeline',
  '/students',
  '/tarefas',
  '/inbox',
  '/mensalidades',
  '/contratos',
  '/new-lead',
  '/lead',
  '/student',
]);

export function isDirectNavPath(pathname) {
  const p = String(pathname || '');
  if (DIRECT_NAV_PATHS.has(p)) return true;
  if (p.startsWith('/lead/') || p.startsWith('/student/')) return true;
  return false;
}

/**
 * Retorna id do accordion que deve estar aberto para a rota atual (ou null).
 */
export function getAccordionIdForLocation({ pathname, search }) {
  const p = String(pathname || '');
  if (p === '/automacoes' || p === '/agente-ia') return NAV_ACCORDION_IDS.AUTOMACOES;
  if (p === '/equipe' || p === '/integracoes') return null;
  if (p === '/loja' || p === '/vendas' || p === '/produtos' || p === '/estoque') return NAV_ACCORDION_IDS.LOJA;
  if (p === '/caixa' || p === '/finance') return NAV_ACCORDION_IDS.CAIXA;
  if (p === '/reports') return NAV_ACCORDION_IDS.RELATORIOS;
  return null;
}

export function isAccordionChildActive(child, location) {
  if (child.id === 'agente' && location.pathname === '/agente-ia') return true;
  if (child.id === 'contabilidade' && location.pathname === '/caixa') {
    const tab = String(new URLSearchParams(location.search || '').get('tab') || '').toLowerCase();
    return tab === 'contabilidade' || tab === 'plano' || tab === 'razao' || tab === 'dre';
  }
  return matchNavTarget(child.to, location);
}

export function isAccordionParentPartial(accordion, location) {
  return accordion.children.some((c) => {
    if (c.requireAgent && location.pathname !== '/agente-ia') {
      return matchNavTarget(c.to, location);
    }
    return isAccordionChildActive(c, location);
  });
}

export function buildAutomacoesAccordion({ canConfigureAgenteIa }) {
  const children = [
    { id: 'modelos', label: 'Modelos', to: '/automacoes?tab=modelos' },
    { id: 'configuracoes', label: 'Configurações', to: '/automacoes?tab=configuracoes' },
  ];
  if (canConfigureAgenteIa) {
    children.push({
      id: 'agente',
      label: 'Agente de IA',
      to: '/automacoes?tab=agente',
      requireAgent: true,
    });
  }
  return {
    id: NAV_ACCORDION_IDS.AUTOMACOES,
    label: 'Automações',
    iconKey: 'automacoes',
    defaultTo: '/automacoes?tab=modelos',
    children,
  };
}

export function buildLojaAccordion({ modules }) {
  const children = [];
  if (modules.sales === true) {
    children.push({ id: 'vendas', label: 'Vendas', to: '/loja?tab=vendas', iconKey: 'vendas' });
  }
  if (modules.inventory === true || modules.sales === true) {
    children.push({ id: 'produtos', label: 'Produtos', to: '/loja?tab=produtos', iconKey: 'produtos' });
  }
  if (modules.inventory === true) {
    children.push({ id: 'estoque', label: 'Estoque', to: '/loja?tab=estoque', iconKey: 'estoque' });
  }
  if (children.length === 0) return null;
  return {
    id: NAV_ACCORDION_IDS.LOJA,
    label: 'Loja',
    iconKey: 'loja',
    defaultTo: children[0].to,
    children,
  };
}

export function buildCaixaAccordion() {
  return {
    id: NAV_ACCORDION_IDS.CAIXA,
    label: 'Caixa',
    iconKey: 'caixa',
    defaultTo: '/caixa?tab=movimentacoes',
    children: [
      { id: 'movimentacoes', label: 'Movimentações', to: '/caixa?tab=movimentacoes', iconKey: 'movimentacoes' },
      { id: 'fechamento', label: 'Fechamento', to: '/caixa?tab=fechamento', iconKey: 'fechamento' },
      { id: 'contabilidade', label: 'Contabilidade', to: '/caixa?tab=contabilidade', iconKey: 'contabilidade' },
    ],
  };
}

export function buildRelatoriosAccordion() {
  return {
    id: NAV_ACCORDION_IDS.RELATORIOS,
    label: 'Relatórios',
    iconKey: 'relatorios',
    defaultTo: '/reports?tab=visao-geral',
    children: [
      { id: 'visao-geral', label: 'Visão geral', to: '/reports?tab=visao-geral' },
      { id: 'funil', label: 'Funil', to: '/reports?tab=funil' },
      { id: 'financeiro', label: 'Financeiro', to: '/reports?tab=financeiro' },
      { id: 'loja', label: 'Loja', to: '/reports?tab=loja' },
    ],
  };
}

/**
 * Modelo completo da sidebar desktop.
 */
export function buildSidebarNavModel({
  modules,
  canConfigureAgenteIa,
  pipelineLabel = 'Funil',
  navStudentsLabel = 'Alunos',
  newLeadLabel,
}) {
  const accordions = [];
  const automacoes = buildAutomacoesAccordion({ canConfigureAgenteIa });
  accordions.push(automacoes);

  if (modules.finance === true) {
    accordions.push(buildCaixaAccordion());
  }

  const loja = buildLojaAccordion({ modules });
  if (loja) accordions.push(loja);

  accordions.push(buildRelatoriosAccordion());

  return {
    newLead: newLeadLabel ? { to: '/new-lead', label: newLeadLabel, iconKey: 'newLead', action: true } : null,
    primary: [
      { to: '/', label: 'Início', iconKey: 'inicio', end: true },
      { to: '/pipeline', label: pipelineLabel, iconKey: 'pipeline' },
      { to: '/students', label: navStudentsLabel, iconKey: 'students' },
      { to: '/tarefas', label: 'Tarefas', iconKey: 'tarefas' },
    ],
    atendimento: [{ to: '/inbox', label: 'Conversas', iconKey: 'conversas' }],
    financeDirect:
      modules.finance === true
        ? [
            { to: '/mensalidades', label: 'Mensalidades', iconKey: 'mensalidades' },
            { to: '/contratos', label: 'Contratos', iconKey: 'contratos' },
          ]
        : [],
    accordions,
    footerAccordions: [],
  };
}

/** Achata accordions para o drawer mobile (links com query). */
export function flattenNavItemsForMobile(model) {
  const rows = [];
  const push = (item) => rows.push(item);

  if (model.newLead) push({ ...model.newLead, section: null });
  for (const item of model.primary) push({ ...item, section: null });
  for (const item of model.atendimento) push({ ...item, section: 'Atendimento' });

  push({ to: model.accordions.find((a) => a.id === NAV_ACCORDION_IDS.AUTOMACOES)?.defaultTo || '/automacoes?tab=modelos', label: 'Automações', iconKey: 'automacoes', section: 'Atendimento' });
  const auto = model.accordions.find((a) => a.id === NAV_ACCORDION_IDS.AUTOMACOES);
  if (auto) {
    for (const c of auto.children) {
      push({ to: c.to, label: c.label, iconKey: c.id === 'agente' ? 'agente' : 'automacoes', section: 'Atendimento' });
    }
  }

  if (model.financeDirect.length) {
    for (const item of model.financeDirect) push({ ...item, section: 'Financeiro' });
    const caixa = model.accordions.find((a) => a.id === NAV_ACCORDION_IDS.CAIXA);
    if (caixa) {
      push({ to: caixa.defaultTo, label: 'Caixa', iconKey: 'caixa', section: 'Financeiro' });
      for (const c of caixa.children) push({ ...c, iconKey: c.iconKey || 'caixa', section: 'Financeiro' });
    }
  }

  const loja = model.accordions.find((a) => a.id === NAV_ACCORDION_IDS.LOJA);
  if (loja) {
    push({ to: loja.defaultTo, label: 'Loja', iconKey: 'loja', section: 'Loja' });
    for (const c of loja.children) push({ ...c, iconKey: c.iconKey || 'loja', section: 'Loja' });
  }

  const rel = model.accordions.find((a) => a.id === NAV_ACCORDION_IDS.RELATORIOS);
  if (rel) {
    push({ to: rel.defaultTo, label: 'Relatórios', iconKey: 'reports', section: null });
    for (const c of rel.children) push({ ...c, iconKey: 'reports', section: null });
  }

  return rows;
}

export function buildMobileDrawerSections(opts) {
  const model = buildSidebarNavModel({
    modules: opts.modules,
    canConfigureAgenteIa: opts.canConfigureAgenteIa,
    pipelineLabel: opts.pipelineLabel,
    navStudentsLabel: opts.navStudentsLabel || 'Alunos',
    newLeadLabel: null,
  });
  const flat = flattenNavItemsForMobile(model);
  const sections = [];
  let current = null;
  for (const row of flat) {
    const title = row.section ?? null;
    if (!sections.length || sections[sections.length - 1].title !== title) {
      sections.push({ title, items: [] });
    }
    sections[sections.length - 1].items.push({
      to: row.to.split('?')[0],
      toFull: row.to,
      label: row.label,
      iconKey: row.iconKey,
    });
  }
  return sections;
}
