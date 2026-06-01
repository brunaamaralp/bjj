import { describe, it, expect } from 'vitest';
import {
  formatBankAccountLabel,
  validateBankAccountForPayment,
  resolveBankAccountForPayment,
  listBankAccountLabels,
  filterBankAccountsWithBank,
} from '../lib/bankAccounts.js';

describe('bankAccounts', () => {
  it('formata rótulo banco + conta', () => {
    expect(formatBankAccountLabel({ bankName: 'Nubank', account: '12345-6' })).toBe('Nubank · 12345-6');
  });

  it('remove contas sem banco na lista', () => {
    expect(
      filterBankAccountsWithBank([
        { bankName: 'Sicoob', account: '1' },
        { bankName: '', account: '2' },
        { bankName: '   ', branch: '1' },
      ])
    ).toEqual([{ bankName: 'Sicoob', account: '1' }]);
  });

  it('exige conta cadastrada quando há opções', () => {
    const cfg = { bankAccounts: [{ bankName: 'Sicoob', account: '1' }] };
    expect(validateBankAccountForPayment('Sicoob · 1', cfg).ok).toBe(true);
    expect(listBankAccountLabels(cfg)).toEqual(['Sicoob · 1']);
  });

  it('resolve conta vazia ou legada para a primeira cadastrada', () => {
    const cfg = { bankAccounts: [{ bankName: 'Sicoob', account: '1' }] };
    expect(resolveBankAccountForPayment('', cfg)).toBe('Sicoob · 1');
    expect(resolveBankAccountForPayment('Conta antiga', cfg)).toBe('Sicoob · 1');
    const check = validateBankAccountForPayment('', cfg);
    expect(check.ok).toBe(true);
    expect(check.account).toBe('Sicoob · 1');
  });
});
