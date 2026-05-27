import { isStudentProfilePath, isLeadProfilePath, matchNavTarget } from './naviMenu.js';

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
 * @param {{ modules: { finance?: boolean, sales?: boolean, inventory?: boolean }, isOwner: boolean, pipelineLabel?: string }} opts
 */
export function buildMobileMoreItems({ modules, isOwner, pipelineLabel = 'Funil' }) {
  const items = [
    { id: 'pipeline', label: pipelineLabel, to: '/pipeline', iconKey: 'pipeline' },
    { id: 'tarefas', label: 'Tarefas', to: '/tarefas', iconKey: 'tarefas' },
  ];

  if (modules?.finance === true) {
    items.push(
      { id: 'mensalidades', label: 'Mensalidades', to: '/financeiro?tab=mensalidades', iconKey: 'mensalidades' },
      { id: 'financeiro', label: 'Financeiro', to: '/financeiro', iconKey: 'financeiro' }
    );
  }

  if (modules?.sales === true || modules?.inventory === true) {
    items.push({ id: 'loja', label: 'Vendas', to: '/loja', iconKey: 'loja' });
  }

  items.push(
    { id: 'reports', label: 'Relatórios', to: '/reports', iconKey: 'reports' },
    { id: 'automacoes', label: 'Automações', to: '/automacoes', iconKey: 'automacoes' },
    { id: 'empresa', label: 'Minha academia', to: '/empresa', iconKey: 'empresa' }
  );

  if (isOwner) {
    items.push(
      { id: 'equipe', label: 'Equipe', to: '/equipe', iconKey: 'equipe' },
      { id: 'integracoes', label: 'Integrações', to: '/integracoes', iconKey: 'integracoes' }
    );
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
  if (id === 'mensalidades') {
    if (loc.pathname === '/mensalidades') return true;
    if (loc.pathname === '/financeiro' || loc.pathname === '/caixa') {
      const tab = String(new URLSearchParams(loc.search).get('tab') || '').toLowerCase();
      return tab === 'mensalidades';
    }
    return false;
  }
  if (id === 'financeiro') {
    if (loc.pathname === '/mensalidades') return false;
    return isFinanceiroHubPath(loc.pathname);
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
