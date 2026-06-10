import { describe, it, expect } from 'vitest';
import { nlSanitizedToStudentPatch } from './updateStudentServer.js';

describe('updateStudentServer patch mapping', () => {
  it('maps birthDate to birth_date', () => {
    const patch = nlSanitizedToStudentPatch({ birthDate: '2010-05-01', cpf: '12345678901' });
    expect(patch.birth_date).toBe('2010-05-01');
    expect(patch.cpf).toBe('12345678901');
  });
});
