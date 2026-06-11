import { describe, it, expect } from 'vitest';
import {
  findLocalLeadByPhone,
  findLocalStudentByPhone,
  normalizePhoneDedup,
  studentPhoneDuplicateError,
} from '../lib/studentPhoneDuplicate.js';

describe('studentPhoneDuplicate', () => {
  it('normaliza telefone com e sem DDI 55', () => {
    expect(normalizePhoneDedup('5537999123456')).toBe('37999123456');
    expect(normalizePhoneDedup('(37) 99912-3456')).toBe('37999123456');
  });

  it('encontra aluno ativo local pelo telefone', () => {
    const students = [
      { id: 's1', name: 'Douglas', phone: '37999123456', studentStatus: 'active' },
      { id: 's2', name: 'Inativo', phone: '37988887777', studentStatus: 'inactive' },
    ];
    expect(findLocalStudentByPhone(students, '5537999123456')?.id).toBe('s1');
    expect(findLocalStudentByPhone(students, '37988887777')).toBeNull();
  });

  it('encontra lead local e respeita excludeId', () => {
    const leads = [{ id: 'l1', name: 'Edson Jr', phone: '37977776666' }];
    expect(findLocalLeadByPhone(leads, '37977776666')?.id).toBe('l1');
    expect(findLocalLeadByPhone(leads, '37977776666', { excludeId: 'l1' })).toBeNull();
  });

  it('monta erro amigável de duplicata', () => {
    const err = studentPhoneDuplicateError({ name: 'Douglas de Freitas' });
    expect(err.code).toBe('phone_duplicate');
    expect(err.message).toContain('Douglas de Freitas');
  });
});
