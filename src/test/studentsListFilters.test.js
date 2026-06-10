import { describe, expect, it } from 'vitest';
import {
  applyStudentsListPipeline,
  buildServerAppliedFlags,
  buildStudentsServerFetchOpts,
  hasStudentsServerFilters,
  SEM_TURMA_FILTER,
} from '../lib/studentsListFilters.js';
import { buildStudentsById, selectStudentById } from '../store/useStudentStore.js';
import { STUDENT_STATUS } from '../lib/studentStatus.js';

const sampleStudents = [
  { id: 's1', name: 'Ana', plan: 'Mensal', origin: 'WhatsApp', turma: 'Kids', phone: '11999990001' },
  { id: 's2', name: 'Bruno', plan: 'Anual', origin: 'Indicação', turma: '', phone: '11999990002' },
  { id: 's3', name: 'Carla', plan: 'Mensal', origin: 'WhatsApp', turma: 'Adulto', phone: '11999990003' },
];

describe('buildStudentsServerFetchOpts', () => {
  it('inclui origem e sem turma no servidor', () => {
    const opts = buildStudentsServerFetchOpts({
      debouncedSearch: '',
      filtroPlano: 'Todos',
      filtroTurma: SEM_TURMA_FILTER,
      filtroOrigem: 'WhatsApp',
      showInactive: false,
    });
    expect(opts).toEqual({
      search: undefined,
      plan: undefined,
      turma: undefined,
      turmaEmpty: true,
      origin: 'WhatsApp',
      studentStatus: STUDENT_STATUS.ACTIVE,
    });
  });

  it('inclui busca com 2+ caracteres', () => {
    const opts = buildStudentsServerFetchOpts({
      debouncedSearch: 'Ana',
      filtroPlano: 'Mensal',
      filtroTurma: 'Kids',
      filtroOrigem: 'Todas',
      showInactive: true,
    });
    expect(opts.search).toBe('Ana');
    expect(opts.plan).toBe('Mensal');
    expect(opts.turma).toBe('Kids');
    expect(opts.studentStatus).toBe(STUDENT_STATUS.INACTIVE);
  });
});

describe('hasStudentsServerFilters', () => {
  it('detecta filtros de origem e sem turma', () => {
    expect(
      hasStudentsServerFilters({
        debouncedSearch: '',
        filtroPlano: 'Todos',
        filtroTurma: SEM_TURMA_FILTER,
        filtroOrigem: 'Todas',
        showInactive: false,
      })
    ).toBe(true);
    expect(
      hasStudentsServerFilters({
        debouncedSearch: '',
        filtroPlano: 'Todos',
        filtroTurma: 'Todas',
        filtroOrigem: 'WhatsApp',
        showInactive: false,
      })
    ).toBe(true);
  });
});

describe('applyStudentsListPipeline', () => {
  it('não refiltra plano no cliente quando servidor já aplicou', () => {
    const serverFetchOpts = buildStudentsServerFetchOpts({
      debouncedSearch: '',
      filtroPlano: 'Mensal',
      filtroTurma: 'Todas',
      filtroOrigem: 'Todas',
      showInactive: false,
    });
    const ctx = {
      serverSearchActive: false,
      serverApplied: buildServerAppliedFlags(serverFetchOpts),
    };
    const fromServer = sampleStudents.filter((s) => s.plan === 'Mensal');
    const result = applyStudentsListPipeline(fromServer, {
      debouncedSearch: '',
      filtroPlano: 'Mensal',
      filtroTurma: 'Todas',
      filtroOrigem: 'Todas',
      ordenacao: 'az',
    }, ctx);
    expect(result.map((s) => s.id)).toEqual(['s1', 's3']);
  });

  it('filtra plano no cliente quando servidor não aplicou', () => {
    const ctx = {
      serverSearchActive: false,
      serverApplied: buildServerAppliedFlags({}),
    };
    const result = applyStudentsListPipeline(sampleStudents, {
      debouncedSearch: '',
      filtroPlano: 'Mensal',
      filtroTurma: 'Todas',
      filtroOrigem: 'Todas',
      ordenacao: 'az',
    }, ctx);
    expect(result.map((s) => s.id)).toEqual(['s1', 's3']);
  });

  it('filtra sem turma no cliente quando servidor não aplicou', () => {
    const ctx = {
      serverSearchActive: false,
      serverApplied: buildServerAppliedFlags({}),
    };
    const result = applyStudentsListPipeline(sampleStudents, {
      debouncedSearch: '',
      filtroPlano: 'Todos',
      filtroTurma: SEM_TURMA_FILTER,
      filtroOrigem: 'Todas',
      ordenacao: 'az',
    }, ctx);
    expect(result.map((s) => s.id)).toEqual(['s2']);
  });
});

describe('buildStudentsById / selectStudentById', () => {
  it('indexa e resolve por id', () => {
    const byId = buildStudentsById(sampleStudents);
    expect(byId.s1.name).toBe('Ana');
    expect(selectStudentById({ studentsById: byId, students: sampleStudents }, 's2')?.name).toBe('Bruno');
    expect(selectStudentById({ studentsById: {}, students: sampleStudents }, 's3')?.name).toBe('Carla');
  });
});
