import { describe, expect, it } from 'vitest';
import {
  ALUNOS_AULAS_SETTINGS_ITEMS,
  ALUNOS_AULAS_DEFAULT_SECTION,
  isAlunosAulasSettingsSection,
} from '../lib/alunosAulasSettingsSections.js';

describe('alunosAulasSettingsSections', () => {
  it('combina alunos e horários na mesma família', () => {
    expect(ALUNOS_AULAS_SETTINGS_ITEMS.map((item) => item.id)).toEqual([
      'campos-personalizados',
      'graduacoes',
      'matricula',
      'turmas',
      'horarios',
    ]);
  });

  it('usa campos personalizados como seção inicial', () => {
    expect(ALUNOS_AULAS_DEFAULT_SECTION).toBe('campos-personalizados');
  });

  it('aceita seções de alunos e horários', () => {
    expect(isAlunosAulasSettingsSection('graduacoes')).toBe('graduacoes');
    expect(isAlunosAulasSettingsSection('turmas')).toBe('turmas');
    expect(isAlunosAulasSettingsSection('invalida')).toBeNull();
  });
});
