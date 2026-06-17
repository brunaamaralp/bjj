/** Slugs em /tarefas?tab=processos&section= */
export const PROCESSOS_SETTINGS_SECTIONS = {
  TEMPLATES: 'templates',
  PLAYBOOK: 'playbook',
  MATRICULA_LEGADO: 'matricula-legado',
};

const VALID = new Set(Object.values(PROCESSOS_SETTINGS_SECTIONS));

export const PROCESSOS_DEFAULT_SECTION = PROCESSOS_SETTINGS_SECTIONS.TEMPLATES;

export function isProcessosSettingsSection(raw) {
  const id = String(raw || '').trim().toLowerCase();
  return VALID.has(id) ? id : null;
}

export const PROCESSOS_SETTINGS_ITEMS = [
  {
    id: PROCESSOS_SETTINGS_SECTIONS.TEMPLATES,
    label: 'Templates de tarefas',
    shortLabel: 'Templates',
    panelTitle: 'Templates de tarefas',
    hint: 'Checklists automáticos ao matricular ou desligar aluno — gatilhos Matrícula e Desligamento.',
  },
  {
    id: PROCESSOS_SETTINGS_SECTIONS.PLAYBOOK,
    label: 'Após a experimental',
    shortLabel: 'Playbook',
    panelTitle: 'Acompanhamento após a experimental',
    hint: 'Próximas ações sugeridas em Follow-ups pendentes — compareceu ou faltou na aula experimental.',
  },
];

export const PROCESSOS_LEGADO_ITEM = {
  id: PROCESSOS_SETTINGS_SECTIONS.MATRICULA_LEGADO,
  label: 'Tarefa pós-matrícula (legado)',
  shortLabel: 'Legado',
  panelTitle: 'Tarefa pós-matrícula (legado)',
  hint: 'Configuração antiga fora dos templates — migre para um template com gatilho Matrícula.',
};

export function buildProcessosSettingsNavItems({ showLegado = false } = {}) {
  if (!showLegado) return [...PROCESSOS_SETTINGS_ITEMS];
  return [...PROCESSOS_SETTINGS_ITEMS, PROCESSOS_LEGADO_ITEM];
}

export function resolveProcessosNavState(rawSection, { showLegado = false } = {}) {
  const items = buildProcessosSettingsNavItems({ showLegado });
  const validIds = new Set(items.map((i) => i.id));
  const section = isProcessosSettingsSection(rawSection);
  const activeSection =
    section && validIds.has(section) ? section : PROCESSOS_DEFAULT_SECTION;
  const meta = items.find((i) => i.id === activeSection) || PROCESSOS_SETTINGS_ITEMS[0];
  return { section: activeSection, meta, items };
}
