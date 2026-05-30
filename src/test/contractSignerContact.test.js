import { describe, it, expect } from 'vitest';
import {
  buildPrimarySignerFromLead,
  formatPhoneForSignerField,
  phoneAutentiquePreview,
  nationalPhoneDigits,
} from '../lib/contractSignerContact.js';

describe('contractSignerContact', () => {
  it('formata telefone do cadastro com máscara BR', () => {
    expect(formatPhoneForSignerField('5519999999999')).toBe('(19) 99999-9999');
    expect(formatPhoneForSignerField('19999999999')).toBe('(19) 99999-9999');
  });

  it('preview Autentique com +55', () => {
    expect(phoneAutentiquePreview('(19) 99999-9999')).toBe('+5519999999999');
  });

  it('monta signatário do lead com e-mail e telefone', () => {
    const s = buildPrimarySignerFromLead({
      name: 'João',
      email: ' joao@test.com ',
      phone: '+5511987654321',
    });
    expect(s.email).toBe('joao@test.com');
    expect(s.phone).toBe('(11) 98765-4321');
    expect(s.delivery_method).toBe('DELIVERY_METHOD_EMAIL');
    expect(nationalPhoneDigits(s.phone)).toBe('11987654321');
  });
});
