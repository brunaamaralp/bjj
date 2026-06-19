/** Abas do hub Recepção (rota canônica `/`). */

import { followupPendingCountLabel } from './dashboardReceptionCopy.js';

export const RECEPCAO_TAB_EXPERIMENTAIS = 'experimentais';
export const RECEPCAO_TAB_CATRACA = 'catraca';

export const RECEPCAO_CATRACA_SECTION_LIVE = 'live';
export const RECEPCAO_CATRACA_SECTION_HISTORICO = 'historico';
export const RECEPCAO_CATRACA_SECTION_RETENCAO = 'retencao';

export const RECEPCAO_HUB_TABS = [
  { id: RECEPCAO_TAB_EXPERIMENTAIS, label: 'Agenda' },
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
export function resolveRecepcaoCatracaSection(section) {
  const s = String(section || '').trim().toLowerCase();
  if (s === RECEPCAO_CATRACA_SECTION_HISTORICO) return RECEPCAO_CATRACA_SECTION_HISTORICO;
  if (s === RECEPCAO_CATRACA_SECTION_RETENCAO) return RECEPCAO_CATRACA_SECTION_RETENCAO;
  return RECEPCAO_CATRACA_SECTION_LIVE;
}

/** @param {string | null | undefined} section */
export function isRecepcaoCatracaHistoricoSection(section) {
  return resolveRecepcaoCatracaSection(section) === RECEPCAO_CATRACA_SECTION_HISTORICO;
}

/** @param {string | null | undefined} section */
export function isRecepcaoCatracaRetencaoSection(section) {
  return resolveRecepcaoCatracaSection(section) === RECEPCAO_CATRACA_SECTION_RETENCAO;
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
          ? followupPendingCountLabel(badgeCount)
          : undefined,
    };
  });
}

/** Destino canônico para redirects de `/recepcao`. */
export function buildRecepcaoLegacyRedirectPath({ historico = false, retencao = false, section } = {}) {
  const params = new URLSearchParams();
  params.set('tab', RECEPCAO_TAB_CATRACA);
  const sec =
    section ||
    (historico ? RECEPCAO_CATRACA_SECTION_HISTORICO : retencao ? RECEPCAO_CATRACA_SECTION_RETENCAO : null);
  if (sec && sec !== RECEPCAO_CATRACA_SECTION_LIVE) {
    params.set('section', sec);
  }
  return `/?${params.toString()}`;
}

/** Link canônico para a fila operacional de retenção. */
export function buildRecepcaoRetencaoPath() {
  return buildRecepcaoLegacyRedirectPath({ retencao: true });
}
