import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./listAcademyStudents.js', () => ({
  listAcademyStudentsMapped: vi.fn(async () => [
    {
      id: 's1',
      name: 'João Silva',
      plan: 'Mensal',
      status: 'Matriculado',
      contact_type: 'student',
      enrollmentDate: '2026-01-15',
    },
  ]),
}));

import { inferAcademyQueryType, answerAcademyQuery } from './nlAcademyQuery.js';

describe('inferAcademyQueryType', () => {
  it('detecta finance_summary', () => {
    expect(inferAcademyQueryType('Quanto entrou esse mês?')).toBe('finance_summary');
  });

  it('detecta student_payment_status', () => {
    expect(inferAcademyQueryType('O João está em dia?')).toBe('student_payment_status');
  });

  it('detecta checkins_today', () => {
    expect(inferAcademyQueryType('Quem veio hoje?')).toBe('checkins_today');
  });

  it('detecta overdue_tasks', () => {
    expect(inferAcademyQueryType('Tarefas atrasadas')).toBe('overdue_tasks');
  });

  it('detecta unpaid_tuition', () => {
    expect(inferAcademyQueryType('Quem ainda não pagou?')).toBe('unpaid_tuition');
  });
});

describe('answerAcademyQuery', () => {
  const mockDatabases = {
    listDocuments: vi.fn(async () => ({ documents: [] })),
    getDocument: vi.fn(async () => ({ settings: '{}' })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('student_payment_status sem nome retorna erro', async () => {
    await expect(
      answerAcademyQuery(mockDatabases, {
        academyId: 'acad-1',
        queryType: 'student_payment_status',
        referenceMonth: '2026-06',
        studentName: '',
      })
    ).rejects.toThrow(/nome do aluno/i);
  });

  it('checkins_today retorna lista vazia quando não há registros', async () => {
    const out = await answerAcademyQuery(mockDatabases, {
      academyId: 'acad-1',
      queryType: 'checkins_today',
    });
    expect(out.query_type).toBe('checkins_today');
    expect(out.count).toBe(0);
  });

  it('overdue_tasks retorna lista vazia quando não há tarefas', async () => {
    const out = await answerAcademyQuery(mockDatabases, {
      academyId: 'acad-1',
      queryType: 'overdue_tasks',
    });
    expect(out.query_type).toBe('overdue_tasks');
    expect(out.count).toBe(0);
  });
});
