import { matchPath } from 'react-router-dom';
import { FINANCEIRO_SECTIONS } from './financeiroHubTabs.js';

/** Labels e estrutura compartilhada entre sidebar desktop e drawer mobile. */

export const NAV_ACCORDION_IDS = {
  AUTOMACOES: 'automacoes',
  LOJA: 'loja',
  /** @deprecated use FINANCEIRO */
  CAIXA: 'financeiro',
  FINANCEIRO: 'financeiro',
  RELATORIOS: 'relatorios',
};

const FINANCEIRO_HUB_PATH = '/financeiro';

/** Rótulo de grupo na sidebar (ex-"Caixa"). */
export const FINANCEIRO_NAV_GROUP_OPERACOES = 'Operações';

/** @typedef {{ id: string, label: string, to: string, iconKey?: string, requireAgent?: boolean, group?: string | null }} NavChildItem */
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

export function isLeadProfilePath(pathname) {
  return Boolean(matchPath({ path: '/lead/:id', end: true }, String(pathname || '')));
}

export function isStudentProfilePath(pathname) {
  return Boolean(matchPath({ path: '/student/:id', end: true }, String(pathname || '')));
}

/**
 * Destaque de item da sidebar / drawer (inclui perfis com :id).
 * @param {string} to — destino do link (path ou path?query)
 * @param {{ pathname: string, search?: string }} location
 */
export function isSidebarNavItemActive(to, location) {
  const raw = String(to || '').trim();
  const qIndex = raw.indexOf('?');
  const pathOnly = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
  const loc = {
    pathname: String(location?.pathname || ''),
    search: location?.search || '',
  };

  if (pathOnly === '/pipeline') {
    return matchNavTarget(to, loc) || isLeadProfilePath(loc.pathname);
  }
  if (pathOnly === '/students' || pathOnly === '/alunos') {
    const onStudentsHub = loc.pathname === '/students' || loc.pathname === '/alunos';
    if (onStudentsHub) return true;
    return isStudentProfilePath(loc.pathname);
  }
  return matchNavTarget(to, loc);
}

/** Rotas diretas (sem accordion) — ao navegar aqui, accordions devem fechar. */
const DIRECT_NAV_PATHS = new Set([
  '/',
  '/pipeline',
  '/students',
  '/alunos',
  '/tarefas',
  '/inbox',
  '/new-lead',
  '/lead',
  '/student',
  '/presenca',
  '/recepcao',
]);

export function isDirectNavPath(pathname) {
  const p = String(pathname || '');
  if (DIRECT_NAV_PATHS.has(p)) return true;
  if (p.startsWith('/lead/') || p.startsWith('/student/')) return true;
  return false;
}

function isFinanceiroHubPath(pathname) {
  return pathname === FINANCEIRO_HUB_PATH || pathname === '/caixa' || pathname === '/finance';
}

/**
 * Retorna id do accordion que deve estar aberto para a rota atual (ou null).
 */
export function getAccordionIdForLocation({ pathname, search }) {
  const p = String(pathname || '');
  if (p === '/automacoes' || p === '/agente-ia') return NAV_ACCORDION_IDS.AUTOMACOES;
  if (p === '/equipe' || p === '/integracoes') return null;
  if (p === '/loja' || p === '/vendas' || p === '/produtos' || p === '/estoque') return NAV_ACCORDION_IDS.LOJA;
  if (isFinanceiroHubPath(p)) return NAV_ACCORDION_IDS.FINANCEIRO;
  if (p === '/reports') return NAV_ACCORDION_IDS.RELATORIOS;
  return null;
}

export function isAccordionChildActive(child, location) {
  if (child.action) return false;
  if (child.id === 'agente' && location.pathname === '/agente-ia') return true;
  if (child.id === 'mensalidades') {
    if (location.pathname === '/mensalidades') return true;
    if (isFinanceiroHubPath(location.pathname)) {
      const tab = String(new URLSearchParams(location.search || '').get('tab') || '').toLowerCase();
      return tab === FINANCEIRO_SECTIONS.MENSALIDADES;
    }
  }
  if (isFinanceiroHubPath(location.pathname)) {
    const tab = String(new URLSearchParams(location.search || '').get('tab') || '').toLowerCase();
    if (child.id === 'visao-geral') return tab === FINANCEIRO_SECTIONS.OVERVIEW || !tab;
    if (child.id === 'mensalidades') return tab === FINANCEIRO_SECTIONS.MENSALIDADES;
    if (child.id === 'extrato') return tab === 'extrato' || tab === 'razao';
    if (child.group === 'Contabilidade') return child.id === tab;
    if (child.group === FINANCEIRO_NAV_GROUP_OPERACOES) return child.id === tab;
  }
  return matchNavTarget(child.to, location);
}

export function isAccordionParentPartial(accordion, location) {
  return accordion.children.some((c) => isAccordionChildActive(c, location));
}

export function buildAutomacoesAccordion({ canConfigureAgenteIa }) {
  const children = [
    { id: 'processos', label: 'Processos', to: '/automacoes?tab=processos' },
    { id: 'modelos', label: 'Modelos de Mensagem', to: '/automacoes?tab=modelos' },
    { id: 'configuracoes', label: 'Configurações', to: '/automacoes?tab=configuracoes' },
  ];
  if (canConfigureAgenteIa) {
    children.push({
      id: 'agente',
      label: 'Agente de Atendimento',
      to: '/agente-ia',
    });
  }
  return {
    id: NAV_ACCORDION_IDS.AUTOMACOES,
    label: 'Automações',
    iconKey: 'automacoes',
    defaultTo: '/automacoes?tab=processos',
    children,
  };
}

export const NOVA_VENDA_MENU_ACTION = 'openNovaVendaModal';

export function buildLojaAccordion({ modules }) {
  const children = [];
  if (modules.sales === true) {
    children.push({
      id: 'nova-venda',
      label: 'Nova venda',
      iconKey: 'novaVenda',
      action: NOVA_VENDA_MENU_ACTION,
    });
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
    label: 'Vendas',
    iconKey: 'loja',
    defaultTo: children[0].to,
    children,
  };
}

/**
 * Accordion do hub Financeiro (/financeiro).
 * @param {{ isOwner?: boolean, financeModule?: boolean }} opts
 */
export function buildFinanceiroAccordion({ isOwner = true, financeModule = true } = {}) {
  const children = [
    {
      id: 'visao-geral',
      label: 'Visão Geral',
      to: `${FINANCEIRO_HUB_PATH}?tab=${FINANCEIRO_SECTIONS.OVERVIEW}`,
      iconKey: 'visaoGeralFinanceiro',
    },
    {
      id: 'mensalidades',
      label: 'Mensalidades',
      to: `${FINANCEIRO_HUB_PATH}?tab=${FINANCEIRO_SECTIONS.MENSALIDADES}`,
      iconKey: 'mensalidades',
    },
    {
      id: 'movimentacoes',
      label: 'Lançamentos',
      to: `${FINANCEIRO_HUB_PATH}?tab=movimentacoes`,
      iconKey: 'movimentacoes',
      group: FINANCEIRO_NAV_GROUP_OPERACOES,
    },
  ];

  if (financeModule) {
    children.push(
      {
        id: 'previsao',
        label: 'Previsão',
        to: `${FINANCEIRO_HUB_PATH}?tab=previsao`,
        iconKey: 'previsao',
        group: FINANCEIRO_NAV_GROUP_OPERACOES,
      },
      {
        id: 'fechamento',
        label: 'Conferência do mês',
        to: `${FINANCEIRO_HUB_PATH}?tab=fechamento`,
        iconKey: 'fechamento',
        group: FINANCEIRO_NAV_GROUP_OPERACOES,
      }
    );
  }

  if (isOwner && financeModule) {
    children.push(
      {
        id: 'conciliacao',
        label: 'Conciliação',
        to: `${FINANCEIRO_HUB_PATH}?tab=conciliacao`,
        iconKey: 'conciliacao',
        group: FINANCEIRO_NAV_GROUP_OPERACOES,
      },
      {
        id: 'extrato',
        label: 'Extrato contábil',
        to: `${FINANCEIRO_HUB_PATH}?tab=extrato`,
        iconKey: 'extratoContabil',
        group: FINANCEIRO_NAV_GROUP_OPERACOES,
      }
    );
  }

  return {
    id: NAV_ACCORDION_IDS.FINANCEIRO,
    label: 'Financeiro',
    iconKey: 'financeiro',
    defaultTo: `${FINANCEIRO_HUB_PATH}?tab=${FINANCEIRO_SECTIONS.OVERVIEW}`,
    children,
  };
}

/**
 * Accordion Relatórios — mesmas abas e filtros que Reports.jsx (reportTabItems).
 * @param {{ modules?: { finance?: boolean, sales?: boolean, inventory?: boolean } }} opts
 */
export function buildRelatoriosAccordion({ modules = {} } = {}) {
  const hasFinance = modules.finance === true;
  const hasSales = modules.sales === true;
  const hasInventory = modules.inventory === true;

  const base = [
    { id: 'visao-geral', label: 'Visão geral', to: '/reports?tab=visao-geral' },
    { id: 'funil', label: 'Análise do Funil', to: '/reports?tab=funil' },
    { id: 'alunos', label: 'Alunos', to: '/reports?tab=alunos' },
    { id: 'financeiro', label: 'Financeiro', to: '/reports?tab=financeiro' },
    { id: 'loja', label: 'Vendas', to: '/reports?tab=loja' },
    { id: 'estoque', label: 'Estoque', to: '/reports?tab=estoque' },
    { id: 'movimentacoes', label: 'Movimentações', to: '/reports?tab=movimentacoes' },
    { id: 'operador', label: 'Por Operador', to: '/reports?tab=operador' },
  ];

  const children = base.filter((t) => {
    if (t.id === 'financeiro') return hasFinance;
    if (t.id === 'loja') return hasSales;
    if (t.id === 'estoque' || t.id === 'movimentacoes') return hasInventory;
    if (t.id === 'operador') return hasSales;
    return true;
  });

  return {
    id: NAV_ACCORDION_IDS.RELATORIOS,
    label: 'Relatórios',
    iconKey: 'relatorios',
    defaultTo: '/reports?tab=visao-geral',
    children,
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
  isOwner = true,
}) {
  const accordions = [];
  const automacoes = buildAutomacoesAccordion({ canConfigureAgenteIa });
  accordions.push(automacoes);

  if (modules.finance === true) {
    accordions.push(
      buildFinanceiroAccordion({ isOwner, financeModule: modules.finance === true })
    );
  }

  const loja = buildLojaAccordion({ modules });
  if (loja) accordions.push(loja);

  accordions.push(buildRelatoriosAccordion({ modules }));

  return {
    newLead: newLeadLabel ? { to: '/new-lead', label: newLeadLabel, iconKey: 'newLead', action: true } : null,
    primary: [
      { to: '/', label: 'Hoje', iconKey: 'inicio', end: true },
      { to: '/pipeline', label: pipelineLabel, iconKey: 'pipeline' },
      { to: '/students', label: navStudentsLabel, iconKey: 'students' },
      { to: '/tarefas', label: 'Tarefas', iconKey: 'tarefas' },
    ],
    atendimento: [{ to: '/inbox', label: 'Conversas', iconKey: 'conversas' }],
    financeDirect: [],
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

  push({ to: model.accordions.find((a) => a.id === NAV_ACCORDION_IDS.AUTOMACOES)?.defaultTo || '/automacoes?tab=processos', label: 'Automações', iconKey: 'automacoes', section: 'Atendimento' });
  const auto = model.accordions.find((a) => a.id === NAV_ACCORDION_IDS.AUTOMACOES);
  if (auto) {
    for (const c of auto.children) {
      push({
        ...c,
        iconKey: c.iconKey || (c.id === 'agente' ? 'agente' : 'automacoes'),
        section: 'Atendimento',
      });
    }
  }

  const financeiro = model.accordions.find((a) => a.id === NAV_ACCORDION_IDS.FINANCEIRO);
  if (financeiro) {
    for (const c of financeiro.children) {
      push({
        ...c,
        iconKey: c.iconKey || 'financeiro',
        section: 'Financeiro',
      });
    }
  }

  const loja = model.accordions.find((a) => a.id === NAV_ACCORDION_IDS.LOJA);
  if (loja) {
    for (const c of loja.children) {
      push({
        ...c,
        iconKey: c.iconKey || 'loja',
        section: 'Vendas',
        to: c.to || (c.action === NOVA_VENDA_MENU_ACTION ? '/loja' : '/loja'),
      });
    }
  }

  const rel = model.accordions.find((a) => a.id === NAV_ACCORDION_IDS.RELATORIOS);
  if (rel) {
    push({ to: rel.defaultTo, label: rel.label, iconKey: rel.iconKey || 'relatorios', section: null });
    for (const c of rel.children) push({ ...c, iconKey: c.iconKey || rel.iconKey || 'relatorios', section: null });
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
    isOwner: opts.isOwner !== false,
  });
  const flat = flattenNavItemsForMobile(model);
  const sections = [];
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
