import { describe, it, expect } from 'vitest';
import {
  extractBrazilNationalDigits,
  getBrazilMobileNational,
  isValidBrazilMobilePhone,
  normalizePhoneForAutentique,
} from '../../lib/contracts/normalizePhone.ts';

describe('normalizePhone BR', () => {
  it('aceita celular com 11 dígitos e +55', () => {
    expect(isValidBrazilMobilePhone('(19) 99999-9999')).toBe(true);
    expect(isValidBrazilMobilePhone('+5519999999999')).toBe(true);
    expect(normalizePhoneForAutentique('5511998765432')).toBe('+5511998765432');
  });

  it('normaliza celular antigo de 10 dígitos (insere 9)', () => {
    expect(getBrazilMobileNational('1987654321')).toBe('19987654321');
    expect(isValidBrazilMobilePhone('1987654321')).toBe(true);
    expect(normalizePhoneForAutentique('(19) 8765-4321')).toBe('+5519987654321');
  });

  it('não corrompe colagem com código 55', () => {
    expect(getBrazilMobileNational('5511998765432')).toBe('11998765432');
    expect(isValidBrazilMobilePhone('5511998765432')).toBe(true);
  });

  it('rejeita fixo', () => {
    expect(isValidBrazilMobilePhone('1933334444')).toBe(false);
    expect(normalizePhoneForAutentique('1933334444')).toBeUndefined();
  });

  it('extractBrazilNationalDigits', () => {
    expect(extractBrazilNationalDigits('+55 (19) 99999-9999')).toBe('19999999999');
  });
});
