import { describe, expect, it } from 'vitest';
import { resolveRouteBootstrapNeeds } from '../lib/bootstrapRoutePrefetch.js';

describe('resolveRouteBootstrapNeeds', () => {
  it('prefetch dashboard com leads e alunos', () => {
    expect(resolveRouteBootstrapNeeds('/')).toEqual({ leads: true, students: true });
  });

  it('financeiro não precisa de leads nem alunos no bootstrap', () => {
    expect(resolveRouteBootstrapNeeds('/financeiro')).toEqual({ leads: false, students: false });
    expect(resolveRouteBootstrapNeeds('/caixa')).toEqual({ leads: false, students: false });
  });

  it('funil precisa de ambos', () => {
    expect(resolveRouteBootstrapNeeds('/pipeline')).toEqual({ leads: true, students: true });
    expect(resolveRouteBootstrapNeeds('/funil')).toEqual({ leads: true, students: true });
  });

  it('inbox só leads', () => {
    expect(resolveRouteBootstrapNeeds('/inbox')).toEqual({ leads: true, students: false });
  });

  it('alunos só students', () => {
    expect(resolveRouteBootstrapNeeds('/alunos')).toEqual({ leads: false, students: true });
  });

  it('empresa não precisa de dados de lista', () => {
    expect(resolveRouteBootstrapNeeds('/empresa')).toEqual({ leads: false, students: false });
  });

  it('lead profile e reports precisam de leads', () => {
    expect(resolveRouteBootstrapNeeds('/lead/abc123')).toEqual({ leads: true, students: true });
    expect(resolveRouteBootstrapNeeds('/reports')).toEqual({ leads: true, students: false });
  });

  it('recepcao precisa de alunos', () => {
    expect(resolveRouteBootstrapNeeds('/recepcao')).toEqual({ leads: false, students: true });
  });
});
