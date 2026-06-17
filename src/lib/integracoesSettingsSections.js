/** Abas em /integracoes?tab= */
export const INTEGRACOES_SETTINGS_SECTIONS = {
  CATRACA: 'catraca',
  AUTENTIQUE: 'autentique',
};

const VALID = new Set(Object.values(INTEGRACOES_SETTINGS_SECTIONS));

export function isIntegracoesSettingsSection(raw) {
  const id = String(raw || '').trim().toLowerCase();
  return VALID.has(id) ? id : null;
}

export const INTEGRACOES_SETTINGS_ITEMS = [
  {
    id: INTEGRACOES_SETTINGS_SECTIONS.CATRACA,
    label: 'Catraca',
    panelTitle: 'Control iD — catraca',
    hint: 'Reconhecimento facial e liberação de acesso na recepção. Requer hardware e servidor local na academia.',
  },
  {
    id: INTEGRACOES_SETTINGS_SECTIONS.AUTENTIQUE,
    label: 'Autentique',
    panelTitle: 'Autentique — contratos digitais',
    hint: 'Token, webhook e conta para assinatura digital. Configuração opcional fora do fluxo principal do Nave.',
  },
];

export const INTEGRACOES_DEFAULT_SECTION = INTEGRACOES_SETTINGS_SECTIONS.CATRACA;

export function resolveIntegracoesNavState(rawTab) {
  const section = isIntegracoesSettingsSection(rawTab) || INTEGRACOES_DEFAULT_SECTION;
  const meta = INTEGRACOES_SETTINGS_ITEMS.find((item) => item.id === section) || INTEGRACOES_SETTINGS_ITEMS[0];
  return { section, meta };
}
