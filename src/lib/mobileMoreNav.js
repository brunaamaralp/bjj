import {
  buildSidebarNavModel,
  isStudentProfilePath,
  isLeadProfilePath,
  matchNavTarget,
  NAV_ACCORDION_IDS,
  NOVO_LANCAMENTO_MENU_ACTION,
} from './naviMenu.js';

function isFinanceiroHubPath(pathname) {
  const p = String(pathname || '');
  return p === '/financeiro' || p === '/caixa' || p === '/finance';
}

/**
 * Rotas cobertas pelos 3 slots fixos da bottom nav (Recepção, Conversas, Alunos).
 */
export function isBottomNavPrimaryRoute(pathname) {
  const p = String(pathname || '');
  if (p === '/') return true;
  if (p === '/inbox') return true;
  if (p === '/students' || p === '/alunos') return true;
  if (isStudentProfilePath(p)) return true;
  return false;
}

/** Slot "Mais" ativo quando a rota atual não é Recepção, Conversas nem Alunos. */
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
  canConfigureAgenteIa = true,
  pipelineLabel = 'Funil',
  navStudentsLabel = 'Alunos',
  waSetupDone = true,
}) {
  const model = buildSidebarNavModel({
    modules: modules || {},
    canConfigureAgenteIa,
    pipelineLabel,
    navStudentsLabel,
    newLeadLabel: null,
    isOwner,
    waSetupDone,
  });

  const items = [];
  const add = (item) => items.push(item);

  add({ id: 'pipeline', label: model.primary[1]?.label || pipelineLabel, to: '/pipeline', iconKey: 'pipeline' });
  add({ id: 'tarefas', label: model.primary[3]?.label || 'Tarefas', to: '/tarefas', iconKey: 'tarefas' });

  const financeiro = model.accordions.find((a) => a.id === NAV_ACCORDION_IDS.FINANCEIRO);
  if (financeiro) {
    for (const child of financeiro.children) {
      add({
        id: `financeiro-${child.id}`,
        label: child.label,
        to: child.to || financeiro.defaultTo,
        iconKey: child.iconKey || 'financeiro',
        action: child.action,
      });
    }
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

  for (const rel of model.analise || []) {
    add({
      id: 'reports',
      label: rel.label,
      to: rel.to,
      iconKey: rel.iconKey || 'relatorios',
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

  if (model.conectarWhatsApp) {
    add({
      id: model.conectarWhatsApp.id,
      label: model.conectarWhatsApp.label,
      to: model.conectarWhatsApp.to,
      iconKey: model.conectarWhatsApp.iconKey || 'whatsapp',
    });
  }

  if (model.agenteIa) {
    add({
      id: model.agenteIa.id,
      label: model.agenteIa.label,
      to: model.agenteIa.to,
      iconKey: model.agenteIa.iconKey || 'agente',
    });
  }

  add({ id: 'configuracoes', label: 'Configurações', to: '/configuracoes', iconKey: 'empresa' });

  if (isOwner) {
    add({ id: 'equipe', label: 'Equipe', to: '/equipe', iconKey: 'equipe' });
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
  if (id.startsWith('financeiro-')) {
    if (item.action === NOVO_LANCAMENTO_MENU_ACTION) {
      return (
        isFinanceiroHubPath(loc.pathname) &&
        new URLSearchParams(loc.search || '').get('new') === '1'
      );
    }
    return matchNavTarget(item.to, loc) || (id === 'financeiro-a-receber' && loc.pathname === '/mensalidades');
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
  if (id === 'automacoes') return loc.pathname === '/automacoes';
  if (id === 'agente') return loc.pathname === '/agente-ia';
  if (id === 'conectar-whatsapp') return matchNavTarget('/integracoes?tab=whatsapp', loc);
  if (id === 'configuracoes') return loc.pathname === '/configuracoes' || loc.pathname === '/empresa';
  if (id === 'equipe') return loc.pathname === '/equipe';

  return matchNavTarget(item.to, loc);
}
