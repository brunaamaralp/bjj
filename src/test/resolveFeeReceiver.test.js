import { describe, it, expect } from 'vitest';
import {
  requiresCardBrandForPayment,
  computeFeeReceiverFeeForPayment,
  resolveFeeReceiverForPayment,
} from '../lib/resolveFeeReceiver.js';
import { normalizeFeeReceiver } from '../lib/feeReceivers.js';

const pagbank = normalizeFeeReceiver({
  id: 'recv_pag',
  name: 'PagBank',
  bankAccountLabel: 'Pagbank',
  useDefaultFees: false,
  fees: {
    pix: { percent: 0.99, fixed: 0 },
    debito: {
      default: { percent: 1.99, fixed: 0 },
      visa: { percent: 1.79, fixed: 0 },
      mastercard: { percent: 1.89, fixed: 0 },
    },
    credito_avista: { default: { percent: 0, fixed: 0 } },
    credito_parcelado: {},
    antecipacao: { percent: 0, fixed: 0 },
  },
});

const asaas = normalizeFeeReceiver({
  id: 'recv_asaas',
  name: 'Asaas',
  bankAccountLabel: 'Asaas',
  useDefaultFees: false,
  fees: {
    pix: { percent: 1.5, fixed: 0 },
    debito: { default: { percent: 2.5, fixed: 0 } },
    credito_avista: { default: { percent: 3.5, fixed: 0 } },
    credito_parcelado: {},
    antecipacao: { percent: 0, fixed: 0 },
  },
});

const financeConfig = {
  feeReceivers: [pagbank, asaas],
  defaultFeeReceiverId: pagbank.id,
  feeReceiversMigrated: true,
  acquirerFeePolicy: 'absorb',
  bankAccounts: [{ bankName: 'Pagbank', feeReceiverId: pagbank.id }],
};

describe('resolveFeeReceiver', () => {
  it('resolve recebedor por feeReceiverId', () => {
    const r = resolveFeeReceiverForPayment(financeConfig, { feeReceiverId: 'recv_asaas' });
    expect(r?.name).toBe('Asaas');
  });

  it('requiresCardBrand false quando só default', () => {
    expect(
      requiresCardBrandForPayment(financeConfig, {
        feeReceiverId: 'recv_asaas',
        method: 'cartao_debito',
        installments: 1,
      })
    ).toBe(false);
  });

  it('requiresCardBrand true com divergência PagBank débito', () => {
    expect(
      requiresCardBrandForPayment(financeConfig, {
        feeReceiverId: 'recv_pag',
        method: 'cartao_debito',
        installments: 1,
      })
    ).toBe(true);
  });

  it('computeFeeReceiverFeeForPayment usa bandeira visa', () => {
    const { fee, net } = computeFeeReceiverFeeForPayment({
      financeConfig,
      feeReceiverId: 'recv_pag',
      method: 'cartao_debito',
      installments: 1,
      cardBrand: 'visa',
      gross: 200,
    });
    expect(fee).toBe(3.58);
    expect(net).toBe(196.42);
  });
});
