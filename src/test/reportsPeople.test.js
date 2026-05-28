import { describe, it, expect } from 'vitest';
import {
  studentDocToReportPerson,
  mergeLeadsAndStudentsForReport,
} from '../../lib/server/reportsPeople.js';
import { aggregateLeadsReport } from '../../lib/server/reportsAggregate.js';

describe('reportsPeople — studentDocToReportPerson', () => {
  it('mapeia source_origin para origin e converted_at', () => {
    const row = studentDocToReportPerson({
      $id: 'stu-1',
      $createdAt: '2026-05-01T10:00:00.000Z',
      name: 'Ana',
      phone: '11999999999',
      type: 'Adulto',
      academyId: 'ac-1',
      source_origin: 'WhatsApp',
      converted_at: '2026-05-15T12:00:00.000Z',
    });
    expect(row.origin).toBe('WhatsApp');
    expect(row.converted_at).toBe('2026-05-15T12:00:00.000Z');
    expect(row.contact_type).toBe('student');
  });
});

describe('reportsPeople — mergeLeadsAndStudentsForReport', () => {
  it('students sobrescrevem leads com mesmo $id', () => {
    const leads = [
      {
        $id: 'x1',
        origin: 'Instagram',
        converted_at: null,
        $createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const students = [
      {
        $id: 'x1',
        source_origin: 'WhatsApp',
        converted_at: '2026-05-10T00:00:00.000Z',
        $createdAt: '2026-05-10T00:00:00.000Z',
      },
    ];
    const merged = mergeLeadsAndStudentsForReport(leads, students);
    expect(merged).toHaveLength(1);
    expect(merged[0].origin).toBe('WhatsApp');
    expect(merged[0].converted_at).toBe('2026-05-10T00:00:00.000Z');
  });

  it('inclui aluno só em students', () => {
    const merged = mergeLeadsAndStudentsForReport(
      [],
      [
        {
          $id: 'only-student',
          source_origin: 'Cadastro manual',
          converted_at: '2026-05-20T00:00:00.000Z',
          $createdAt: '2026-05-20T00:00:00.000Z',
          name: 'Bob',
          phone: '11888888888',
          type: 'Adulto',
          academyId: 'ac-1',
        },
      ]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].$id).toBe('only-student');
  });
});

describe('reportsPeople — aggregate com students', () => {
  const from = '2026-05-01T00:00:00.000Z';
  const to = '2026-05-31T23:59:59.999Z';
  const prevFrom = '2026-04-01T00:00:00.000Z';
  const prevTo = '2026-04-30T23:59:59.999Z';

  it('conta matrícula de aluno só na coleção students', () => {
    const people = mergeLeadsAndStudentsForReport(
      [],
      [
        {
          $id: 's1',
          name: 'Carlos',
          phone: '11777777777',
          type: 'Adulto',
          academyId: 'ac-1',
          source_origin: 'WhatsApp',
          converted_at: '2026-05-12T15:00:00.000Z',
          $createdAt: '2026-05-12T15:00:00.000Z',
        },
      ]
    );
    const agg = aggregateLeadsReport(people, { from, to, prevFrom, prevTo });
    expect(agg.metrics.converted.current).toBe(1);
    expect(agg.studentMetrics.newStudents).toBe(1);
    expect(agg.metrics.converted.list[0].id).toBe('s1');
  });
});
