import { describe, it, expect } from 'vitest';
import { validateCardBrandForSubmit } from '../lib/captureMethodPaymentForm.js';
import { normalizeFeeReceiver } from '../lib/feeReceivers.js';

const pagbank = normalizeFeeReceiver({
  id: 'recv_pag',
  name: 'PagBank',
  useDefaultFees: false,
  fees: {
    pix: { percent: 0, fixed: 0 },
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

const financeConfig = {
  feeReceivers: [pagbank],
  defaultFeeReceiverId: pagbank.id,
  feeReceiversMigrated: true,
};

describe('validateCardBrandForSubmit', () => {
  it('null para pix', () => {
    expect(validateCardBrandForSubmit(financeConfig, { method: 'pix' })).toBeNull();
  });

  it('erro quando divergência e bandeira ausente', () => {
    expect(
      validateCardBrandForSubmit(financeConfig, {
        method: 'cartao_debito',
        installments: 1,
        feeReceiverId: 'recv_pag',
        cardBrand: '',
      })
    ).toMatch(/bandeira/i);
  });

  it('ok quando bandeira informada', () => {
    expect(
      validateCardBrandForSubmit(financeConfig, {
        method: 'cartao_debito',
        installments: 1,
        feeReceiverId: 'recv_pag',
        cardBrand: 'visa',
      })
    ).toBeNull();
  });
});
