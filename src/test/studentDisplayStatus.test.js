import { describe, it, expect } from 'vitest';
import { resolveStudentListStatus } from '../lib/studentDisplayStatus.js';

describe('resolveStudentListStatus', () => {
  const student = { status: 'Ativo', freeze_status: '' };

  it('covered no mês atual conta como pago', () => {
    expect(resolveStudentListStatus(student, { status: 'covered' })).toBe('pago');
    expect(resolveStudentListStatus(student, { key: 'covered' })).toBe('pago');
  });

  it('paid continua como pago', () => {
    expect(resolveStudentListStatus(student, { status: 'paid' })).toBe('pago');
  });

  it('pending continua como pendente', () => {
    expect(resolveStudentListStatus(student, { status: 'pending' })).toBe('pendente');
  });
});
