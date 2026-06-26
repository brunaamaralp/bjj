import { describe, expect, it } from 'vitest';
import {
  applyStudentsListPipeline,
  buildServerAppliedFlags,
  buildStudentPlanFilterOptions,
  buildStudentsCobrancaCounts,
  buildStudentsServerFetchOpts,
  hasStudentsServerFilters,
  SEM_TURMA_FILTER,
  STUDENT_COBRANCA_FILTER,
  studentPlanMatchesFilter,
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
    expect(opts.plan).toBeUndefined();
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

describe('studentPlanMatchesFilter', () => {
  it('aceita plano legado com nome parcial', () => {
    expect(studentPlanMatchesFilter({ plan: 'Plano Anual Adulto GB' }, 'Anual')).toBe(true);
    expect(studentPlanMatchesFilter({ plan: 'Mensal' }, 'Anual')).toBe(false);
  });
});

describe('buildStudentPlanFilterOptions', () => {
  it('inclui planos legados fora do catálogo', () => {
    const opts = buildStudentPlanFilterOptions(
      [{ name: 'Mensal' }],
      [{ plan: 'Plano Anual Antigo' }, { plan: 'Mensal' }]
    );
    expect(opts.catalog).toEqual(['Mensal']);
    expect(opts.legacy).toEqual(['Plano Anual Antigo']);
  });
});

describe('buildStudentsCobrancaCounts', () => {
  const financeConfig = {
    plans: [
      { name: 'Mensal', price: 200, isExempt: false },
      { name: 'Bolsista', price: 0, isExempt: true },
    ],
  };

  it('conta pagantes e isentos pelo plano cadastrado', () => {
    const counts = buildStudentsCobrancaCounts(
      [
        { id: 'a', plan: 'Mensal' },
        { id: 'b', plan: 'Bolsista' },
        { id: 'c', plan: 'Mensal' },
      ],
      financeConfig
    );
    expect(counts).toEqual({ todos: 3, pagantes: 2, isentos: 1 });
  });
});

describe('applyStudentsListPipeline', () => {
  it('filtra plano no cliente com match parcial', () => {
    const students = [
      ...sampleStudents,
      { id: 's4', name: 'Diana', plan: 'Plano Anual GB', origin: 'WhatsApp', turma: 'Adulto' },
    ];
    const ctx = {
      serverSearchActive: false,
      serverApplied: buildServerAppliedFlags({}),
    };
    const result = applyStudentsListPipeline(students, {
      debouncedSearch: '',
      filtroPlano: 'Anual',
      filtroTurma: 'Todas',
      filtroOrigem: 'Todas',
      ordenacao: 'az',
    }, ctx);
    expect(result.map((s) => s.id)).toEqual(['s2', 's4']);
  });

  it('filtra plano no cliente com match exato', () => {
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

  it('filtra isentos no cliente', () => {
    const financeConfig = {
      plans: [
        { name: 'Mensal', price: 200, isExempt: false },
        { name: 'Bolsista', price: 0, isExempt: true },
      ],
    };
    const students = [
      { id: 'p1', name: 'Paga', plan: 'Mensal' },
      { id: 'i1', name: 'Isenta', plan: 'Bolsista' },
    ];
    const ctx = {
      serverSearchActive: false,
      serverApplied: buildServerAppliedFlags({}),
      financeConfig,
    };
    const isentos = applyStudentsListPipeline(students, {
      debouncedSearch: '',
      filtroPlano: 'Todos',
      filtroTurma: 'Todas',
      filtroOrigem: 'Todas',
      filtroCobranca: STUDENT_COBRANCA_FILTER.ISENTOS,
      ordenacao: 'az',
    }, ctx);
    expect(isentos.map((s) => s.id)).toEqual(['i1']);

    const pagantes = applyStudentsListPipeline(students, {
      debouncedSearch: '',
      filtroPlano: 'Todos',
      filtroTurma: 'Todas',
      filtroOrigem: 'Todas',
      filtroCobranca: STUDENT_COBRANCA_FILTER.PAGANTES,
      ordenacao: 'az',
    }, ctx);
    expect(pagantes.map((s) => s.id)).toEqual(['p1']);
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
