import { describe, it, expect } from 'vitest';
import {
  graduationsActive,
  resolveBeltOptions,
  shouldShowStudentGraduation,
  isGraduationReadOnly,
  normalizeBeltValue,
  mergeBeltGradesIntoSettings,
} from '../lib/beltGradesConfig.js';

describe('beltGradesConfig — graduações opt-in', () => {
  it('graduationsActive é false sem lista salva', () => {
    expect(graduationsActive(null)).toBe(false);
    expect(graduationsActive(JSON.stringify({}))).toBe(false);
    expect(graduationsActive(JSON.stringify({ beltGrades: [] }))).toBe(false);
  });

  it('graduationsActive é true após salvar lista', () => {
    const settings = JSON.stringify(mergeBeltGradesIntoSettings('{}', ['Iniciante', 'Avançado']));
    expect(graduationsActive(settings)).toBe(true);
  });

  it('resolveBeltOptions retorna lista configurada', () => {
    const settings = JSON.stringify({ beltGrades: ['Azul', 'Roxa'] });
    expect(resolveBeltOptions(settings)).toEqual(['Azul', 'Roxa']);
  });

  it('resolveBeltOptions inclui valor órfão', () => {
    const settings = JSON.stringify({ beltGrades: ['Azul'] });
    expect(resolveBeltOptions(settings, 'Marrom')).toEqual(['Azul', 'Marrom']);
  });

  it('shouldShowStudentGraduation oculta sem config e sem valor', () => {
    expect(shouldShowStudentGraduation('{}', '')).toBe(false);
  });

  it('shouldShowStudentGraduation mostra com config ou valor legado', () => {
    const settings = JSON.stringify({ beltGrades: ['Azul'] });
    expect(shouldShowStudentGraduation(settings, '')).toBe(true);
    expect(shouldShowStudentGraduation('{}', 'Roxa')).toBe(true);
  });

  it('isGraduationReadOnly só quando legado sem config ativa', () => {
    expect(isGraduationReadOnly('{}', 'Roxa')).toBe(true);
    expect(isGraduationReadOnly('{}', '')).toBe(false);
    const settings = JSON.stringify({ beltGrades: ['Azul'] });
    expect(isGraduationReadOnly(settings, 'Roxa')).toBe(false);
  });

  it('normalizeBeltValue aceita vazio e opção válida', () => {
    const settings = JSON.stringify({ beltGrades: ['Azul', 'Roxa'] });
    expect(normalizeBeltValue('', settings)).toBe('');
    expect(normalizeBeltValue('Azul', settings)).toBe('Azul');
  });

  it('normalizeBeltValue rejeita opção inválida', () => {
    const settings = JSON.stringify({ beltGrades: ['Azul'] });
    expect(() => normalizeBeltValue('Preta', settings)).toThrow(/graduação válida/i);
  });

  it('normalizeBeltValue preserva legado quando graduações inativas', () => {
    expect(normalizeBeltValue('Preta', '{}', 'Roxa')).toBe('Roxa');
  });
});
