export const ESTUDIO_SETTINGS_SECTIONS = {
  DADOS: 'dados-gerais',
  ENDERECO: 'endereco',
  REDES: 'redes-sociais',
  PERSONALIZACAO: 'personalizacao',
};

const VALID = new Set(Object.values(ESTUDIO_SETTINGS_SECTIONS));

export function isEstudioSettingsSection(raw) {
  const id = String(raw || '').trim().toLowerCase();
  return VALID.has(id) ? id : null;
}

export const ESTUDIO_SETTINGS_ITEMS = [
  {
    id: ESTUDIO_SETTINGS_SECTIONS.DADOS,
    label: 'Dados gerais',
    hint: 'Nome, contato e dados fiscais da academia.',
  },
  {
    id: ESTUDIO_SETTINGS_SECTIONS.ENDERECO,
    label: 'Endereço',
    hint: 'Localização exibida em comunicações e cadastros.',
  },
  {
    id: ESTUDIO_SETTINGS_SECTIONS.REDES,
    label: 'Redes sociais',
    hint: 'Links públicos da sua presença online.',
  },
  {
    id: ESTUDIO_SETTINGS_SECTIONS.PERSONALIZACAO,
    label: 'Personalização',
    hint: 'Tipo de negócio, horários rápidos e rótulos do sistema.',
  },
];

export const ESTUDIO_DEFAULT_SECTION = ESTUDIO_SETTINGS_SECTIONS.DADOS;
