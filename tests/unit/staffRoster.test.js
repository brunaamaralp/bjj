import { describe, expect, it } from 'vitest';
import {
  STAFF_ROLE_INSTRUCTOR,
  STAFF_ROLE_PROFESSOR,
  buildLessonStaffPickerOptions,
  decodeStaffRef,
  encodeStaffRef,
  isRosterTeamRole,
  mapStaffRosterDoc,
  normalizeStaffRosterRole,
  validateStaffRosterForm,
} from '../../lib/staffRoster.js';

describe('staffRoster roles', () => {
  it('normalizes professor/instructor labels', () => {
    expect(normalizeStaffRosterRole('Professor')).toBe(STAFF_ROLE_PROFESSOR);
    expect(normalizeStaffRosterRole('instrutor')).toBe(STAFF_ROLE_INSTRUCTOR);
    expect(normalizeStaffRosterRole('admin')).toBe('');
  });

  it('detects roster roles for equipe form', () => {
    expect(isRosterTeamRole('professor')).toBe(true);
    expect(isRosterTeamRole('instructor')).toBe(true);
    expect(isRosterTeamRole('receptionist')).toBe(false);
  });
});

describe('validateStaffRosterForm', () => {
  it('requires name and role', () => {
    expect(validateStaffRosterForm({ name: '', role: 'professor' }).valid).toBe(false);
    expect(validateStaffRosterForm({ name: 'Ana', role: 'admin' }).valid).toBe(false);
    expect(validateStaffRosterForm({ name: 'Ana', role: 'professor' }).valid).toBe(true);
  });
});

describe('staff refs', () => {
  it('encodes and decodes login/roster refs', () => {
    expect(encodeStaffRef({ kind: 'login', id: 'u1' })).toBe('login:u1');
    expect(encodeStaffRef({ kind: 'roster', id: 'd1' })).toBe('roster:d1');
    expect(decodeStaffRef('login:u1')).toEqual({ kind: 'login', id: 'u1' });
    expect(decodeStaffRef('roster:d1')).toEqual({ kind: 'roster', id: 'd1' });
    expect(decodeStaffRef('u1')).toEqual({ kind: 'login', id: 'u1' });
  });
});

describe('mapStaffRosterDoc', () => {
  it('maps document fields', () => {
    expect(
      mapStaffRosterDoc({
        $id: 'x',
        academy_id: 'a1',
        name: 'Bruno',
        role: 'instructor',
        is_active: true,
        sort_order: 2,
      })
    ).toMatchObject({
      id: 'x',
      academy_id: 'a1',
      name: 'Bruno',
      role: STAFF_ROLE_INSTRUCTOR,
      is_active: true,
      sort_order: 2,
    });
  });
});

describe('buildLessonStaffPickerOptions', () => {
  it('merges login members and active roster with stable ids', () => {
    const opts = buildLessonStaffPickerOptions({
      teamMembers: [{ id: 'u1', nome: 'Carla' }],
      roster: [
        { id: 'r1', name: 'Ana', role: 'professor', is_active: true },
        { id: 'r2', name: 'Old', role: 'instructor', is_active: false },
      ],
    });
    expect(opts).toEqual([
      { id: 'roster:r1', nome: 'Ana', source: 'roster', role: 'professor' },
      { id: 'login:u1', nome: 'Carla', source: 'login', role: 'login' },
    ]);
  });
});
