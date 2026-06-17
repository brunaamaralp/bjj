import { describe, it, expect } from 'vitest';
import {
  captureMethodFeesToAcquirerFees,
  defaultCaptureMethod,
  findCaptureMethodById,
  hasConfiguredCaptureForMethod,
  listActiveCaptureMethods,
  normalizeCaptureMethod,
  normalizeCaptureMethodFees,
  readCaptureMethods,
  resolveCreditDaysForInstallment,
  resolveCaptureInstallmentFee,
} from '../lib/captureMethods.js';
import { acquirerFeePercent } from '../lib/acquirerFees.js';

const financeConfig = {
  acquirerFees: {
    pix: { percent: 0.5, fixed: 0 },
    debito: { percent: 1, fixed: 0 },
    credito_avista: { percent: 2, fixed: 0 },
    credito_parcelado: {
      '2': 3,
      '3': 0,
      '4': 0,
      '5': 0,
      '6': 0,
      '7': 0,
      '8': 0,
      '9': 0,
      '10': 0,
      '11': 0,
      '12': 0,
    },
    antecipacao: { percent: 0, fixed: 0 },
  },
  captureMethods: [
    {
      id: 'cap_stone',
      name: 'Stone',
      paymentMethod: 'cartao_credito',
      active: true,
      useDefaultFees: false,
      fees: {
        '1': { percent: 2.5, fixed: 0.5, creditDays: 1 },
        '3': { percent: 4, fixed: 0, creditDays: 30 },
      },
    },
    {
      id: 'cap_debit',
      name: 'Débito loja',
      paymentMethod: 'cartao_debito',
      active: true,
      useDefaultFees: false,
      fees: { '1': { percent: 1.2, fixed: 0, creditDays: 2 } },
    },
  ],
};

describe('captureMethods', () => {
  it('readCaptureMethods normaliza lista', () => {
    const list = readCaptureMethods(financeConfig);
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('Stone');
  });

  it('findCaptureMethodById', () => {
    expect(findCaptureMethodById(financeConfig, 'cap_stone')?.name).toBe('Stone');
    expect(findCaptureMethodById(financeConfig, 'missing')).toBeNull();
  });

  it('listActiveCaptureMethods filtra por método', () => {
    expect(listActiveCaptureMethods(financeConfig, 'cartao_credito')).toHaveLength(1);
    expect(listActiveCaptureMethods(financeConfig, 'pix')).toHaveLength(0);
  });

  it('normalizeCaptureMethodFees omite linhas zeradas', () => {
    const fees = normalizeCaptureMethodFees({
      '1': { percent: 1, fixed: 0, creditDays: 0 },
      '2': { percent: 0, fixed: 0, creditDays: 0 },
    });
    expect(Object.keys(fees)).toEqual(['1']);
  });

  it('captureMethodFeesToAcquirerFees mapeia crédito', () => {
    const cap = findCaptureMethodById(financeConfig, 'cap_stone');
    const acquirer = captureMethodFeesToAcquirerFees(cap, cap.fees);
    expect(acquirerFeePercent(acquirer, 'cartao_credito', 1)).toBe(2.5);
    expect(acquirerFeePercent(acquirer, 'cartao_credito', 3)).toBe(4);
  });

  it('captureMethodFeesToAcquirerFees mapeia débito', () => {
    const cap = findCaptureMethodById(financeConfig, 'cap_debit');
    const acquirer = captureMethodFeesToAcquirerFees(cap, cap.fees);
    expect(acquirerFeePercent(acquirer, 'cartao_debito')).toBe(1.2);
  });

  it('resolveCreditDaysForInstallment usa matriz do meio', () => {
    const cap = findCaptureMethodById(financeConfig, 'cap_stone');
    expect(resolveCreditDaysForInstallment(cap, 1)).toBe(1);
    expect(resolveCreditDaysForInstallment(cap, 3)).toBe(30);
  });

  it('resolveCreditDaysForInstallment retorna 0 com useDefaultFees', () => {
    const cap = { ...defaultCaptureMethod(), useDefaultFees: true, fees: { '1': { creditDays: 5 } } };
    expect(resolveCreditDaysForInstallment(cap, 1)).toBe(0);
  });

  it('resolveCaptureInstallmentFee inclui fixed', () => {
    const cap = findCaptureMethodById(financeConfig, 'cap_stone');
    expect(resolveCaptureInstallmentFee(cap, 1).fixed).toBe(0.5);
  });

  it('hasConfiguredCaptureForMethod retrocompat sem meios', () => {
    expect(hasConfiguredCaptureForMethod({ captureMethods: [] }, 'cartao_credito')).toBe(true);
  });

  it('hasConfiguredCaptureForMethod exige taxas quando meios ativos', () => {
    expect(hasConfiguredCaptureForMethod(financeConfig, 'cartao_credito')).toBe(true);
    const bad = {
      captureMethods: [
        normalizeCaptureMethod({
          id: 'x',
          name: 'X',
          paymentMethod: 'cartao_credito',
          active: true,
          useDefaultFees: false,
          fees: {},
        }),
      ],
    };
    expect(hasConfiguredCaptureForMethod(bad, 'cartao_credito')).toBe(false);
  });
});
