import { describe, expect, it } from 'vitest';
import {
  resolveSaleMirrorBankAccountForPayment,
  validateAndNormalizeSalePayment,
} from '../../lib/server/salePaymentRules.js';

const financeConfig = {
  bankAccounts: [
    { bankName: 'Stone', account: '111' },
    { bankName: 'PagBank', account: '222' },
    { bankName: 'Caixa PIX', account: '333' },
  ],
  paymentMethodSettings: {
    pix: { active: true, defaultBankAccountLabel: 'Caixa PIX · 333' },
    cartao_credito: { active: true, defaultBankAccountLabel: 'PagBank · 222' },
    cartao_debito: { active: true, defaultBankAccountLabel: 'PagBank · 222' },
  },
  captureMethods: [
    {
      id: 'cap_credit',
      name: 'Stone Credito',
      paymentMethod: 'cartao_credito',
      active: true,
      maxInstallments: 3,
      bankAccountLabel: 'Stone · 111',
      useDefaultFees: false,
      fees: {
        '1': { percent: 2.5, fixed: 0, creditDays: 1 },
        '2': { percent: 3, fixed: 0, creditDays: 15 },
        '3': { percent: 3.5, fixed: 0, creditDays: 30 },
      },
    },
    {
      id: 'cap_credit_2',
      name: 'PagBank Credito',
      paymentMethod: 'cartao_credito',
      active: true,
      maxInstallments: 12,
      bankAccountLabel: 'PagBank · 222',
      useDefaultFees: false,
      fees: { '1': { percent: 2, fixed: 0, creditDays: 1 } },
    },
  ],
};

describe('salePaymentRules', () => {
  it('rejeita capture_method_id invalido para cartao', () => {
    const result = validateAndNormalizeSalePayment(financeConfig, {
      forma: 'cartao_credito',
      valor: 300,
      installments: 2,
      capture_method_id: 'cap_missing',
    });

    expect(result).toMatchObject({
      ok: false,
      error: 'invalid_capture_method',
      capture_method_id: 'cap_missing',
    });
  });

  it('infere o unico meio ativo e aplica maxInstallments', () => {
    const singleCaptureConfig = {
      ...financeConfig,
      captureMethods: [financeConfig.captureMethods[0]],
    };

    const result = validateAndNormalizeSalePayment(singleCaptureConfig, {
      forma: 'cartao_credito',
      valor: 300,
      installments: 4,
    });

    expect(result).toMatchObject({
      ok: false,
      error: 'installments_exceeds_capture_max',
      capture_method_id: 'cap_credit',
      max_installments: 3,
    });
  });

  it('exige meio de captura quando ha mais de um ativo', () => {
    const result = validateAndNormalizeSalePayment(financeConfig, {
      forma: 'cartao_credito',
      valor: 300,
      installments: 2,
    });

    expect(result).toMatchObject({
      ok: false,
      error: 'capture_method_required',
    });
  });

  it('resolve bank_account pelo meio de captura antes do default do metodo', () => {
    const label = resolveSaleMirrorBankAccountForPayment(financeConfig, {
      forma: 'cartao_credito',
      capture_method_id: 'cap_credit',
    });

    expect(label).toBe('Stone · 111');
  });

  it('resolve bank_account pelo default do metodo quando nao ha meio de captura', () => {
    const label = resolveSaleMirrorBankAccountForPayment(financeConfig, {
      forma: 'pix',
    });

    expect(label).toBe('Caixa PIX · 333');
  });
});
