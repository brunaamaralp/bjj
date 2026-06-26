import { describe, it, expect } from 'vitest';
import { resolveInviteEmail } from './portalAccess.js';

describe('resolveInviteEmail', () => {
  it('usa email do aluno adulto', () => {
    expect(resolveInviteEmail({ type: 'Adulto', email: 'a@x.com', email_responsavel: '' })).toEqual({
      email: 'a@x.com',
      relationship: 'self',
    });
  });

  it('usa email_responsavel para criança', () => {
    expect(resolveInviteEmail({ type: 'Criança', email: '', email_responsavel: 'pai@x.com' })).toEqual({
      email: 'pai@x.com',
      relationship: 'guardian',
    });
  });

  it('falha menor sem email responsável', () => {
    expect(() => resolveInviteEmail({ type: 'Criança', email_responsavel: '' })).toThrow(
      'guardian_email_required'
    );
  });

  it('falha adulto sem email', () => {
    expect(() => resolveInviteEmail({ type: 'Adulto', email: '' })).toThrow('student_email_required');
  });
});
