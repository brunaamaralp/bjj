import { describe, it, expect } from 'vitest';
import {
  INTEGRACOES_DEFAULT_SECTION,
  INTEGRACOES_SETTINGS_SECTIONS,
  isIntegracoesSettingsSection,
  resolveIntegracoesNavState,
} from '../lib/integracoesSettingsSections.js';

describe('integracoesSettingsSections', () => {
  it('valida abas conhecidas', () => {
    expect(isIntegracoesSettingsSection('whatsapp')).toBe('whatsapp');
    expect(isIntegracoesSettingsSection('catraca')).toBe('catraca');
    expect(isIntegracoesSettingsSection('autentique')).toBe('autentique');
    expect(isIntegracoesSettingsSection('invalid')).toBeNull();
  });

  it('default whatsapp', () => {
    expect(INTEGRACOES_DEFAULT_SECTION).toBe(INTEGRACOES_SETTINGS_SECTIONS.WHATSAPP);
  });

  it('resolveIntegracoesNavState com fallback', () => {
    const state = resolveIntegracoesNavState('');
    expect(state.section).toBe('whatsapp');
    expect(state.meta.panelTitle).toContain('WhatsApp');
  });

  it('resolveIntegracoesNavState autentique', () => {
    const state = resolveIntegracoesNavState('autentique');
    expect(state.section).toBe('autentique');
    expect(state.meta.panelTitle).toContain('Autentique');
  });
});
