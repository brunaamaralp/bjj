import { describe, expect, it } from 'vitest';
import {
  LESSON_STATUS_CANCELLED,
  LESSON_STATUS_CONFIRMED,
  LESSON_STATUS_PENDING,
  aggregateLessonStaffTotals,
  buildLessonStaffCardBadge,
  buildLessonStaffCsvRows,
  buildLessonStaffPatch,
  validateLessonStaffConfirmInput,
} from '../../lib/lessonStaffRegister.js';

describe('validateLessonStaffConfirmInput', () => {
  it('rejects confirmed without professor and instructor', () => {
    const r = validateLessonStaffConfirmInput({
      lesson_status: LESSON_STATUS_CONFIRMED,
      professor_user_id: '',
      instructor_user_id: '',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/professor|instrutor/i);
  });

  it('accepts confirmed with only professor', () => {
    const r = validateLessonStaffConfirmInput({
      lesson_status: LESSON_STATUS_CONFIRMED,
      professor_user_id: 'u1',
      professor_name: 'Ana',
      instructor_user_id: '',
    });
    expect(r.ok).toBe(true);
  });

  it('accepts confirmed with multiple instructors only', () => {
    const r = validateLessonStaffConfirmInput({
      lesson_status: LESSON_STATUS_CONFIRMED,
      instructors: [
        { id: 'i1', name: 'Bruno' },
        { id: 'i2', name: 'Carla' },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it('rejects cancelled without reason', () => {
    const r = validateLessonStaffConfirmInput({
      lesson_status: LESSON_STATUS_CANCELLED,
      lesson_cancel_reason: '  ',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/motivo/i);
  });

  it('accepts cancelled with reason and clears staff expectation', () => {
    const r = validateLessonStaffConfirmInput({
      lesson_status: LESSON_STATUS_CANCELLED,
      lesson_cancel_reason: 'Feriado',
      professor_user_id: 'u1',
    });
    expect(r.ok).toBe(true);
  });
});

describe('buildLessonStaffCardBadge', () => {
  it('returns pending when no slot', () => {
        expect(buildLessonStaffCardBadge(null)).toMatchObject({
      tone: 'pending',
      shortLabel: 'Pendente',
      label: 'Confirmar equipe',
    });
  });

  it('returns ok with names when confirmed', () => {
    expect(
      buildLessonStaffCardBadge({
        lesson_status: LESSON_STATUS_CONFIRMED,
        professor_name: 'Ana',
        instructor_name: 'Beto',
      })
    ).toMatchObject({
      tone: 'ok',
      label: 'Ana · Beto',
      shortLabel: 'Confirmada',
    });
  });

  it('returns warn when cancelled', () => {
    expect(
      buildLessonStaffCardBadge({
        lesson_status: LESSON_STATUS_CANCELLED,
        lesson_cancel_reason: 'Feriado',
      })
    ).toMatchObject({
      tone: 'warn',
      label: 'Feriado',
      shortLabel: 'Não houve',
    });
  });
});

describe('buildLessonStaffPatch', () => {
  it('builds confirmed patch with denormalized names and audit', () => {
    const patch = buildLessonStaffPatch({
      lesson_status: LESSON_STATUS_CONFIRMED,
      professor_user_id: 'p1',
      professor_name: 'Prof A',
      instructor_user_id: 'i1',
      instructor_name: 'Inst B',
      recorded_by: 'r1',
      recorded_by_name: 'Recepção',
      recorded_at: '2026-09-08T12:00:00.000Z',
    });
    expect(patch).toMatchObject({
      lesson_status: LESSON_STATUS_CONFIRMED,
      professor_user_id: 'p1',
      professor_name: 'Prof A',
      instructor_user_id: 'i1',
      instructor_name: 'Inst B',
      lesson_cancel_reason: '',
      lesson_recorded_by: 'r1',
      lesson_recorded_by_name: 'Recepção',
      lesson_recorded_at: '2026-09-08T12:00:00.000Z',
    });
  });

  it('serializes multiple instructors with pipe-separated ids', () => {
    const patch = buildLessonStaffPatch({
      lesson_status: LESSON_STATUS_CONFIRMED,
      professor_user_id: 'p1',
      professor_name: 'Ana',
      instructors: [
        { id: 'i1', name: 'Bruno' },
        { id: 'i2', name: 'Carla' },
      ],
      recorded_by: 'r1',
      recorded_by_name: 'Recepção',
      recorded_at: '2026-09-08T12:00:00.000Z',
    });
    expect(patch.instructor_user_id).toBe('i1|i2');
    expect(patch.instructor_name).toBe('Bruno · Carla');
  });

  it('builds cancelled patch clearing staff ids', () => {
    const patch = buildLessonStaffPatch({
      lesson_status: LESSON_STATUS_CANCELLED,
      lesson_cancel_reason: 'Sem alunos',
      professor_user_id: 'p1',
      instructor_user_id: 'i1',
      recorded_by: 'r1',
      recorded_by_name: 'Carla',
      recorded_at: '2026-09-08T12:00:00.000Z',
    });
    expect(patch.lesson_status).toBe(LESSON_STATUS_CANCELLED);
    expect(patch.lesson_cancel_reason).toBe('Sem alunos');
    expect(patch.professor_user_id).toBe('');
    expect(patch.instructor_user_id).toBe('');
    expect(patch.professor_name).toBe('');
    expect(patch.instructor_name).toBe('');
  });
});

describe('aggregateLessonStaffTotals', () => {
  const slots = [
    {
      slot_date: '2026-09-01',
      time_start: '19:00',
      name: 'Kids',
      lesson_status: LESSON_STATUS_CONFIRMED,
      professor_user_id: 'p1',
      professor_name: 'Ana',
      instructor_user_id: 'i1',
      instructor_name: 'Bruno',
    },
    {
      slot_date: '2026-09-02',
      time_start: '20:00',
      name: 'Adultos',
      lesson_status: LESSON_STATUS_CONFIRMED,
      professor_user_id: 'p1',
      professor_name: 'Ana',
      instructor_user_id: '',
      instructor_name: '',
    },
    {
      slot_date: '2026-09-03',
      lesson_status: LESSON_STATUS_CANCELLED,
      professor_user_id: 'p1',
      instructor_user_id: 'i1',
    },
    {
      slot_date: '2026-09-04',
      lesson_status: LESSON_STATUS_PENDING,
      professor_user_id: 'p1',
    },
    {
      slot_date: '2026-09-05',
      lesson_status: LESSON_STATUS_CONFIRMED,
      professor_user_id: 'p1',
      professor_name: 'Ana',
      instructor_user_id: 'p1',
      instructor_name: 'Ana',
    },
  ];

  it('counts confirmed aulas by role; ignores cancelled and pending', () => {
    const { byUser, confirmedCount, cancelledCount } = aggregateLessonStaffTotals(slots);
    expect(confirmedCount).toBe(3);
    expect(cancelledCount).toBe(1);
    expect(byUser.get('p1')).toEqual({
      user_id: 'p1',
      name: 'Ana',
      as_professor: 3,
      as_instructor: 1,
    });
    expect(byUser.get('i1')).toEqual({
      user_id: 'i1',
      name: 'Bruno',
      as_professor: 0,
      as_instructor: 1,
    });
  });

  it('filters by user_id when provided', () => {
    const { byUser, detail } = aggregateLessonStaffTotals(slots, { userId: 'i1' });
    expect(byUser.size).toBe(1);
    expect(byUser.get('i1').as_instructor).toBe(1);
    expect(detail).toHaveLength(1);
  });

  it('counts each of multiple instructors on one aula', () => {
    const { byUser, confirmedCount } = aggregateLessonStaffTotals([
      {
        slot_date: '2026-09-10',
        lesson_status: LESSON_STATUS_CONFIRMED,
        professor_user_id: 'p1',
        professor_name: 'Ana',
        instructor_user_id: 'i1|i2',
        instructor_name: 'Bruno · Carla',
      },
    ]);
    expect(confirmedCount).toBe(1);
    expect(byUser.get('i1')?.as_instructor).toBe(1);
    expect(byUser.get('i2')?.as_instructor).toBe(1);
    expect(byUser.get('p1')?.as_professor).toBe(1);
  });
});

describe('buildLessonStaffCsvRows', () => {
  it('builds detail rows for export', () => {
    const rows = buildLessonStaffCsvRows([
      {
        slot_date: '2026-09-01',
        time_start: '19:00',
        time_end: '20:00',
        name: 'Kids',
        modality: 'Jiujitsu',
        lesson_status: LESSON_STATUS_CONFIRMED,
        professor_name: 'Ana',
        instructor_name: 'Bruno',
        lesson_cancel_reason: '',
      },
    ]);
    expect(rows[0]).toMatchObject({
      Data: '2026-09-01',
      Início: '19:00',
      Fim: '20:00',
      Aula: 'Kids',
      Modalidade: 'Jiujitsu',
      Status: 'Confirmada',
      Professor: 'Ana',
      Instrutores: 'Bruno',
      Motivo: '',
    });
  });
});
