import { describe, it, expect } from 'vitest';
import {
  inboxPhoneLookupVariants,
  inboxPhonesMatch,
  normalizeInboxPhone,
  primaryInboxPhone,
} from '../lib/normalizeInboxPhone.js';

describe('normalizeInboxPhone', () => {
  it('gera variantes com e sem DDI 55', () => {
    expect(inboxPhoneLookupVariants('11988887777')).toEqual(['11988887777', '5511988887777']);
    expect(inboxPhoneLookupVariants('5511988887777')).toEqual(['5511988887777', '11988887777']);
  });

  it('primaryInboxPhone adiciona 55 em números BR locais', () => {
    expect(primaryInboxPhone('(11) 98888-7777')).toBe('5511988887777');
    expect(primaryInboxPhone('5511988887777')).toBe('5511988887777');
    expect(normalizeInboxPhone('5511988887777')).toBe('5511988887777');
  });

  it('inboxPhonesMatch reconcilia lead local com conversa internacional', () => {
    expect(inboxPhonesMatch('11988887777', '5511988887777')).toBe(true);
    expect(inboxPhonesMatch('5511999999999', '11999999999')).toBe(true);
    expect(inboxPhonesMatch('21999999999', '5511888888888')).toBe(false);
  });
});
