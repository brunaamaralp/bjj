import { describe, expect, it } from 'vitest';
import {
  extractNlPhoneSearchDigits,
  isNlPhoneLookupQuery,
  isPagePhoneSearchQuery,
  normalizePhoneSearchDigits,
} from '../lib/phoneSearchQuery.js';

describe('phoneSearchQuery', () => {
  it('normaliza só dígitos', () => {
    expect(normalizePhoneSearchDigits('(11) 99988-7766')).toBe('11999887766');
    expect(normalizePhoneSearchDigits('')).toBe('');
  });

  it('página: trata query só de telefone com ≥4 dígitos', () => {
    expect(isPagePhoneSearchQuery('8877')).toBe(true);
    expect(isPagePhoneSearchQuery('(11) 99988')).toBe(true);
    expect(isPagePhoneSearchQuery('11 99988-7766')).toBe(true);
    expect(isPagePhoneSearchQuery('Ana')).toBe(false);
    expect(isPagePhoneSearchQuery('Ana 11')).toBe(false);
    expect(isPagePhoneSearchQuery('12')).toBe(false);
  });

  it('⌘K: exige ≥8 dígitos', () => {
    expect(extractNlPhoneSearchDigits('999')).toBe('');
    expect(extractNlPhoneSearchDigits('99998888')).toBe('99998888');
    expect(extractNlPhoneSearchDigits('quem é 11 99988-7766?')).toBe('11999887766');
    expect(extractNlPhoneSearchDigits('(11) 99988-7766')).toBe('11999887766');
  });

  it('⌘K: lookup só para busca, não para comandos de ação', () => {
    expect(isNlPhoneLookupQuery('(11) 99988-7766')).toBe(true);
    expect(isNlPhoneLookupQuery('quem é 11999887766')).toBe(true);
    expect(isNlPhoneLookupQuery('buscar lead 11999887766')).toBe(true);
    expect(isNlPhoneLookupQuery('criar lead João 11999887766')).toBe(false);
    expect(isNlPhoneLookupQuery('Deivid pagou 11999887766')).toBe(false);
  });
});
