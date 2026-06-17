import { describe, it, expect } from 'vitest';
import {
  defaultEnrollmentDateIso,
  enrollmentDateYmd,
  enrollmentIngressYmd,
  contactEnrolledInYmdRange,
  formatLocalYmd,
  matriculationYmdInRange,
  countEnrollmentsInPeoplePeriod,
} from '../lib/studentEnrollmentDate.js';

describe('defaultEnrollmentDateIso', () => {
  it('usa enrollmentDate existente', () => {
    expect(defaultEnrollmentDateIso({ enrollmentDate: '2024-03-15' })).toBe('2024-03-15');
  });

  it('usa createdAt quando ingresso vazio', () => {
    expect(defaultEnrollmentDateIso({ createdAt: '2025-01-20T10:00:00.000Z' })).toBe('2025-01-20');
  });
});

describe('enrollmentDateYmd', () => {
  it('prioriza enrollmentDate sobre convertedAt', () => {
    expect(
      enrollmentDateYmd({ enrollmentDate: '2023-05-10', convertedAt: '2026-06-01T12:00:00.000Z' })
    ).toBe('2023-05-10');
  });

  it('usa convertedAt quando ingresso ausente (ordenação)', () => {
    expect(enrollmentDateYmd({ convertedAt: '2026-06-01T12:00:00.000Z' })).toBe('2026-06-01');
  });

  it('não usa createdAt do documento', () => {
    expect(
      enrollmentDateYmd({ createdAt: '2026-06-01T12:00:00.000Z', enrollmentDate: '', convertedAt: null })
    ).toBe('');
  });

  it('lê enrollment_date snake_case', () => {
    expect(enrollmentDateYmd({ enrollment_date: '2024-11-20' })).toBe('2024-11-20');
  });
});

describe('enrollmentIngressYmd', () => {
  it('só retorna data de ingresso explícita', () => {
    expect(enrollmentIngressYmd({ enrollmentDate: '2024-01-15' })).toBe('2024-01-15');
    expect(enrollmentIngressYmd({ convertedAt: '2026-06-01T12:00:00.000Z' })).toBe('');
  });
});

describe('contactEnrolledInYmdRange', () => {
  it('inclui matrícula dentro do intervalo', () => {
    expect(
      contactEnrolledInYmdRange({ enrollmentDate: '2026-05-15' }, '2026-05-01', '2026-05-31')
    ).toBe(true);
  });

  it('exclui matrícula fora do intervalo', () => {
    expect(
      contactEnrolledInYmdRange({ enrollmentDate: '2023-01-10' }, '2026-05-01', '2026-05-31')
    ).toBe(false);
  });

  it('exclui quando não há ingresso, mesmo com convertedAt', () => {
    expect(
      contactEnrolledInYmdRange(
        { convertedAt: '2026-06-01T00:00:00.000Z' },
        '2026-06-01',
        '2026-06-30'
      )
    ).toBe(false);
  });

  it('exclui quando não há data de matrícula conhecida', () => {
    expect(
      contactEnrolledInYmdRange({ createdAt: '2026-06-01T00:00:00.000Z' }, '2026-06-01', '2026-06-30')
    ).toBe(false);
  });
});

describe('matriculationYmdInRange', () => {
  it('usa comparação YMD e fallback convertedAt', () => {
    expect(
      matriculationYmdInRange({ convertedAt: '2026-06-10T12:00:00.000Z' }, '2026-06-01', '2026-06-30')
    ).toBe(true);
    expect(
      matriculationYmdInRange(
        { enrollmentDate: '2024-03-15', convertedAt: '2026-06-10T12:00:00.000Z' },
        '2026-06-01',
        '2026-06-30'
      )
    ).toBe(false);
  });
});

describe('countEnrollmentsInPeoplePeriod', () => {
  it('conta alunos e ignora leads não convertidos', () => {
    const people = [
      { $id: 's1', contact_type: 'student', enrollmentDate: '2026-06-10', source_origin: 'WhatsApp' },
      { $id: 'l1', status: 'Novo', convertedAt: '2026-06-10T12:00:00.000Z', origin: 'Instagram' },
      { $id: 'l2', status: 'Matriculado', convertedAt: '2026-06-03T12:00:00.000Z', origin: 'Instagram' },
    ];
    expect(countEnrollmentsInPeoplePeriod(people, '2026-06-01', '2026-06-30')).toBe(2);
  });
});

describe('formatLocalYmd', () => {
  it('formata data local sem deslocamento UTC', () => {
    const d = new Date(2026, 5, 1);
    expect(formatLocalYmd(d)).toBe('2026-06-01');
  });
});
