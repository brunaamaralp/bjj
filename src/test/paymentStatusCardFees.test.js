import { describe, it, expect } from 'vitest';
import { expectedAmountWithCardFee } from '../lib/paymentStatus.js';
import { canonicalPaymentMethodKey } from '../lib/paymentMethods.js';

const financeConfig = {
  plans: [{ name: 'Mensal', price: 200, applyCardFee: true }],
  cardFees: {
    credito_avista: { percent: 5 },
    debito: { percent: 2 },
    credito_parcelado: { '3': 8 },
  },
};

const student = { plan: 'Mensal' };

describe('canonicalPaymentMethodKey', () => {
  it('normaliza variantes do modal Mensalidades', () => {
    expect(canonicalPaymentMethodKey('cartão_crédito')).toBe('cartao_credito');
    expect(canonicalPaymentMethodKey('cartão_débito')).toBe('cartao_debito');
    expect(canonicalPaymentMethodKey('transferência')).toBe('transferencia');
  });

  it('mantém chaves canônicas', () => {
    expect(canonicalPaymentMethodKey('cartao_credito')).toBe('cartao_credito');
    expect(canonicalPaymentMethodKey('pix')).toBe('pix');
  });
});

describe('expectedAmountWithCardFee — métodos acentuados (Mensalidades)', () => {
  it('aplica taxa de crédito com cartão_crédito', () => {
    expect(expectedAmountWithCardFee(student, financeConfig, 'cartão_crédito', null, null)).toBe(210);
  });

  it('aplica taxa de débito com cartão_débito', () => {
    expect(expectedAmountWithCardFee(student, financeConfig, 'cartão_débito', null, null)).toBe(204);
  });

  it('paridade com variantes canônicas e legadas', () => {
    const accented = expectedAmountWithCardFee(student, financeConfig, 'cartão_crédito', null, null);
    expect(expectedAmountWithCardFee(student, financeConfig, 'cartao_credito', null, null)).toBe(accented);
    expect(expectedAmountWithCardFee(student, financeConfig, 'credito', null, null)).toBe(accented);
  });

  it('não aplica taxa em pix, dinheiro ou transferência', () => {
    expect(expectedAmountWithCardFee(student, financeConfig, 'pix', null, null)).toBe(200);
    expect(expectedAmountWithCardFee(student, financeConfig, 'dinheiro', null, null)).toBe(200);
    expect(expectedAmountWithCardFee(student, financeConfig, 'transferência', null, null)).toBe(200);
  });

  it('não aplica quando plano sem applyCardFee', () => {
    const cfg = {
      ...financeConfig,
      plans: [{ name: 'Mensal', price: 200, applyCardFee: false }],
    };
    expect(expectedAmountWithCardFee(student, cfg, 'cartão_crédito', null, null)).toBe(200);
  });

  it('retorna base quando taxa configurada é 0%', () => {
    const cfg = {
      ...financeConfig,
      cardFees: { credito_avista: { percent: 0 }, debito: { percent: 0 }, credito_parcelado: {} },
    };
    expect(expectedAmountWithCardFee(student, cfg, 'cartão_crédito', null, null)).toBe(200);
  });

  it('aplica taxa parcelada com credito_parcelado', () => {
    expect(expectedAmountWithCardFee(student, financeConfig, 'credito_parcelado', 3, null)).toBe(216);
  });

  it('aplica taxa parcelada com cartao_credito e installments >= 2', () => {
    expect(expectedAmountWithCardFee(student, financeConfig, 'cartao_credito', 3, null)).toBe(216);
    expect(expectedAmountWithCardFee(student, financeConfig, 'cartão_crédito', 3, null)).toBe(216);
  });
});
