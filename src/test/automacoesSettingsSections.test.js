import { describe, it, expect } from 'vitest';
import {
  AUTOMACOES_SETTINGS_NAV_ITEMS,
  automacoesSettingsNavId,
  getAutomacoesDefaultSection,
  parseAutomacoesSettingsNavId,
  resolveAutomacoesNavState,
  resolveAutomacoesSection,
  GATILHOS_SECTION_TO_GROUP_KEY,
} from '../lib/automacoesSettingsSections.js';

describe('automacoesSettingsSections', () => {
  it('sidebar lista modelos e gatilhos', () => {
    const labels = AUTOMACOES_SETTINGS_NAV_ITEMS.map((i) => i.label);
    expect(labels.some((l) => l.startsWith('Modelos —'))).toBe(true);
    expect(labels.some((l) => l.startsWith('Gatilhos —'))).toBe(true);
    expect(AUTOMACOES_SETTINGS_NAV_ITEMS).toHaveLength(5);
  });

  it('resolveAutomacoesSection valida por tab', () => {
    expect(resolveAutomacoesSection('modelos', 'captacao')).toBe('captacao');
    expect(resolveAutomacoesSection('modelos', 'pos-matricula')).toBeNull();
    expect(resolveAutomacoesSection('gatilhos', 'pos-matricula')).toBe('pos-matricula');
  });

  it('nav id round-trip', () => {
    const id = automacoesSettingsNavId('gatilhos', 'pos-matricula');
    expect(id).toBe('gatilhos-pos-matricula');
    expect(parseAutomacoesSettingsNavId(id)).toEqual({
      tab: 'gatilhos',
      section: 'pos-matricula',
    });
  });

  it('default section por tab', () => {
    expect(getAutomacoesDefaultSection('modelos')).toBe('captacao');
    expect(getAutomacoesDefaultSection('gatilhos')).toBe('captacao');
  });

  it('resolveAutomacoesNavState com fallback', () => {
    const state = resolveAutomacoesNavState('gatilhos', 'invalid');
    expect(state.tab).toBe('gatilhos');
    expect(state.section).toBe('captacao');
    expect(state.navId).toBe('gatilhos-captacao');
    expect(state.meta.panelTitle).toBe('Captação');
  });

  it('mapeia slug para group key de gatilhos', () => {
    expect(GATILHOS_SECTION_TO_GROUP_KEY['pos-matricula']).toBe('posMatricula');
  });
});
