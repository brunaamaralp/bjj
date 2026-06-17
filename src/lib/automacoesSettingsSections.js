import {
  AUTOMACOES_GATILHOS_TAB_ID,
  WHATSAPP_TEMPLATE_UI_GROUPS,
} from './automacoesHub.js';
import { AUTOMATION_GROUP_HINTS } from './useAutomations.js';

/** Slugs em ?tab=modelos|gatilhos&section= */
export const AUTOMACOES_MODELOS_SECTIONS = {
  CAPTACAO: 'captacao',
  ROTINAS: 'rotinas',
};

export const AUTOMACOES_GATILHOS_SECTIONS = {
  CAPTACAO: 'captacao',
  POS_MATRICULA: 'pos-matricula',
  ROTINAS: 'rotinas',
};

const MODELOS_VALID = new Set(Object.values(AUTOMACOES_MODELOS_SECTIONS));
const GATILHOS_VALID = new Set(Object.values(AUTOMACOES_GATILHOS_SECTIONS));

/** Chave interna em AUTOMATION_GROUPS ↔ slug na URL. */
export const GATILHOS_SECTION_TO_GROUP_KEY = {
  [AUTOMACOES_GATILHOS_SECTIONS.CAPTACAO]: 'captacao',
  [AUTOMACOES_GATILHOS_SECTIONS.POS_MATRICULA]: 'posMatricula',
  [AUTOMACOES_GATILHOS_SECTIONS.ROTINAS]: 'rotinas',
};

export const GATILHOS_GROUP_KEY_TO_SECTION = Object.fromEntries(
  Object.entries(GATILHOS_SECTION_TO_GROUP_KEY).map(([slug, key]) => [key, slug])
);

const GATILHOS_NAV_META = {
  [AUTOMACOES_GATILHOS_SECTIONS.CAPTACAO]: {
    panelTitle: 'Captação',
    panelHint: AUTOMATION_GROUP_HINTS.captacao,
  },
  [AUTOMACOES_GATILHOS_SECTIONS.POS_MATRICULA]: {
    panelTitle: 'Pós-matrícula',
    panelHint: AUTOMATION_GROUP_HINTS.posMatricula,
  },
  [AUTOMACOES_GATILHOS_SECTIONS.ROTINAS]: {
    panelTitle: 'Rotinas diárias',
    panelHint: AUTOMATION_GROUP_HINTS.rotinas,
  },
};

function modelosNavItem(group) {
  const section = group.id;
  return {
    id: automacoesSettingsNavId('modelos', section),
    tab: 'modelos',
    section,
    label: `Modelos — ${group.title}`,
    shortLabel: group.id === 'rotinas' ? 'Modelos · Rotinas' : 'Modelos · Captação',
    panelTitle: group.title,
    panelHint: group.hint || '',
  };
}

function gatilhosNavItem(sectionSlug) {
  const meta = GATILHOS_NAV_META[sectionSlug];
  const shortBySection = {
    [AUTOMACOES_GATILHOS_SECTIONS.CAPTACAO]: 'Gatilhos · Cap.',
    [AUTOMACOES_GATILHOS_SECTIONS.POS_MATRICULA]: 'Gatilhos · Pós',
    [AUTOMACOES_GATILHOS_SECTIONS.ROTINAS]: 'Gatilhos · Rotinas',
  };
  return {
    id: automacoesSettingsNavId(AUTOMACOES_GATILHOS_TAB_ID, sectionSlug),
    tab: AUTOMACOES_GATILHOS_TAB_ID,
    section: sectionSlug,
    label: `Gatilhos — ${meta.panelTitle}`,
    shortLabel: shortBySection[sectionSlug] || `Gatilhos — ${meta.panelTitle}`,
    panelTitle: meta.panelTitle,
    panelHint: meta.panelHint || '',
  };
}

export const AUTOMACOES_SETTINGS_NAV_ITEMS = [
  ...WHATSAPP_TEMPLATE_UI_GROUPS.map(modelosNavItem),
  gatilhosNavItem(AUTOMACOES_GATILHOS_SECTIONS.CAPTACAO),
  gatilhosNavItem(AUTOMACOES_GATILHOS_SECTIONS.POS_MATRICULA),
  gatilhosNavItem(AUTOMACOES_GATILHOS_SECTIONS.ROTINAS),
];

export const AUTOMACOES_SETTINGS_NAV_BY_ID = Object.fromEntries(
  AUTOMACOES_SETTINGS_NAV_ITEMS.map((item) => [item.id, item])
);

export const AUTOMACOES_DEFAULT_SECTION_BY_TAB = {
  modelos: AUTOMACOES_MODELOS_SECTIONS.CAPTACAO,
  [AUTOMACOES_GATILHOS_TAB_ID]: AUTOMACOES_GATILHOS_SECTIONS.CAPTACAO,
};

export function automacoesSettingsNavId(tab, sectionSlug) {
  return `${String(tab || '').trim()}-${String(sectionSlug || '').trim()}`;
}

export function parseAutomacoesSettingsNavId(navId) {
  const raw = String(navId || '').trim();
  if (raw.startsWith(`${AUTOMACOES_GATILHOS_TAB_ID}-`)) {
    return {
      tab: AUTOMACOES_GATILHOS_TAB_ID,
      section: raw.slice(`${AUTOMACOES_GATILHOS_TAB_ID}-`.length),
    };
  }
  if (raw.startsWith('modelos-')) {
    return { tab: 'modelos', section: raw.slice('modelos-'.length) };
  }
  return { tab: 'modelos', section: AUTOMACOES_DEFAULT_SECTION_BY_TAB.modelos };
}

export function resolveAutomacoesSection(tab, rawSection) {
  const t = String(tab || '').trim().toLowerCase();
  const s = String(rawSection || '').trim().toLowerCase();
  if (t === 'modelos') {
    return MODELOS_VALID.has(s) ? s : null;
  }
  if (t === AUTOMACOES_GATILHOS_TAB_ID) {
    return GATILHOS_VALID.has(s) ? s : null;
  }
  return null;
}

export function getAutomacoesDefaultSection(tab) {
  return AUTOMACOES_DEFAULT_SECTION_BY_TAB[tab] || AUTOMACOES_DEFAULT_SECTION_BY_TAB.modelos;
}

export function resolveAutomacoesNavState(tab, rawSection) {
  const normalizedTab =
    tab === AUTOMACOES_GATILHOS_TAB_ID || tab === 'modelos' ? tab : 'modelos';
  const section = resolveAutomacoesSection(normalizedTab, rawSection) || getAutomacoesDefaultSection(normalizedTab);
  const navId = automacoesSettingsNavId(normalizedTab, section);
  const meta = AUTOMACOES_SETTINGS_NAV_BY_ID[navId] || AUTOMACOES_SETTINGS_NAV_ITEMS[0];
  return { tab: normalizedTab, section, navId, meta };
}
