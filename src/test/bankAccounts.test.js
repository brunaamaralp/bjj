import { describe, it, expect } from 'vitest';
import {
  hasConfiguredBankAccounts,
  resolveDefaultBankAccountLabel,
  isUsableBankAccount,
  normalizeBankAccountEntry,
  hasCustomAcquirerFees,
  usesDefaultAcquirerFees,
} from '../lib/bankAccounts.js';
import { pickInitialBankAccountForPayment } from '../lib/paymentMethodBankDefaults.js';

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

  it('isUsableBankAccount exige banco, conta ou PIX', () => {
    expect(isUsableBankAccount(normalizeBankAccountEntry({ branch: '1234' }))).toBe(false);
    expect(isUsableBankAccount(normalizeBankAccountEntry({ bankName: 'Nubank' }))).toBe(true);
    expect(isUsableBankAccount(normalizeBankAccountEntry({ pixKey: 'a@b.com' }))).toBe(true);
  });

  it('normalizeBankAccountEntry preserva taxas próprias da maquininha', () => {
    const raw = {
      bankName: 'Sicoob',
      account: '99',
      useDefaultAcquirerFees: false,
      acquirerFees: { debito: { percent: 1.5, fixed: 0 } },
    };
    const n = normalizeBankAccountEntry(raw);
    expect(usesDefaultAcquirerFees(n)).toBe(false);
    expect(hasCustomAcquirerFees(n)).toBe(true);
    expect(n.acquirerFees.debito.percent).toBe(1.5);
  });

  it('normalizeBankAccountEntry omite acquirerFees quando usa padrão', () => {
    const n = normalizeBankAccountEntry({ bankName: 'BB', account: '1', useDefaultAcquirerFees: true });
    expect(usesDefaultAcquirerFees(n)).toBe(true);
    expect(n.acquirerFees).toBeUndefined();
  });

  it('normalizeBankAccountEntry aceita campos legados de importação', () => {
    const n = normalizeBankAccountEntry({ name: 'Sicoob', conta: '12345-6', chavePix: 'a@b.com' });
    expect(n.bankName).toBe('Sicoob');
    expect(n.account).toBe('12345-6');
    expect(n.pixKey).toBe('a@b.com');
    expect(isUsableBankAccount(n)).toBe(true);
  });
});
