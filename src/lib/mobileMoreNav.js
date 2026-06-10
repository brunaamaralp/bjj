import {
  buildSidebarNavModel,
  isStudentProfilePath,
  isLeadProfilePath,
  matchNavTarget,
  NAV_ACCORDION_IDS,
} from './naviMenu.js';

function isFinanceiroHubPath(pathname) {
  const p = String(pathname || '');
  return p === '/financeiro' || p === '/caixa' || p === '/finance';
}

/**
 * Rotas cobertas pelos 3 slots fixos da bottom nav (Hoje, Conversas, Alunos).
 */
export function isBottomNavPrimaryRoute(pathname) {
  const p = String(pathname || '');
  if (p === '/') return true;
  if (p === '/inbox') return true;
  if (p === '/students' || p === '/alunos') return true;
  if (isStudentProfilePath(p)) return true;
  return false;
}

/** Slot "Mais" ativo quando a rota atual não é Hoje, Conversas nem Alunos. */
export function isBottomNavMaisActive(pathname) {
  return !isBottomNavPrimaryRoute(pathname);
}

/**
 * @param {{
 * modules: { finance?: boolean, sales?: boolean, inventory?: boolean },
 * isOwner: boolean,
 * pipelineLabel?: string,
 * navStudentsLabel?: string
 * }} opts
 */
export function buildMobileMoreItems({
  modules,
  isOwner,
  pipelineLabel = 'Funil',
  navStudentsLabel = 'Alunos',
}) {
  const model = buildSidebarNavModel({
    modules: modules || {},
    canConfigureAgenteIa: true,
    pipelineLabel,
    navStudentsLabel,
    newLeadLabel: null,
    isOwner,
  });

  const items = [];
  const add = (item) => items.push(item);

  add({ id: 'pipeline', label: model.primary[1]?.label || pipelineLabel, to: '/pipeline', iconKey: 'pipeline' });
  add({ id: 'tarefas', label: model.primary[3]?.label || 'Tarefas', to: '/tarefas', iconKey: 'tarefas' });

  const financeiro = model.accordions.find((a) => a.id === NAV_ACCORDION_IDS.FINANCEIRO);
  if (financeiro) {
    add({
      id: 'financeiro',
      label: financeiro.label,
      to: financeiro.defaultTo,
      iconKey: financeiro.iconKey || 'financeiro',
    });
  }

  const loja = model.accordions.find((a) => a.id === NAV_ACCORDION_IDS.LOJA);
  if (loja) {
    add({
      id: 'loja',
      label: loja.label,
      to: loja.defaultTo || '/loja',
      iconKey: loja.iconKey || 'loja',
    });
  }

  const relatorios = loja?.children?.find((c) => c.id === 'relatorios');
  if (relatorios) {
    add({
      id: 'reports',
      label: relatorios.label,
      to: relatorios.to,
      iconKey: relatorios.iconKey || 'relatorios',
    });
  }

  const automacoes = model.accordions.find((a) => a.id === NAV_ACCORDION_IDS.AUTOMACOES);
  if (automacoes) {
    add({
      id: 'automacoes',
      label: automacoes.label,
      to: automacoes.defaultTo,
      iconKey: automacoes.iconKey || 'automacoes',
    });
  }

  add({ id: 'empresa', label: 'Minha academia', to: '/empresa', iconKey: 'empresa' });

  if (isOwner) {
    add({ id: 'equipe', label: 'Equipe', to: '/equipe', iconKey: 'equipe' });
    add({ id: 'integracoes', label: 'Integrações', to: '/integracoes', iconKey: 'integracoes' });
  }

  return items;
}

/**
 * Destaque do item dentro do sheet "Mais".
 */
export function isMobileMoreItemActive(item, location) {
  const id = String(item?.id || '');
  const loc = {
    pathname: String(location?.pathname || ''),
    search: location?.search || '',
  };

  if (id === 'pipeline') {
    return matchNavTarget('/pipeline', loc) || isLeadProfilePath(loc.pathname);
  }
  if (id === 'tarefas') return loc.pathname === '/tarefas';
  if (id === 'financeiro') {
    return isFinanceiroHubPath(loc.pathname) || loc.pathname === '/mensalidades';
  }
  if (id === 'loja') {
    return (
      loc.pathname === '/loja' ||
      loc.pathname === '/vendas' ||
      loc.pathname === '/produtos' ||
      loc.pathname === '/estoque'
    );
  }
  if (id === 'reports') return loc.pathname === '/reports';
  if (id === 'automacoes') {
    return loc.pathname === '/automacoes' || loc.pathname === '/agente-ia';
  }
  if (id === 'empresa') return loc.pathname === '/empresa';
  if (id === 'equipe') return loc.pathname === '/equipe';
  if (id === 'integracoes') return loc.pathname === '/integracoes';

  return matchNavTarget(item.to, loc);
}
