export const CONFIGURACOES_SECTIONS = {
  ACADEMIA: 'academia',
  CRM: 'crm',
  ALUNOS_AULAS: 'alunos-aulas',
  INTEGRACOES: 'integracoes',
  FINANCEIRO: 'financeiro',
};

const VALID = new Set(Object.values(CONFIGURACOES_SECTIONS));

export const CONFIGURACOES_ITEMS = [
  {
    id: CONFIGURACOES_SECTIONS.ACADEMIA,
    label: 'Academia',
    hint: 'Dados gerais, endereço, redes e personalização.',
  },
  {
    id: CONFIGURACOES_SECTIONS.CRM,
    label: 'CRM',
    hint: 'Funil, perguntas, etiquetas e metas.',
  },
  {
    id: CONFIGURACOES_SECTIONS.ALUNOS_AULAS,
    label: 'Alunos e aulas',
    hint: 'Matrícula, graduações, turmas e horários.',
  },
  {
    id: CONFIGURACOES_SECTIONS.INTEGRACOES,
    label: 'Integrações',
    hint: 'WhatsApp, catraca e assinatura digital.',
  },
  {
    id: CONFIGURACOES_SECTIONS.FINANCEIRO,
    label: 'Financeiro',
    hint: 'Planos, regras e parâmetros financeiros.',
  },
];

export const CONFIGURACOES_DEFAULT_SECTION = CONFIGURACOES_SECTIONS.ACADEMIA;

export function isConfiguracoesSection(raw) {
  const id = String(raw || '').trim().toLowerCase();
  return VALID.has(id) ? id : null;
}

export function resolveConfiguracoesNavState(rawTab) {
  const section = isConfiguracoesSection(rawTab) || CONFIGURACOES_DEFAULT_SECTION;
  const meta = CONFIGURACOES_ITEMS.find((item) => item.id === section) || CONFIGURACOES_ITEMS[0];
  return { section, meta };
}
