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

  const atendimento = [{ to: '/automacoes', label: 'Automações', iconKey: 'automacoes' }];
  if (canConfigureAgenteIa) {
    atendimento.push({ to: '/agente-ia', label: 'Agente IA', iconKey: 'agente' });
  }
  sections.push({ title: 'Atendimento', items: atendimento });

  if (modules.finance === true) {
    sections.push({
      title: 'Financeiro',
      items: [
        { to: '/mensalidades', label: 'Mensalidades', iconKey: 'mensalidades' },
        { to: '/contratos', label: 'Contratos', iconKey: 'contratos' },
        { to: '/caixa', label: 'Caixa', iconKey: 'caixa' },
      ],
    });
  }

  if (modules.inventory === true || modules.sales === true) {
    sections.push({
      title: 'Loja',
      items: [{ to: '/loja', label: 'Loja', iconKey: 'loja' }],
    });
  }

  sections.push({
    title: null,
    items: [{ to: '/reports', label: 'Relatórios', iconKey: 'reports' }],
  });

  return sections;
}
