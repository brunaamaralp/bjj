import { describe, expect, it } from 'vitest';
import { LEAD_STATUS } from '../store/useLeadStore';
import {
  countEnrollmentsInMonth,
  countOverdueStudents,
  countPendingTasksToday,
  currentMonthRange,
  filterEnrollmentsInMonth,
  mergeEnrollmentModalItems,
  filterPendingTasksForDate,
  isTimestampInRange,
} from '../lib/dashboardManagerMetrics.js';

describe('countEnrollmentsInMonth', () => {
  const range = {
    from: new Date(2026, 5, 1, 0, 0, 0, 0),
    to: new Date(2026, 5, 30, 23, 59, 59, 999),
    ym: '2026-06',
  };

  it('conta aluno com convertedAt no mês', () => {
    const students = [{ id: 's1', convertedAt: '2026-06-10T15:00:00.000Z' }];
    expect(countEnrollmentsInMonth([], students, range)).toBe(1);
  });

  it('conta aluno com converted_at (snake_case) no mês', () => {
    const students = [{ id: 's2', converted_at: '2026-06-12T10:00:00.000Z' }];
    expect(countEnrollmentsInMonth([], students, range)).toBe(1);
  });

  it('conta aluno só com enrollmentDate quando converted_at ausente', () => {
    const students = [{ id: 's3', enrollmentDate: '2026-06-08' }];
    expect(countEnrollmentsInMonth([], students, range)).toBe(1);
  });

  it('não conta aluno sem converted_at nem enrollmentDate', () => {
    const students = [{ id: 's4', createdAt: '2026-06-01T00:00:00.000Z' }];
    expect(countEnrollmentsInMonth([], students, range)).toBe(0);
  });

  it('não conta lead convertido só por createdAt no mês (sem convertedAt)', () => {
    const leads = [
      {
        id: 'l1',
        status: LEAD_STATUS.CONVERTED,
        createdAt: '2026-06-05T00:00:00.000Z',
      },
    ];
    expect(countEnrollmentsInMonth(leads, [], range)).toBe(0);
  });

  it('conta lead convertido com convertedAt no mês', () => {
    const leads = [
      {
        id: 'l2',
        status: LEAD_STATUS.CONVERTED,
        convertedAt: '2026-06-03T12:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    expect(countEnrollmentsInMonth(leads, [], range)).toBe(1);
  });

  it('deduplica mesmo id entre students e leads', () => {
    const students = [{ id: 'dup', convertedAt: '2026-06-10T12:00:00.000Z' }];
    const leads = [
      {
        id: 'dup',
        status: LEAD_STATUS.CONVERTED,
        convertedAt: '2026-06-10T12:00:00.000Z',
      },
    ];
    expect(countEnrollmentsInMonth(leads, students, range)).toBe(1);
  });

  it('exclui importação de planilha', () => {
    const students = [
      {
        id: 'imp',
        origin: 'Planilha',
        convertedAt: '2026-06-01T00:00:00.000Z',
      },
    ];
    expect(countEnrollmentsInMonth([], students, range)).toBe(0);
  });

  it('não conta matrícula fora do mês', () => {
    const students = [{ id: 'old', convertedAt: '2026-05-28T00:00:00.000Z' }];
    expect(countEnrollmentsInMonth([], students, range)).toBe(0);
  });

  it('prioriza ingresso sobre converted_at (cadastro retroativo)', () => {
    const students = [
      {
        id: 'retro',
        enrollmentDate: '2024-03-15',
        convertedAt: '2026-06-10T12:00:00.000Z',
      },
    ];
    expect(countEnrollmentsInMonth([], students, range)).toBe(0);
  });

  it('conta converted_at só quando ingresso ausente', () => {
    const students = [{ id: 'funil', convertedAt: '2026-06-10T12:00:00.000Z' }];
    expect(countEnrollmentsInMonth([], students, range)).toBe(1);
  });
});

describe('filterEnrollmentsInMonth', () => {
  const range = {
    from: new Date(2026, 5, 1, 0, 0, 0, 0),
    to: new Date(2026, 5, 30, 23, 59, 59, 999),
    ym: '2026-06',
  };

  it('retorna matrículas do mês ordenadas por data decrescente', () => {
    const students = [
      { id: 's1', name: 'Ana', enrollmentDate: '2026-06-05' },
      { id: 's2', name: 'Bruno', enrollmentDate: '2026-06-20' },
    ];
    const result = filterEnrollmentsInMonth([], students, range);
    expect(result.map((s) => s.id)).toEqual(['s2', 's1']);
  });

  it('deduplica mesmo id entre students e leads', () => {
    const students = [{ id: 'dup', name: 'Carla', enrollmentDate: '2026-06-10' }];
    const leads = [
      {
        id: 'dup',
        status: LEAD_STATUS.CONVERTED,
        name: 'Carla lead',
        convertedAt: '2026-06-10T12:00:00.000Z',
      },
    ];
    expect(filterEnrollmentsInMonth(leads, students, range)).toHaveLength(1);
    expect(filterEnrollmentsInMonth(leads, students, range)[0].name).toBe('Carla');
  });
});

describe('mergeEnrollmentModalItems', () => {
  const range = {
    from: new Date(2026, 5, 1, 0, 0, 0, 0),
    to: new Date(2026, 5, 30, 23, 59, 59, 999),
    ym: '2026-06',
  };

  it('prioriza lista do servidor e enriquece com dados locais', () => {
    const serverList = [
      { id: 's1', name: 'Ana' },
      { id: 's2', name: 'Bruno' },
      { id: 's3', name: 'Carla' },
    ];
    const students = [
      { id: 's1', name: 'Ana Local', enrollmentDate: '2026-06-05', plan: 'Mensal' },
      { id: 's2', name: 'Bruno Local', enrollmentDate: '2026-06-10' },
    ];
    const items = mergeEnrollmentModalItems(serverList, [], students, range);
    expect(items).toHaveLength(3);
    expect(items[0].plan).toBe('Mensal');
    expect(items[2].name).toBe('Carla');
  });

  it('cai no filtro local quando servidor não retornou lista', () => {
    const students = [{ id: 's1', name: 'Ana', enrollmentDate: '2026-06-05' }];
    const items = mergeEnrollmentModalItems(null, [], students, range);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('s1');
  });
});

describe('currentMonthRange / isTimestampInRange', () => {
  it('currentMonthRange cobre o mês civil inteiro', () => {
    const { from, to } = currentMonthRange();
    expect(from.getDate()).toBe(1);
    expect(to.getTime()).toBeGreaterThan(from.getTime());
  });

  it('isTimestampInRange respeita limites', () => {
    const from = new Date(2026, 5, 1);
    const to = new Date(2026, 5, 30, 23, 59, 59, 999);
    expect(isTimestampInRange('2026-06-15T12:00:00.000Z', from, to)).toBe(true);
    expect(isTimestampInRange('2026-05-31T23:59:59.000Z', from, to)).toBe(false);
  });
});

describe('filterPendingTasksForDate', () => {
  const today = new Date(2026, 5, 10, 12, 0, 0, 0);

  it('inclui só pendentes com vencimento no dia', () => {
    const tasks = [
      { id: '1', status: 'pending', due_date: '2026-06-10' },
      { id: '2', status: 'pending', due_date: '2026-06-11' },
      { id: '3', status: 'done', due_date: '2026-06-10' },
    ];
    expect(filterPendingTasksForDate(tasks, today).map((t) => t.id)).toEqual(['1']);
    expect(countPendingTasksToday(tasks, today)).toBe(1);
  });
});

describe('countOverdueStudents', () => {
  it('conta alunos ativos com flag overdue', () => {
    const students = [
      { id: 'a', studentStatus: 'active', overdue: true },
      { id: 'b', studentStatus: 'active', overdue: false },
      { id: 'c', studentStatus: 'inactive', overdue: true },
    ];
    expect(countOverdueStudents(students)).toBe(1);
  });
});
