/** Abas do hub Recepção (rota canônica `/`). */

import { followupPendingCountLabel } from './dashboardReceptionCopy.js';

export const RECEPCAO_TAB_EXPERIMENTAIS = 'experimentais';
export const RECEPCAO_TAB_CATRACA = 'catraca';

export const RECEPCAO_CATRACA_SECTION_LIVE = 'live';
export const RECEPCAO_CATRACA_SECTION_HISTORICO = 'historico';
export const RECEPCAO_CATRACA_SECTION_RETENCAO = 'retencao';

export const RECEPCAO_HUB_TABS = [
  { id: RECEPCAO_TAB_EXPERIMENTAIS, label: 'Comercial' },
  { id: RECEPCAO_TAB_CATRACA, label: 'Presença' },
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

function presenceAtRiskBadgeLabel(count) {
  const n = Number(count) || 0;
  return `${n} aluno${n === 1 ? '' : 's'} em risco`;
}

/**
 * @param {{ followUpCount?: number; atRiskCount?: number }} [opts]
 */
export function buildRecepcaoHubTabItems({ followUpCount = 0, atRiskCount = 0 } = {}) {
  const followCount = Number(followUpCount) > 0 ? Number(followUpCount) : 0;
  const riskCount = Number(atRiskCount) > 0 ? Number(atRiskCount) : 0;
  return RECEPCAO_HUB_TABS.map((tab) => {
    let badgeCount;
    let badgeAriaLabel;
    if (tab.id === RECEPCAO_TAB_EXPERIMENTAIS && followCount > 0) {
      badgeCount = followCount;
      badgeAriaLabel = followupPendingCountLabel(followCount);
    } else if (tab.id === RECEPCAO_TAB_CATRACA && riskCount > 0) {
      badgeCount = riskCount;
      badgeAriaLabel = presenceAtRiskBadgeLabel(riskCount);
    }
    return {
      id: tab.id,
      label: tab.label,
      badgeCount,
      badgeAriaLabel,
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

/**
 * Sub-abas da Presença (Ao vivo / Histórico / Retenção).
 * @param {{ attendanceReady?: boolean }} [opts]
 */
export function buildRecepcaoPresenceSubTabs({ attendanceReady = false } = {}) {
  const tabs = [
    { id: RECEPCAO_CATRACA_SECTION_LIVE, label: 'Ao vivo' },
    { id: RECEPCAO_CATRACA_SECTION_HISTORICO, label: 'Histórico' },
  ];
  if (attendanceReady) {
    tabs.push({ id: RECEPCAO_CATRACA_SECTION_RETENCAO, label: 'Retenção' });
  }
  return tabs;
}
