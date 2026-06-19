import { describe, it, expect } from 'vitest';
import {
  buildSchedulePayload,
  buildWeeklyScheduleGrid,
  isTimeEndAfterStart,
  mapScheduleDoc,
  normalizeDaysOfWeek,
  validateScheduleForm,
} from '../lib/schedules.js';

describe('schedules lib', () => {
  it('mapScheduleDoc normalizes Appwrite document', () => {
    const mapped = mapScheduleDoc({
      $id: 'sch1',
      academy_id: 'acad-1',
      class_id: 'class-1',
      name: ' Jiu Adulto ',
      modality: 'bjj',
      instructor: 'Prof. Silva',
      days_of_week: ['mon', 'wed', 'invalid'],
      time_start: '07:00',
      time_end: '08:30',
      level: 'Todos os níveis',
      max_capacity: 18,
      is_active: true,
    });
    expect(mapped).toMatchObject({
      id: 'sch1',
      class_id: 'class-1',
      name: 'Jiu Adulto',
      days_of_week: ['mon', 'wed'],
      max_capacity: 18,
      is_active: true,
    });
  });

  it('validateScheduleForm rejects missing fields and invalid times', () => {
    const empty = validateScheduleForm({});
    expect(empty.valid).toBe(false);
    expect(empty.errors.name).toBeTruthy();
    expect(empty.errors.class_id).toBeTruthy();
    expect(empty.errors.modality).toBeTruthy();
    expect(empty.errors.days_of_week).toBeTruthy();

    const badEnd = validateScheduleForm({
      class_id: 'class-1',
      name: 'Kids',
      modality: 'kids',
      days_of_week: ['sat'],
      time_start: '10:00',
      time_end: '09:00',
    });
    expect(badEnd.valid).toBe(false);
    expect(badEnd.errors.time_end).toMatch(/posterior/i);
  });

  it('isTimeEndAfterStart compares HH:MM', () => {
    expect(isTimeEndAfterStart('08:00', '09:00')).toBe(true);
    expect(isTimeEndAfterStart('09:00', '09:00')).toBe(false);
    expect(isTimeEndAfterStart('10:00', '09:59')).toBe(false);
  });

  it('buildSchedulePayload sets academy_id, class_id and defaults is_active', () => {
    const payload = buildSchedulePayload(
      {
        class_id: 'class-1',
        name: 'Noite',
        modality: 'bjj',
        days_of_week: ['tue', 'thu'],
        time_start: '19:00',
        time_end: '20:30',
        max_capacity: 30,
      },
      'academy-xyz'
    );
    expect(payload.academy_id).toBe('academy-xyz');
    expect(payload.class_id).toBe('class-1');
    expect(payload.is_active).toBe(true);
    expect(payload.max_capacity).toBe(30);
    expect(normalizeDaysOfWeek(payload.days_of_week)).toEqual(['tue', 'thu']);
  });

  it('buildWeeklyScheduleGrid groups active schedules by day and time', () => {
    const grid = buildWeeklyScheduleGrid([
      {
        id: 'a',
        is_active: true,
        name: 'Manhã',
        time_start: '07:00',
        time_end: '08:00',
        days_of_week: ['mon'],
      },
      {
        id: 'b',
        is_active: false,
        name: 'Inativo',
        time_start: '07:00',
        time_end: '08:00',
        days_of_week: ['mon'],
      },
      {
        id: 'c',
        is_active: true,
        name: 'Noite',
        time_start: '19:00',
        time_end: '20:00',
        days_of_week: ['mon', 'wed'],
      },
    ]);
    expect(grid.hasAny).toBe(true);
    expect(grid.rows).toHaveLength(2);
    expect(grid.rows[0].cells.mon).toHaveLength(1);
    expect(grid.rows[0].cells.mon[0].id).toBe('a');
    expect(grid.rows[1].cells.wed).toHaveLength(1);
    expect(grid.rows[1].cells.wed[0].id).toBe('c');
  });
});
