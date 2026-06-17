import { describe, it, expect } from 'vitest';
import {
  findBankAccountByLabel,
  resolveAcquirerFeesForAccount,
  resolveAcquirerFeesForMethod,
  resolveAcquirerFeesForPayment,
  computeAcquirerFeeForPayment,
  mirrorAmountsForPaymentWithAccount,
  forecastInflowAmounts,
} from '../lib/resolveAcquirerFees.js';
import { acquirerFeePercent } from '../lib/acquirerFees.js';

const financeConfig = {
  acquirerFees: {
    pix: { percent: 0.5, fixed: 0 },
    debito: { percent: 1, fixed: 0 },
    credito_avista: { percent: 2, fixed: 0 },
    credito_parcelado: {
      '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0, '10': 0, '11': 0, '12': 0,
    },
    antecipacao: { percent: 0, fixed: 0 },
  },
  acquirerFeePolicy: 'absorb',
  bankAccounts: [
    {
      bankName: 'Sicoob',
      account: '12345',
      useDefaultAcquirerFees: false,
      acquirerFees: {
        pix: { percent: 0, fixed: 0 },
        debito: { percent: 1.49, fixed: 0 },
        credito_avista: { percent: 2.49, fixed: 0 },
        credito_parcelado: {
          '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0, '10': 0, '11': 0, '12': 0,
        },
        antecipacao: { percent: 0, fixed: 0 },
      },
    },
    {
      bankName: 'Pagbank',
      pixKey: 'loja@academia.com',
      useDefaultAcquirerFees: false,
      acquirerFees: {
        pix: { percent: 0.99, fixed: 0 },
        debito: { percent: 0, fixed: 0 },
        credito_avista: { percent: 0, fixed: 0 },
        credito_parcelado: {
          '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0, '10': 0, '11': 0, '12': 0,
        },
        antecipacao: { percent: 0, fixed: 0 },
      },
    },
  ],
  defaultAccountByMethod: {
    pix: 'Pagbank',
    cartao_debito: 'Sicoob · 12345',
  },
};

describe('resolveAcquirerFees', () => {
  it('findBankAccountByLabel encontra conta por rótulo', () => {
    const acc = findBankAccountByLabel(financeConfig, 'Sicoob · 12345');
    expect(acc?.bankName).toBe('Sicoob');
  });

  it('resolveAcquirerFeesForAccount usa global sem label', () => {
    const fees = resolveAcquirerFeesForAccount(financeConfig, '');
    expect(acquirerFeePercent(fees, 'cartao_debito')).toBe(1);
  });

  it('resolveAcquirerFeesForAccount usa taxas da conta Sicoob', () => {
    const fees = resolveAcquirerFeesForAccount(financeConfig, 'Sicoob · 12345');
    expect(acquirerFeePercent(fees, 'cartao_debito')).toBe(1.49);
  });

  it('resolveAcquirerFeesForAccount usa taxas PIX Pagbank', () => {
    const fees = resolveAcquirerFeesForAccount(financeConfig, 'Pagbank');
    expect(acquirerFeePercent(fees, 'pix')).toBe(0.99);
  });

  it('resolveAcquirerFeesForMethod usa conta padrão do método', () => {
    const fees = resolveAcquirerFeesForMethod(financeConfig, 'pix');
    expect(acquirerFeePercent(fees, 'pix')).toBe(0.99);
  });

  it('resolveAcquirerFeesForPayment prioriza conta explícita', () => {
    const fees = resolveAcquirerFeesForPayment(financeConfig, {
      bankAccount: 'Sicoob · 12345',
      method: 'pix',
    });
    expect(acquirerFeePercent(fees, 'pix')).toBe(0);
  });

  it('computeAcquirerFeeForPayment difere por conta no mesmo método', () => {
    const sicoob = computeAcquirerFeeForPayment({
      financeConfig,
      bankAccount: 'Sicoob · 12345',
      gross: 200,
      method: 'cartao_debito',
      installments: 1,
    });
    const pagbank = computeAcquirerFeeForPayment({
      financeConfig,
      bankAccount: 'Pagbank',
      gross: 200,
      method: 'pix',
      installments: 1,
    });
    expect(sicoob.fee).toBe(2.98);
    expect(pagbank.fee).toBe(1.98);
  });

  it('mirrorAmountsForPaymentWithAccount repassa taxa correta', () => {
    const { fee, net } = mirrorAmountsForPaymentWithAccount({
      financeConfig,
      bankAccount: 'Sicoob · 12345',
      gross: 200,
      method: 'cartao_debito',
      installments: 1,
    });
    expect(fee).toBe(2.98);
    expect(net).toBe(197.02);
  });

  it('forecastInflowAmounts usa conta informada', () => {
    const amounts = forecastInflowAmounts(200, 'cartao_debito', 1, financeConfig, undefined, 'Sicoob · 12345');
    expect(amounts.amount_gross).toBe(200);
    expect(amounts.amount).toBe(197.02);
    expect(amounts.acquirer_fee).toBe(2.98);
  });

  it('forecastInflowAmounts usa método padrão sem conta', () => {
    const amounts = forecastInflowAmounts(100, 'pix', 1, financeConfig);
    expect(amounts.amount).toBe(99.01);
  });
});
