import { describe, expect, it, vi } from 'vitest';
import {
  validateProfileCpf,
  validateProfileEmail,
  validateProfileName,
  validateProfilePhone,
} from '../lib/profileFieldValidation.js';
import { canEditProfileRole } from '../lib/profilePermissions.js';
import { logProfileFieldUpdate, PROFILE_FIELD_EVENT_TYPE } from '../lib/profileFieldAudit.js';

describe('profileFieldValidation', () => {
  it('valida nome obrigatório', () => {
    expect(validateProfileName('')).toBe('Informe o nome.');
    expect(validateProfileName('Ana')).toBeNull();
  });

  it('valida telefone', () => {
    expect(validateProfilePhone('')).toBeNull();
    expect(validateProfilePhone('', { required: true })).toBe('Informe o telefone.');
    expect(validateProfilePhone('1199999')).toBe('Telefone inválido — mínimo 10 dígitos.');
    expect(validateProfilePhone('(11) 98888-7777')).toBeNull();
  });

  it('valida e-mail', () => {
    expect(validateProfileEmail('invalido')).toBe('E-mail inválido.');
    expect(validateProfileEmail('a@b.com')).toBeNull();
  });

  it('valida CPF', () => {
    expect(validateProfileCpf('')).toBeNull();
    expect(validateProfileCpf('11111111111')).toBe('CPF inválido.');
  });
});

describe('profilePermissions', () => {
  it('só owner e admin editam perfil', () => {
    expect(canEditProfileRole('owner')).toBe(true);
    expect(canEditProfileRole('admin')).toBe(true);
    expect(canEditProfileRole('member')).toBe(false);
    expect(canEditProfileRole('guest')).toBe(false);
  });
});

describe('profileFieldAudit', () => {
  it('não grava evento quando valor não mudou', async () => {
    const addLeadEvent = vi.fn();
    vi.doMock('../src/lib/leadEvents.js', () => ({ addLeadEvent }));
    const result = await logProfileFieldUpdate({
      academyId: 'a1',
      leadId: 'l1',
      field: 'name',
      fieldLabel: 'Nome',
      from: 'Ana',
      to: 'Ana',
    });
    expect(result).toBeNull();
  });

  it('expõe tipo de evento de auditoria', () => {
    expect(PROFILE_FIELD_EVENT_TYPE).toBe('profile_field_updated');
  });
});
