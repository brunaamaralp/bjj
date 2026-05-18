import { describe, it, expect } from 'vitest';
import {
  formatBankAccountLabel,
  validateBankAccountForPayment,
  listBankAccountLabels,
} from '../lib/bankAccounts.js';

describe('bankAccounts', () => {
  it('formata rótulo banco + conta', () => {
    expect(formatBankAccountLabel({ bankName: 'Nubank', account: '12345-6' })).toBe('Nubank · 12345-6');
  });

  it('exige conta cadastrada quando há opções', () => {
    const cfg = { bankAccounts: [{ bankName: 'Sicoob', account: '1' }] };
    expect(validateBankAccountForPayment('', cfg).ok).toBe(false);
    expect(validateBankAccountForPayment('Sicoob · 1', cfg).ok).toBe(true);
    expect(listBankAccountLabels(cfg)).toEqual(['Sicoob · 1']);
  });
});
