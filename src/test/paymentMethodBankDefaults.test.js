import { describe, it, expect } from 'vitest';
import {
  resolveInitialBankAccountForPayment,
  accountWhenPaymentMethodChanges,
  normalizeDefaultAccountByMethodMap,
} from '../lib/paymentMethodBankDefaults.js';
import {
  pickInitialBankAccountForPayment,
} from '../lib/paymentMethodBankDefaults.js';

const cfg = {
  bankAccounts: [
    { bankName: 'Banco do Brasil', account: '111' },
    { bankName: 'Caixinha' },
    { bankName: 'Sicoob', account: '222', isDefault: true },
  ],
  defaultAccountByMethod: {
    pix: 'Banco do Brasil · 111',
    dinheiro: 'Caixinha',
  },
};

describe('paymentMethodBankDefaults', () => {
  it('resolveInitialBankAccountForPayment — prioriza mapa do método', () => {
    expect(resolveInitialBankAccountForPayment(cfg, '', 'pix')).toBe('Banco do Brasil · 111');
    expect(resolveInitialBankAccountForPayment(cfg, 'Sicoob · 222', 'dinheiro')).toBe('Caixinha');
  });

  it('pickInitialBankAccountForPayment — reexport compatível', () => {
    expect(pickInitialBankAccountForPayment(cfg, '', 'pix')).toBe('Banco do Brasil · 111');
  });

  it('accountWhenPaymentMethodChanges — troca ao mudar método', () => {
    expect(accountWhenPaymentMethodChanges(cfg, 'pix')).toBe('Banco do Brasil · 111');
    expect(accountWhenPaymentMethodChanges(cfg, 'cartão_crédito')).toBe('Sicoob · 222');
  });

  it('normalizeDefaultAccountByMethodMap — remove contas inexistentes', () => {
    const out = normalizeDefaultAccountByMethodMap(
      { pix: 'Banco do Brasil · 111', dinheiro: 'Conta fantasma' },
      cfg
    );
    expect(out).toEqual({ pix: 'Banco do Brasil · 111' });
  });
});
