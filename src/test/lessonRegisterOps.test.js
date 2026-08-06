import { describe, it, expect } from 'vitest';
import { mapSlotLessonFields } from '../../lib/server/lessonRegisterOps.js';
import { hasLessonRegister } from '../lib/lessonRegister.js';

describe('mapSlotLessonFields', () => {
  it('maps empty lesson fields', () => {
    expect(mapSlotLessonFields({ instructor: 'X' })).toEqual({
      instructor_id: '',
      lesson_notes: '',
      lesson_recorded_by: '',
      lesson_recorded_by_name: '',
      lesson_recorded_at: '',
      has_lesson_register: false,
    });
  });

  it('flags has_lesson_register when notes exist', () => {
    const mapped = mapSlotLessonFields({
      instructor_id: 'i1',
      lesson_notes: 'ok',
      lesson_recorded_at: '2026-08-05T12:00:00.000Z',
      lesson_recorded_by: 'u1',
      lesson_recorded_by_name: 'Ana',
    });
    expect(mapped.has_lesson_register).toBe(true);
    expect(mapped.instructor_id).toBe('i1');
    expect(hasLessonRegister(mapped)).toBe(true);
  });
});
