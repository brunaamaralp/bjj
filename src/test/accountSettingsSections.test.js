import { describe, it, expect } from 'vitest';
import {
  ACCOUNT_DEFAULT_SECTION,
  ACCOUNT_SETTINGS_SECTIONS,
  isAccountSettingsSection,
  resolveAccountNavState,
} from '../lib/accountSettingsSections.js';

describe('accountSettingsSections', () => {
  it('valida abas conhecidas', () => {
    expect(isAccountSettingsSection('perfil')).toBe('perfil');
    expect(isAccountSettingsSection('assinatura')).toBe('assinatura');
    expect(isAccountSettingsSection('dados')).toBe('dados');
    expect(isAccountSettingsSection('invalid')).toBeNull();
  });

  it('alias seguranca → perfil', () => {
    expect(isAccountSettingsSection('seguranca')).toBe(ACCOUNT_SETTINGS_SECTIONS.PERFIL);
  });

  it('resolveAccountNavState com fallback', () => {
    const state = resolveAccountNavState('');
    expect(state.section).toBe(ACCOUNT_DEFAULT_SECTION);
    expect(state.meta.panelTitle).toBe('Perfil');
  });

  it('resolveAccountNavState para assinatura', () => {
    const state = resolveAccountNavState('assinatura');
    expect(state.section).toBe('assinatura');
    expect(state.meta.panelTitle).toBe('Assinatura e plano');
  });
});
