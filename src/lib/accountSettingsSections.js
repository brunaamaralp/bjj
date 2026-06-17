/** Abas em /conta?tab= */
export const ACCOUNT_SETTINGS_SECTIONS = {
  PERFIL: 'perfil',
  ASSINATURA: 'assinatura',
  DADOS: 'dados',
};

const VALID = new Set(Object.values(ACCOUNT_SETTINGS_SECTIONS));

const LEGACY_TAB_ALIASES = {
  seguranca: ACCOUNT_SETTINGS_SECTIONS.PERFIL,
};

export function isAccountSettingsSection(raw) {
  const id = String(raw || '').trim().toLowerCase();
  if (VALID.has(id)) return id;
  return LEGACY_TAB_ALIASES[id] || null;
}

export const ACCOUNT_SETTINGS_ITEMS = [
  {
    id: ACCOUNT_SETTINGS_SECTIONS.PERFIL,
    label: 'Perfil',
    panelTitle: 'Perfil',
    hint: 'Seu nome, e-mail e senha de acesso ao Nave.',
  },
  {
    id: ACCOUNT_SETTINGS_SECTIONS.ASSINATURA,
    label: 'Assinatura',
    panelTitle: 'Assinatura e plano',
    hint: 'Plano do Nave, faturas e cancelamento — por academia; só o titular pode alterar.',
  },
  {
    id: ACCOUNT_SETTINGS_SECTIONS.DADOS,
    label: 'Avançado',
    panelTitle: 'Avançado',
    hint: 'Exportar dados, reexibir checklist e ações irreversíveis da academia.',
  },
];

export const ACCOUNT_DEFAULT_SECTION = ACCOUNT_SETTINGS_SECTIONS.PERFIL;

export function resolveAccountNavState(rawTab) {
  const section = isAccountSettingsSection(rawTab) || ACCOUNT_DEFAULT_SECTION;
  const meta = ACCOUNT_SETTINGS_ITEMS.find((item) => item.id === section) || ACCOUNT_SETTINGS_ITEMS[0];
  return { section, meta };
}
