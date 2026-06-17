import { describe, it, expect } from 'vitest';
import { validateEnrollmentBirthDate } from './publicEnrollmentEnroll.js';

describe('validateEnrollmentBirthDate', () => {
  it('requires birthDate for Criança and Juniores', () => {
    expect(validateEnrollmentBirthDate({ type: 'Criança', birthDate: '' }).ok).toBe(false);
    expect(validateEnrollmentBirthDate({ type: 'Juniores', birthDate: '2015' }).code).toBe(
      'birth_date_required'
    );
    expect(validateEnrollmentBirthDate({ type: 'Criança', birthDate: '2015-03-10' }).ok).toBe(true);
  });

  it('allows empty birthDate for Adulto', () => {
    expect(validateEnrollmentBirthDate({ type: 'Adulto', birthDate: '' }).ok).toBe(true);
  });

  it('rejects invalid birthDate for Adulto when provided', () => {
    expect(validateEnrollmentBirthDate({ type: 'Adulto', birthDate: 'invalid' }).code).toBe(
      'birth_date_invalid'
    );
  });
});
