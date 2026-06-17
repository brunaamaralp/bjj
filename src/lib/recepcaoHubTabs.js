/** Abas do hub Recepção (rota canônica `/`). */

export const RECEPCAO_TAB_EXPERIMENTAIS = 'experimentais';
export const RECEPCAO_TAB_CATRACA = 'catraca';

export const RECEPCAO_HUB_TABS = [
  { id: RECEPCAO_TAB_EXPERIMENTAIS, label: 'Experimentais' },
  { id: RECEPCAO_TAB_CATRACA, label: 'Catraca' },
];

const LEGACY_TAB_ALIASES = {
  porta: RECEPCAO_TAB_CATRACA,
  retornos: RECEPCAO_TAB_EXPERIMENTAIS,
};

/** @param {string | null | undefined} tab */
export function resolveRecepcaoHubTab(tab) {
  const t = String(tab || '').trim().toLowerCase();
  if (LEGACY_TAB_ALIASES[t]) return LEGACY_TAB_ALIASES[t];
  if (t === RECEPCAO_TAB_CATRACA) return RECEPCAO_TAB_CATRACA;
  return RECEPCAO_TAB_EXPERIMENTAIS;
}

/** @param {string | null | undefined} section */
export function isRecepcaoCatracaHistoricoSection(section) {
  return String(section || '').trim().toLowerCase() === 'historico';
}

/**
 * @param {{ followUpCount?: number }} [opts]
 */
export function buildRecepcaoHubTabItems({ followUpCount = 0 } = {}) {
  const count = Number(followUpCount) > 0 ? Number(followUpCount) : 0;
  return RECEPCAO_HUB_TABS.map((tab) => {
    const badgeCount =
      tab.id === RECEPCAO_TAB_EXPERIMENTAIS && count > 0 ? count : undefined;
    return {
      id: tab.id,
      label: tab.label,
      badgeCount,
      badgeAriaLabel:
        badgeCount && tab.id === RECEPCAO_TAB_EXPERIMENTAIS
          ? `${badgeCount} retorno(s) pendente(s)`
          : undefined,
    };
  });
}

/** Destino canônico para redirects de `/recepcao`. */
export function buildRecepcaoLegacyRedirectPath({ historico = false } = {}) {
  const params = new URLSearchParams();
  params.set('tab', RECEPCAO_TAB_CATRACA);
  if (historico) params.set('section', 'historico');
  return `/?${params.toString()}`;
}
