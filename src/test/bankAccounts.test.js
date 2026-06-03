import { describe, it, expect } from 'vitest';
import {
  pickInitialBankAccountForPayment,
  hasConfiguredBankAccounts,
  resolveDefaultBankAccountLabel,
} from '../lib/bankAccounts.js';

describe('bankAccounts — conta inicial no pagamento', () => {
  const twoAccounts = {
    bankAccounts: [
      { bankName: 'BB', account: '111' },
      { bankName: 'Nubank', account: '222', isDefault: true },
    ],
  };

  it('hasConfiguredBankAccounts', () => {
    expect(hasConfiguredBankAccounts({ bankAccounts: [] })).toBe(false);
    expect(hasConfiguredBankAccounts({ bankAccounts: [{ bankName: 'BB' }] })).toBe(true);
    expect(hasConfiguredBankAccounts({ bankAccounts: [{ pixKey: 'email@test.com' }] })).toBe(true);
  });

  it('pickInitialBankAccountForPayment — única conta', () => {
    const cfg = { bankAccounts: [{ bankName: 'Sicoob', account: '1' }] };
    expect(pickInitialBankAccountForPayment(cfg, '')).toBe('Sicoob · 1');
  });

  it('pickInitialBankAccountForPayment — usa conta padrão quando há várias', () => {
    expect(pickInitialBankAccountForPayment(twoAccounts, '')).toBe('Nubank · 222');
    expect(resolveDefaultBankAccountLabel(twoAccounts)).toBe('Nubank · 222');
  });

  it('pickInitialBankAccountForPayment — preferência do aluno se válida', () => {
    const cfg = {
      bankAccounts: [
        { bankName: 'BB', account: '111' },
        { bankName: 'Caixa', account: '222' },
      ],
    };
    expect(pickInitialBankAccountForPayment(cfg, 'BB · 111')).toBe('BB · 111');
  });

  it('pickInitialBankAccountForPayment — mapa método→conta tem prioridade', () => {
    const cfgWithMap = {
      bankAccounts: [
        { bankName: 'BB', account: '111' },
        { bankName: 'Caixa', account: '222' },
      ],
      defaultAccountByMethod: { pix: 'BB · 111' },
    };
    expect(pickInitialBankAccountForPayment(cfgWithMap, 'Caixa · 222', 'pix')).toBe('BB · 111');
  });
});
