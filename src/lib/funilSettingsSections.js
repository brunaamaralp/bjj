export const FUNIL_SETTINGS_SECTIONS = {
  ETAPAS: 'etapas',
  PERGUNTAS: 'perguntas',
  ETIQUETAS: 'etiquetas',
  METAS: 'metas',
};

const VALID = new Set(Object.values(FUNIL_SETTINGS_SECTIONS));

const LEGACY = {
  perguntas: FUNIL_SETTINGS_SECTIONS.PERGUNTAS,
};

export function isFunilSettingsSection(raw) {
  const id = String(raw || '').trim().toLowerCase();
  if (VALID.has(id)) return id;
  return LEGACY[id] || null;
}

export const FUNIL_SETTINGS_ITEMS = [
  {
    id: FUNIL_SETTINGS_SECTIONS.ETAPAS,
    label: 'Etapas do funil',
    hint: 'Colunas do Kanban, nomes exibidos e SLA por etapa. Alterações aparecem após salvar.',
  },
  {
    id: FUNIL_SETTINGS_SECTIONS.PERGUNTAS,
    label: 'Perguntas',
    hint: 'Campos extras no perfil do lead e na matrícula.',
  },
  {
    id: FUNIL_SETTINGS_SECTIONS.ETIQUETAS,
    label: 'Etiquetas',
    hint: 'Nomes de menu para leads, alunos, aulas e funil.',
  },
  {
    id: FUNIL_SETTINGS_SECTIONS.METAS,
    label: 'Metas de relatórios',
    hint: 'Metas de conversão, churn e retenção para indicadores RAG nos relatórios.',
  },
];

export const FUNIL_DEFAULT_SECTION = FUNIL_SETTINGS_SECTIONS.ETAPAS;
