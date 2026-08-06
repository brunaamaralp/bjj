import { describe, it, expect } from 'vitest';
import {
  buildInstructorPayload,
  buildLessonRegisterPatch,
  hasLessonRegister,
  mapInstructorDoc,
  matchInstructorByName,
  validateInstructorForm,
  ymdForWeekdayInCurrentWeek,
} from '../lib/lessonRegister.js';

describe('ymdForWeekdayInCurrentWeek', () => {
  // Wednesday 2026-08-05 → week Mon 08-03 … Sun 08-09
  const today = '2026-08-05';

  it('returns today when weekday is today', () => {
    expect(ymdForWeekdayInCurrentWeek('wed', today)).toBe('2026-08-05');
  });

  it('returns Monday of current week', () => {
    expect(ymdForWeekdayInCurrentWeek('mon', today)).toBe('2026-08-03');
  });

  it('returns Sunday of current week', () => {
    expect(ymdForWeekdayInCurrentWeek('sun', today)).toBe('2026-08-09');
  });

  it('returns empty for invalid weekday', () => {
    expect(ymdForWeekdayInCurrentWeek('foo', today)).toBe('');
  });
});

describe('buildLessonRegisterPatch', () => {
  it('builds patch with instructor and notes', () => {
    const patch = buildLessonRegisterPatch({
      instructorId: 'inst1',
      instructorName: 'Ana Silva',
      notes: '  Substituição  ',
      recordedBy: 'u1',
      recordedByName: 'Recepção',
      recordedAt: '2026-08-05T12:00:00.000Z',
    });
    expect(patch).toEqual({
      instructor_id: 'inst1',
      instructor: 'Ana Silva',
      lesson_notes: 'Substituição',
      lesson_recorded_by: 'u1',
      lesson_recorded_by_name: 'Recepção',
      lesson_recorded_at: '2026-08-05T12:00:00.000Z',
    });
  });

  it('allows clearing notes and requires trim', () => {
    const patch = buildLessonRegisterPatch({
      instructorId: 'inst1',
      instructorName: 'Ana',
      notes: '   ',
      recordedBy: 'u1',
      recordedByName: 'X',
      recordedAt: '2026-08-05T12:00:00.000Z',
    });
    expect(patch.lesson_notes).toBe('');
  });
});

describe('hasLessonRegister', () => {
  it('is false for empty slot', () => {
    expect(hasLessonRegister({})).toBe(false);
    expect(hasLessonRegister(null)).toBe(false);
  });

  it('is true when recorded_at, instructor_id or notes present', () => {
    expect(hasLessonRegister({ lesson_recorded_at: '2026-08-05T12:00:00.000Z' })).toBe(true);
    expect(hasLessonRegister({ instructor_id: 'x' })).toBe(true);
    expect(hasLessonRegister({ lesson_notes: 'ok' })).toBe(true);
  });
});

describe('instructors helpers', () => {
  it('mapInstructorDoc maps fields', () => {
    expect(
      mapInstructorDoc({
        $id: 'i1',
        academy_id: 'a1',
        name: 'Carlos',
        is_active: true,
        sort_order: 2,
        $createdAt: '2026-01-01',
        $updatedAt: '2026-01-02',
      })
    ).toMatchObject({
      id: 'i1',
      academy_id: 'a1',
      name: 'Carlos',
      is_active: true,
      sort_order: 2,
    });
  });

  it('validateInstructorForm requires name', () => {
    expect(validateInstructorForm({ name: '' }).valid).toBe(false);
    expect(validateInstructorForm({ name: 'Ana' }).valid).toBe(true);
  });

  it('buildInstructorPayload normalizes', () => {
    expect(buildInstructorPayload({ name: '  Ana  ', is_active: false }, 'ac1')).toEqual({
      academy_id: 'ac1',
      name: 'Ana',
      is_active: false,
      sort_order: 0,
    });
  });

  it('matchInstructorByName is case-insensitive', () => {
    const list = [
      { id: '1', name: 'Ana Silva' },
      { id: '2', name: 'Bruno' },
    ];
    expect(matchInstructorByName(list, 'ana silva')?.id).toBe('1');
    expect(matchInstructorByName(list, 'ninguém')).toBeNull();
  });
});
