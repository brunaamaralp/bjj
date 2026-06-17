import { describe, it, expect } from 'vitest';
import {
  PROCESSOS_DEFAULT_SECTION,
  PROCESSOS_SETTINGS_SECTIONS,
  buildProcessosSettingsNavItems,
  isProcessosSettingsSection,
  resolveProcessosNavState,
} from '../lib/processosSettingsSections.js';

describe('processosSettingsSections', () => {
  it('valida seções conhecidas', () => {
    expect(isProcessosSettingsSection('templates')).toBe('templates');
    expect(isProcessosSettingsSection('playbook')).toBe('playbook');
    expect(isProcessosSettingsSection('matricula-legado')).toBe('matricula-legado');
    expect(isProcessosSettingsSection('invalid')).toBeNull();
  });

  it('nav base tem templates e playbook', () => {
    const items = buildProcessosSettingsNavItems();
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.id)).toEqual(['templates', 'playbook']);
  });

  it('nav com legado inclui terceiro item', () => {
    const items = buildProcessosSettingsNavItems({ showLegado: true });
    expect(items).toHaveLength(3);
    expect(items[2].id).toBe(PROCESSOS_SETTINGS_SECTIONS.MATRICULA_LEGADO);
  });

  it('resolveProcessosNavState faz fallback', () => {
    const state = resolveProcessosNavState('unknown');
    expect(state.section).toBe(PROCESSOS_DEFAULT_SECTION);
    expect(state.meta.panelTitle).toBe('Templates de tarefas');
  });

  it('esconde legado quando não há config antiga', () => {
    const state = resolveProcessosNavState('matricula-legado', { showLegado: false });
    expect(state.section).toBe(PROCESSOS_DEFAULT_SECTION);
  });
});
