import { describe, it, expect } from 'vitest';
import {
  normalizeStudentStatus,
  isStudentRecord,
  isActiveStudent,
  isInactiveStudent,
  filterStudentsByStatus,
  STUDENT_STATUS,
} from '../lib/studentStatus.js';
import { parseStudentExitReasons, DEFAULT_STUDENT_EXIT_REASONS } from '../lib/studentExitConfig.js';
import {
  parseOffboardingChecklist,
  serializeOffboardingChecklist,
  DEFAULT_OFFBOARDING_CHECKLIST,
} from '../lib/studentOffboarding.js';

describe('studentStatus', () => {
  const activeStudent = {
    status: 'Matriculado',
    contact_type: 'student',
    studentStatus: 'active',
  };
  const inactiveStudent = {
    status: 'Matriculado',
    contact_type: 'student',
    studentStatus: 'inactive',
    exitReason: 'Inadimplência',
    exitDate: '2026-05-01',
  };
  const lead = { status: 'Novo', contact_type: 'lead' };

  it('normalizes status', () => {
    expect(normalizeStudentStatus('inactive')).toBe(STUDENT_STATUS.INACTIVE);
    expect(normalizeStudentStatus('')).toBe(STUDENT_STATUS.ACTIVE);
  });

  it('detects student records', () => {
    expect(isStudentRecord(activeStudent)).toBe(true);
    expect(isStudentRecord(lead)).toBe(false);
  });

  it('detects students collection docs with student_status', () => {
    const fromStudentsCol = { plan: 'Mensal', student_status: 'active' };
    expect(isStudentRecord(fromStudentsCol)).toBe(true);
    expect(isActiveStudent(fromStudentsCol)).toBe(true);
    expect(isActiveStudent({ plan: 'Mensal', student_status: 'inactive' })).toBe(false);
  });

  it('detects active vs inactive', () => {
    expect(isActiveStudent(activeStudent)).toBe(true);
    expect(isInactiveStudent(inactiveStudent)).toBe(true);
    expect(isActiveStudent(inactiveStudent)).toBe(false);
  });

  it('filters list by status toggle', () => {
    const list = [activeStudent, inactiveStudent, lead];
    expect(filterStudentsByStatus(list, false)).toHaveLength(1);
    expect(filterStudentsByStatus(list, true)).toHaveLength(1);
    expect(filterStudentsByStatus(list, true)[0].studentStatus).toBe('inactive');
  });
});

describe('studentExitReasons', () => {
  it('returns defaults when empty', () => {
    expect(parseStudentExitReasons(null)).toEqual(DEFAULT_STUDENT_EXIT_REASONS);
  });

  it('parses custom list and ensures Outro', () => {
    const custom = parseStudentExitReasons(JSON.stringify(['Motivo A']));
    expect(custom).toContain('Motivo A');
    expect(custom.some((r) => r.toLowerCase() === 'outro')).toBe(true);
  });
});

describe('studentOffboardingChecklist', () => {
  it('returns defaults when empty', () => {
    expect(parseOffboardingChecklist(null)).toEqual(DEFAULT_OFFBOARDING_CHECKLIST);
  });

  it('parses and serializes custom checklist', () => {
    const custom = ['Tarefa A', 'Tarefa B'];
    const raw = serializeOffboardingChecklist(custom);
    expect(parseOffboardingChecklist(raw)).toEqual(custom);
  });
});
