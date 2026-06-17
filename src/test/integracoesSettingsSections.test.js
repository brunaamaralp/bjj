import { describe, it, expect } from 'vitest';
import {
  INTEGRACOES_DEFAULT_SECTION,
  INTEGRACOES_SETTINGS_SECTIONS,
  isIntegracoesSettingsSection,
  resolveIntegracoesNavState,
} from '../lib/integracoesSettingsSections.js';

describe('integracoesSettingsSections', () => {
  it('valida abas conhecidas', () => {
    expect(isIntegracoesSettingsSection('catraca')).toBe('catraca');
    expect(isIntegracoesSettingsSection('autentique')).toBe('autentique');
    expect(isIntegracoesSettingsSection('invalid')).toBeNull();
  });

  it('default catraca', () => {
    expect(INTEGRACOES_DEFAULT_SECTION).toBe(INTEGRACOES_SETTINGS_SECTIONS.CATRACA);
  });

  it('resolveIntegracoesNavState com fallback', () => {
    const state = resolveIntegracoesNavState('');
    expect(state.section).toBe('catraca');
    expect(state.meta.panelTitle).toContain('Control iD');
  });

  it('resolveIntegracoesNavState autentique', () => {
    const state = resolveIntegracoesNavState('autentique');
    expect(state.section).toBe('autentique');
    expect(state.meta.panelTitle).toContain('Autentique');
  });
});
