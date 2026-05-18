import { describe, it, expect } from 'vitest';
import { defaultEnrollmentDateIso } from '../lib/studentEnrollmentDate.js';

describe('defaultEnrollmentDateIso', () => {
  it('usa enrollmentDate existente', () => {
    expect(defaultEnrollmentDateIso({ enrollmentDate: '2024-03-15' })).toBe('2024-03-15');
  });

  it('usa createdAt quando ingresso vazio', () => {
    expect(defaultEnrollmentDateIso({ createdAt: '2025-01-20T10:00:00.000Z' })).toBe('2025-01-20');
  });
});
