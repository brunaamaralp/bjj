import { describe, it, expect } from 'vitest';
import {
  readAcademyTurmas,
  turmaValueFromForm,
  resolveTurmaFormState,
  studentTurmaGroupKey,
  sortTurmaGroupKeys,
  SEM_TURMA_GROUP_LABEL,
  TURMA_OUTRO_VALUE,
} from '../lib/academyTurmas.js';

describe('academyTurmas', () => {
  it('readAcademyTurmas usa padrão se vazio', () => {
    expect(readAcademyTurmas(null)).toEqual(['Kids', 'Juniores', 'Adultos']);
    expect(readAcademyTurmas({ turmas: ['Competição'] })).toEqual(['Competição']);
  });

  it('turmaValueFromForm trata Outro', () => {
    expect(turmaValueFromForm('Kids', '')).toBe('Kids');
    expect(turmaValueFromForm(TURMA_OUTRO_VALUE, 'Noite')).toBe('Noite');
  });

  it('resolveTurmaFormState detecta valor customizado', () => {
    const r = resolveTurmaFormState('Competição', ['Kids', 'Adultos']);
    expect(r.selectValue).toBe(TURMA_OUTRO_VALUE);
    expect(r.otherText).toBe('Competição');
  });

  it('studentTurmaGroupKey usa turma do aluno', () => {
    expect(studentTurmaGroupKey({ turma: 'Kids 18h' }, ['Kids'])).toBe('Kids 18h');
    expect(studentTurmaGroupKey({ type: 'Adulto' }, ['Adultos'])).toBe('Adultos');
    expect(studentTurmaGroupKey({ type: 'X' }, [])).toBe(SEM_TURMA_GROUP_LABEL);
  });

  it('sortTurmaGroupKeys coloca Sem turma no final', () => {
    const sorted = sortTurmaGroupKeys(['Sem turma', 'Kids', 'Z'], ['Kids', 'Juniores']);
    expect(sorted[sorted.length - 1]).toBe(SEM_TURMA_GROUP_LABEL);
    expect(sorted[0]).toBe('Kids');
  });
});
