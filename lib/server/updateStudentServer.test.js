import { describe, it, expect } from 'vitest';
import {
  nlSanitizedToStudentPatch,
  mergeLeadPatchSafely,
  formatLeadUpdateEventText,
} from './updateStudentServer.js';

describe('updateStudentServer patch mapping', () => {
  it('maps birthDate to birth_date', () => {
    const patch = nlSanitizedToStudentPatch({ birthDate: '2010-05-01', cpf: '12345678901' });
    expect(patch.birth_date).toBe('2010-05-01');
    expect(patch.cpf).toBe('12345678901');
  });
});

describe('mergeLeadPatchSafely', () => {
  const lead = { name: '37999999999', phone: '37999999999', age: '', type: '' };

  it('fills empty fields', () => {
    const patch = { name: 'Manuela', age: '6', type: 'Criança' };
    const { applied, skipped } = mergeLeadPatchSafely(lead, patch);
    expect(applied).toEqual({ name: 'Manuela', age: '6', type: 'Criança' });
    expect(skipped).toEqual([]);
  });

  it('does not overwrite confirmed name', () => {
    const existing = { name: 'João Silva', age: '10' };
    const { applied, skipped } = mergeLeadPatchSafely(existing, { name: 'Pedro' });
    expect(applied).toEqual({});
    expect(skipped).toContain('name');
  });

  it('replaces phone-as-name placeholder', () => {
    const { applied } = mergeLeadPatchSafely(lead, { name: 'Manuela' });
    expect(applied.name).toBe('Manuela');
  });
});

describe('formatLeadUpdateEventText', () => {
  it('lists applied fields in Portuguese', () => {
    const text = formatLeadUpdateEventText({ name: 'Manuela', age: '6' });
    expect(text).toContain('Manuela');
    expect(text).toContain('6');
  });
});
