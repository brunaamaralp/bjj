/** Labels e seções compartilhadas entre sidebar desktop e drawer mobile. */

export function getNewLeadLabel(leadsLabel = 'Leads') {
  const basePlural = String(leadsLabel || 'Leads').trim();
  const singular =
    basePlural.toLowerCase().endsWith('s') && basePlural.length > 1
      ? basePlural.slice(0, -1)
      : basePlural.toLowerCase();
  return `Novo ${singular.slice(0, 1).toUpperCase() + singular.slice(1)}`;
}

export function buildMobileDrawerSections({
  modules,
  navRole,
  canConfigureAgenteIa,
  myWorkspaceLabel,
  pipelineLabel = 'Funil',
}) {
  const sections = [];

  sections.push({
    title: null,
    items: [
      { to: '/pipeline', label: pipelineLabel, iconKey: 'pipeline' },
      { to: '/tarefas', label: 'Tarefas', iconKey: 'tarefas' },
    ],
  });

  const atendimento = [{ to: '/templates', label: 'Templates', iconKey: 'templates' }];
  if (canConfigureAgenteIa) {
    atendimento.push({ to: '/agente-ia', label: 'Agente IA', iconKey: 'agente' });
  }
  sections.push({ title: 'Atendimento', items: atendimento });

  if (modules.finance === true) {
    const financeItems = [{ to: '/caixa', label: 'Caixa', iconKey: 'caixa' }];
    if (navRole === 'owner') {
      financeItems.push({ to: '/finance', label: 'Contabilidade', iconKey: 'contabilidade' });
    }
    sections.push({ title: 'Financeiro', items: financeItems });
  }

  if (modules.inventory === true || modules.sales === true) {
    const loja = [];
    if (modules.sales === true) {
      loja.push({ to: '/vendas', label: 'Vendas', iconKey: 'vendas' });
    }
    if (modules.inventory === true || modules.sales === true) {
      loja.push({ to: '/produtos', label: 'Produtos', iconKey: 'produtos' });
    }
    if (modules.inventory === true) {
      loja.push({ to: '/estoque', label: 'Estoque', iconKey: 'estoque' });
    }
    if (loja.length > 0) {
      sections.push({ title: 'Loja', items: loja });
    }
  }

  sections.push({
    title: 'Conta & Plataforma',
    items: [
      { to: '/reports', label: 'Relatórios', iconKey: 'reports' },
      { to: '/conta', label: 'Conta', iconKey: 'conta' },
      { to: '/planos', label: 'Planos', iconKey: 'planos' },
      { to: '/empresa', label: myWorkspaceLabel, iconKey: 'empresa' },
    ],
  });

  return sections;
}
