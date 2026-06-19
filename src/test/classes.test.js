import { describe, it, expect } from 'vitest';
import {
  buildClassPayload,
  formatCapacityLabel,
  mapClassDoc,
  mergeScheduleWithClass,
  validateClassForm,
} from '../lib/classes.js';

describe('classes lib', () => {
  it('mapClassDoc normalizes Appwrite document', () => {
    const mapped = mapClassDoc({
      $id: 'class-1',
      academy_id: 'acad-1',
      name: ' Adulto ',
      modality: 'bjj',
      instructor: 'Prof. Silva',
      max_capacity: 20,
      sort_order: 2,
      is_active: true,
    });
    expect(mapped).toMatchObject({
      id: 'class-1',
      name: 'Adulto',
      modality: 'bjj',
      max_capacity: 20,
      sort_order: 2,
      is_active: true,
    });
  });

  it('validateClassForm rejects missing name/modality and invalid capacity', () => {
    const empty = validateClassForm({});
    expect(empty.valid).toBe(false);
    expect(empty.errors.name).toBeTruthy();
    expect(empty.errors.modality).toBeTruthy();

    const badCap = validateClassForm({ name: 'Kids', modality: 'kids', max_capacity: 0 });
    expect(badCap.valid).toBe(false);
    expect(badCap.errors.max_capacity).toMatch(/1 e 200/);
  });

  it('buildClassPayload clamps capacity and keeps null when empty', () => {
    const withCap = buildClassPayload(
      { name: 'Noite', modality: 'bjj', max_capacity: 250 },
      'acad-1'
    );
    expect(withCap.max_capacity).toBe(200);
    expect(withCap.academy_id).toBe('acad-1');

    const noCap = buildClassPayload({ name: 'Livre', modality: 'bjj', max_capacity: '' }, 'acad-1');
    expect(noCap.max_capacity).toBeNull();
  });

  it('mergeScheduleWithClass inherits turma fields when schedule omits them', () => {
    const merged = mergeScheduleWithClass(
      { days_of_week: ['mon'], time_start: '19:00', time_end: '20:00' },
      {
        id: 'class-1',
        name: 'Adulto Noite',
        modality: 'bjj',
        instructor: 'Prof. A',
        level: 'Todos',
        max_capacity: 15,
      }
    );
    expect(merged).toMatchObject({
      class_id: 'class-1',
      name: 'Adulto Noite',
      modality: 'bjj',
      instructor: 'Prof. A',
      level: 'Todos',
      max_capacity: 15,
    });
  });

  it('formatCapacityLabel handles unlimited and numeric values', () => {
    expect(formatCapacityLabel(null)).toBe('Ilimitado');
    expect(formatCapacityLabel(20)).toBe('até 20 alunos');
  });
});
