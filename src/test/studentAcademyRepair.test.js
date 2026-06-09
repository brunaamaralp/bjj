import { describe, it, expect } from 'vitest';
import {
  isOrphanStudentDoc,
  studentAcademyFromDoc,
} from '../../lib/server/studentAcademyRepair.js';

describe('studentAcademyRepair', () => {
  it('detecta aluno sem academia', () => {
    expect(isOrphanStudentDoc({ name: 'Ana' })).toBe(true);
    expect(isOrphanStudentDoc({ academyId: 'ac1' })).toBe(false);
  });

  it('lê academyId ou academy_id', () => {
    expect(studentAcademyFromDoc({ academyId: 'a1' })).toBe('a1');
    expect(studentAcademyFromDoc({ academy_id: 'a2' })).toBe('a2');
  });
});
