import { describe, expect, it } from 'vitest';
import {
  resolveRouteBootstrapNeeds,
  shouldSkipLeadsListFetch,
  shouldSkipStudentsListFetch,
} from '../lib/bootstrapRoutePrefetch.js';

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

describe('shouldSkipLeadsListFetch', () => {
  it('pula quando loading', () => {
    expect(shouldSkipLeadsListFetch({ loading: true, leads: [], leadsLastFetchedAt: null })).toBe(true);
  });

  it('pula quando lista fresca', () => {
    expect(
      shouldSkipLeadsListFetch({
        loading: false,
        loadingMore: false,
        leads: [{ id: '1' }],
        leadsLastFetchedAt: Date.now(),
      }),
    ).toBe(true);
  });

  it('não pula quando vazio e sem fetch', () => {
    expect(
      shouldSkipLeadsListFetch({ loading: false, loadingMore: false, leads: [], leadsLastFetchedAt: null }),
    ).toBe(false);
  });
});

describe('shouldSkipStudentsListFetch', () => {
  it('pula quando loading', () => {
    expect(shouldSkipStudentsListFetch({ loading: true, students: [], lastFetchedAt: null })).toBe(true);
  });

  it('pula quando lista fresca', () => {
    expect(
      shouldSkipStudentsListFetch({
        loading: false,
        loadingMore: false,
        students: [{ id: '1' }],
        lastFetchedAt: Date.now(),
      }),
    ).toBe(true);
  });
});
