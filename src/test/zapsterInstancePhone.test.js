import { describe, it, expect } from 'vitest';
import {
  extractPhoneFromZapsterInstance,
  formatWaPhoneDisplay,
  normalizeWaPhoneDigits,
} from '../../lib/zapsterInstancePhone.js';

describe('zapsterInstancePhone', () => {
  it('normaliza dígitos válidos', () => {
    expect(normalizeWaPhoneDigits('+55 (11) 98877-6655')).toBe('5511988776655');
    expect(normalizeWaPhoneDigits('123')).toBe('');
  });

  it('extrai de metadata.phone_number', () => {
    expect(
      extractPhoneFromZapsterInstance({
        status: 'connected',
        metadata: { phone_number: '+5587989075555' },
      })
    ).toBe('5587989075555');
  });

  it('extrai de owner.id numérico (não UUID)', () => {
    expect(
      extractPhoneFromZapsterInstance({
        owner: { id: '5511999887766' },
      })
    ).toBe('5511999887766');
  });

  it('extrai de jid WhatsApp', () => {
    expect(
      extractPhoneFromZapsterInstance({
        jid: '5511988776655@s.whatsapp.net',
      })
    ).toBe('5511988776655');
  });

  it('formata para exibição BR', () => {
    expect(formatWaPhoneDisplay('5511988776655')).toBe('+55 (11) 98877-6655');
  });
});
